const express = require('express');
const path = require('path');
const db = require('./database');
const { binarySearch, mergeSort, buildWaitingQueue } = require('./algorithms');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const log = db.prepare('INSERT INTO activity_log(action,details) VALUES (?,?)');
const allSlotsSorted = () => db.prepare('SELECT * FROM slots ORDER BY id COLLATE NOCASE ASC').all();
const slotById = id => binarySearch(allSlotsSorted(), id);
const cleanSlot = s => ({ ...s, available: Boolean(s.available) });

function dashboard() {
  const slots = db.prepare('SELECT * FROM slots').all();
  const waiting = db.prepare('SELECT COUNT(*) AS n FROM waiting_vehicles').get().n;
  const allocated = slots.filter(s => !s.available).length;
  return {
    total: slots.length, available: slots.length - allocated, allocated, waiting,
    utilization: slots.length ? Math.round(allocated / slots.length * 100) : 0,
    allocationSequence: db.prepare("SELECT id, location, allocated_to FROM slots WHERE available=0 ORDER BY updated_at DESC LIMIT 8").all()
  };
}

app.get('/api/dashboard', (req, res) => res.json(dashboard()));

app.get('/api/slots', (req, res) => {
  const sort = ['id','distance','location','priority'].includes(req.query.sort) ? req.query.sort : 'id';
  const direction = req.query.order === 'desc' ? -1 : 1;
  const slots = allSlotsSorted();
  const compare = {
    id: (a,b) => a.id.localeCompare(b.id, undefined, { numeric: true }),
    distance: (a,b) => a.distance - b.distance,
    location: (a,b) => a.location.localeCompare(b.location),
    priority: (a,b) => a.priority - b.priority || a.distance - b.distance
  }[sort];
  res.json(mergeSort(slots, (a,b) => direction * compare(a,b)).map(cleanSlot));
});

app.get('/api/slots/:id', (req, res) => {
  const slot = slotById(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });
  res.json(cleanSlot(slot));
});

app.post('/api/slots', (req, res) => {
  let { id, location, vehicleType = 'Any', distance, priority = 3 } = req.body || {};
  id = String(id || '').trim().toUpperCase();
  location = String(location || '').trim();
  distance = Number(distance);
  priority = Number(priority);
  if (!/^[A-Z0-9-]{2,12}$/.test(id) || !location || !Number.isFinite(distance) || distance < 0 || !Number.isInteger(priority) || priority < 1 || priority > 5) {
    return res.status(400).json({ error: 'Enter a valid slot ID, location, non-negative distance, and priority from 1 to 5.' });
  }
  try {
    db.prepare('INSERT INTO slots(id,location,vehicle_type,distance,priority) VALUES(?,?,?,?,?)').run(id, location, String(vehicleType), distance, priority);
    log.run('SLOT ADDED', `${id} added at ${location}.`);
    res.status(201).json(cleanSlot(slotById(id)));
  } catch (e) {
    res.status(409).json({ error: 'That slot ID already exists.' });
  }
});

app.delete('/api/slots/:id', (req, res) => {
  const slot = slotById(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });
  if (!slot.available) return res.status(409).json({ error: 'Release this slot before removing it.' });
  db.prepare('DELETE FROM slots WHERE id=?').run(slot.id);
  log.run('SLOT REMOVED', `${slot.id} removed from inventory.`);
  res.json({ success: true });
});

function allocateFor(vehicle) {
  const slots = db.prepare('SELECT * FROM slots WHERE available=1').all();
  const preference = vehicle.preference || 'Any';
  const compatible = slots.filter(s =>
    (s.vehicle_type === 'Any' || s.vehicle_type === vehicle.vehicle_type || s.vehicle_type === 'Car' && vehicle.vehicle_type === 'Car') &&
    (preference === 'Any' || s.vehicle_type === preference || s.vehicle_type === 'Any')
  );
  const ranked = mergeSort(compatible, (a,b) =>
    a.priority - b.priority || a.distance - b.distance || a.id.localeCompare(b.id)
  );
  const chosen = ranked[0];
  if (!chosen) return null;
  db.prepare('UPDATE slots SET available=0,allocated_to=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(vehicle.vehicle_number, chosen.id);
  log.run('SLOT ALLOCATED', `${chosen.id} assigned to ${vehicle.vehicle_number}.`);
  return slotById(chosen.id);
}

app.post('/api/allocate', (req, res) => {
  const vehicleNumber = String(req.body?.vehicleNumber || '').trim().toUpperCase();
  const vehicleType = String(req.body?.vehicleType || 'Car');
  const priority = Number(req.body?.priority ?? 3);
  const preference = String(req.body?.preference || 'Any');
  if (!/^[A-Z0-9 -]{3,15}$/.test(vehicleNumber) || !['Car','Bike','EV','Accessible'].includes(vehicleType) || !Number.isInteger(priority) || priority < 1 || priority > 5) {
    return res.status(400).json({ error: 'Enter a valid vehicle number, vehicle type, and priority from 1 to 5.' });
  }
  const result = allocateFor({ vehicle_number: vehicleNumber, vehicle_type: vehicleType, priority, preference });
  if (!result) {
    db.prepare('INSERT INTO waiting_vehicles(vehicle_number,vehicle_type,priority,preference) VALUES(?,?,?,?)').run(vehicleNumber, vehicleType, priority, preference);
    log.run('VEHICLE QUEUED', `${vehicleNumber} added to the waiting priority queue.`);
    return res.status(202).json({ waiting: true, message: 'No compatible slot is available. Vehicle added to the priority queue.' });
  }
  res.json({ waiting: false, slot: cleanSlot(result), dashboard: dashboard() });
});

app.post('/api/release/:id', (req, res) => {
  const slot = slotById(req.params.id);
  if (!slot) return res.status(404).json({ error: 'Slot not found.' });
  if (slot.available) return res.status(409).json({ error: 'This slot is already available.' });
  db.prepare('UPDATE slots SET available=1,allocated_to=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(slot.id);
  log.run('SLOT RELEASED', `${slot.id} released${slot.allocated_to ? ` by ${slot.allocated_to}` : ''}.`);
  const queueRows = db.prepare('SELECT * FROM waiting_vehicles ORDER BY id ASC').all();
  const ordered = buildWaitingQueue(queueRows);
  let served = null;
  for (const vehicle of ordered) {
    const candidate = allocateFor(vehicle);
    if (candidate) {
      db.prepare('DELETE FROM waiting_vehicles WHERE id=?').run(vehicle.id);
      log.run('QUEUE SERVED', `${vehicle.vehicle_number} assigned to ${candidate.id} from the priority queue.`);
      served = { vehicle: vehicle.vehicle_number, slot: candidate.id };
      break;
    }
  }
  res.json({ success: true, released: slot.id, served, dashboard: dashboard() });
});

app.post('/api/waiting', (req, res) => {
  const vehicleNumber = String(req.body?.vehicleNumber || '').trim().toUpperCase();
  const vehicleType = String(req.body?.vehicleType || 'Car');
  const priority = Number(req.body?.priority ?? 3);
  const preference = String(req.body?.preference || 'Any');
  if (!/^[A-Z0-9 -]{3,15}$/.test(vehicleNumber) || !['Car','Bike','EV','Accessible'].includes(vehicleType) || !Number.isInteger(priority) || priority < 1 || priority > 5) {
    return res.status(400).json({ error: 'Check vehicle number, type, and priority.' });
  }
  const info = db.prepare('INSERT INTO waiting_vehicles(vehicle_number,vehicle_type,priority,preference) VALUES(?,?,?,?)').run(vehicleNumber, vehicleType, priority, preference);
  log.run('VEHICLE QUEUED', `${vehicleNumber} added to the priority queue.`);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.delete('/api/waiting/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM waiting_vehicles WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Waiting vehicle not found.' });
  db.prepare('DELETE FROM waiting_vehicles WHERE id=?').run(item.id);
  log.run('QUEUE ENTRY REMOVED', `${item.vehicle_number} removed from the waiting queue.`);
  res.json({ success: true });
});

app.get('/api/waiting', (req, res) => {
  res.json(buildWaitingQueue(db.prepare('SELECT * FROM waiting_vehicles ORDER BY id ASC').all()));
});
app.get('/api/activity', (req, res) => {
  res.json(db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 30').all());
});
app.get('/api/export', (req, res) => {
  const rows = allSlotsSorted();
  const csv = ['id,location,vehicle_type,distance,available,priority,allocated_to', ...rows.map(s =>
    [s.id,s.location,s.vehicle_type,s.distance,s.available ? 'Available' : 'Allocated',s.priority,s.allocated_to || '']
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')
  )].join('\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename="smartpark-inventory.csv"');
  res.send(csv);
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html')));
app.listen(PORT, () => console.log(`SmartPark running at http://localhost:${PORT}`));
