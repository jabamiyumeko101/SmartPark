const $ = (s) => document.querySelector(s);
const state = { slots: [], sort: 'id', order: 'asc', search: '', timer: null };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(data.error || data.message || 'Request failed.');
  return data;
}
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('show');
  clearTimeout(state.timer); state.timer = setTimeout(() => el.classList.remove('show'), 3300);
}
function fmtTime(date) { return new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}).format(date); }
function ago(value) {
  const d = new Date(String(value).replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'JUST NOW'; if (mins < 60) return `${mins}M AGO`;
  const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}H AGO`;
  return `${Math.floor(hours / 24)}D AGO`;
}
async function loadDashboard() {
  const d = await api('/api/dashboard');
  $('#totalCount').textContent = String(d.total).padStart(2,'0');
  $('#availableCount').textContent = String(d.available).padStart(2,'0');
  $('#allocatedCount').textContent = String(d.allocated).padStart(2,'0');
  $('#waitingCount').textContent = String(d.waiting).padStart(2,'0');
  $('#queuePill').textContent = `${d.waiting} IN LINE`;
}
async function loadSlots() {
  state.slots = await api(`/api/slots?sort=${encodeURIComponent(state.sort)}&order=${state.order}`);
  renderSlots();
}
function renderSlots() {
  const term = state.search.trim().toUpperCase();
  let rows = state.slots;
  if (term) rows = rows.filter(s => s.id.toUpperCase().includes(term) || s.location.toUpperCase().includes(term) || (s.allocated_to || '').toUpperCase().includes(term));
  $('#inventoryCount').textContent = rows.length;
  $('#tableSummary').textContent = `SHOWING ${rows.length} OF ${state.slots.length} SPACES`;
  $('#slotsBody').innerHTML = rows.length ? rows.map(s => `<tr>
    <td>${esc(s.id)}</td><td>${esc(s.location)}</td>
    <td><span class="type-pill ${s.vehicle_type.toLowerCase()}">${esc(s.vehicle_type)}</span></td>
    <td><span class="distance">${Number(s.distance).toLocaleString('en-IN')} m</span></td>
    <td><span class="priority-number ${s.priority===1?'p1':''}">${String(s.priority).padStart(2,'0')}</span></td>
    <td><span class="status ${s.available?'available':'allocated'}">${s.available?'Available':'Allocated'}</span></td>
    <td><span class="assigned">${s.allocated_to ? esc(s.allocated_to) : '—'}</span></td>
    <td><div class="row-actions">${s.available ? `<button class="row-action" data-remove="${esc(s.id)}">Remove</button>` : `<button class="row-action" data-release="${esc(s.id)}">Release</button>`}</div></td>
  </tr>`).join('') : '<tr><td colspan="8" class="empty-cell">No matching spaces. Try another search.</td></tr>';
}
async function loadQueue() {
  const queue = await api('/api/waiting');
  $('#queuePill').textContent = `${queue.length} IN LINE`;
  $('#queueList').innerHTML = queue.length ? queue.map((v,i) => `<div class="queue-item"><span class="queue-rank">${String(i+1).padStart(2,'0')}</span><div><span class="queue-vehicle">${esc(v.vehicle_number)}</span><span class="queue-sub">${esc(v.vehicle_type)} · ${esc(v.preference)} preference</span></div><span class="queue-priority">P${v.priority}</span><button class="queue-remove" title="Remove from queue" data-queue-remove="${v.id}">×</button></div>`).join('') : '<div class="empty-state">No vehicles waiting. A rare moment of order.</div>';
}
async function loadActivity() {
  const events = await api('/api/activity');
  $('#activityList').innerHTML = events.length ? events.slice(0,6).map(e => `<div class="activity-item"><i class="activity-mark"></i><div><div class="activity-title">${esc(e.action)}</div><div class="activity-detail">${esc(e.details)}</div></div><span class="activity-time">${esc(ago(e.created_at))}</span></div>`).join('') : '<div class="empty-state">No activity recorded yet.</div>';
}
async function refresh() { try { await Promise.all([loadDashboard(),loadSlots(),loadQueue(),loadActivity()]); } catch(e) { toast(e.message, true); } }
$('#today').textContent = new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(new Date()).toUpperCase();
refresh();

$('#allocateForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true; btn.textContent = 'Finding best space…';
  try {
    const result = await api('/api/allocate',{method:'POST',body:JSON.stringify({
      vehicleNumber:$('#vehicleNumber').value, vehicleType:$('#vehicleType').value,
      priority:Number($('#priority').value), preference:$('#preference').value
    })});
    const box = $('#allocationResult'); box.hidden = false;
    if (result.waiting) { box.textContent = result.message; toast('No compatible space. Vehicle added to waiting queue.'); }
    else { box.innerHTML = `<strong>${esc(result.slot.id)}</strong> allocated to ${esc(result.slot.allocated_to)} · ${esc(result.slot.location)}, ${result.slot.distance} m away.`; toast(`Space ${result.slot.id} allocated successfully.`); $('#vehicleNumber').value=''; }
    await refresh();
  } catch(err) { toast(err.message,true); }
  finally { btn.disabled = false; btn.innerHTML = 'Find & allocate space <span>↗</span>'; }
});
$('#sortSelect').addEventListener('change', async e => { state.sort=e.target.value; await loadSlots(); });
$('#sortDirection').addEventListener('click', async () => { state.order=state.order==='asc'?'desc':'asc'; $('#sortDirection').textContent=state.order==='asc'?'↑':'↓'; await loadSlots(); });
$('#searchInput').addEventListener('keydown', async e => {
  if (e.key !== 'Enter') return;
  const term=e.currentTarget.value.trim(); state.search=term;
  if (!term) { $('#searchMessage').hidden=true; renderSlots(); return; }
  try {
    const found = await api(`/api/slots/${encodeURIComponent(term)}`);
    $('#searchMessage').hidden=false; $('#searchMessage').textContent=`Binary search found ${found.id} · ${found.location} · ${found.available?'Available':'Allocated'} · ${found.distance} m`;
    state.search=found.id; renderSlots();
  } catch(err) {
    $('#searchMessage').hidden=false; $('#searchMessage').textContent=`Binary search: no exact slot ID "${term}" found. Showing partial matches below.`;
    state.search=term; renderSlots();
  }
});
$('#searchInput').addEventListener('input', e => { if (!e.target.value.trim()) { state.search=''; $('#searchMessage').hidden=true; renderSlots(); } });
$('#slotsBody').addEventListener('click', async e => {
  const release=e.target.closest('[data-release]')?.dataset.release;
  const remove=e.target.closest('[data-remove]')?.dataset.remove;
  try {
    if (release) { const r=await api(`/api/release/${encodeURIComponent(release)}`,{method:'POST',body:'{}'}); toast(r.served?`${r.released} released. ${r.served.vehicle} assigned to ${r.served.slot} from queue.`:`Space ${r.released} released.`); await refresh(); }
    if (remove && confirm(`Remove space ${remove} from inventory?`)) { await api(`/api/slots/${encodeURIComponent(remove)}`,{method:'DELETE'}); toast(`Space ${remove} removed.`); await refresh(); }
  } catch(err) { toast(err.message,true); }
});
$('#queueList').addEventListener('click', async e => {
  const id=e.target.closest('[data-queue-remove]')?.dataset.queueRemove; if (!id) return;
  try { await api(`/api/waiting/${id}`,{method:'DELETE'}); toast('Vehicle removed from waiting queue.'); await refresh(); } catch(err) { toast(err.message,true); }
});
const dialog=$('#slotDialog');
$('#addSlotBtn').addEventListener('click',()=>dialog.showModal());
$('#closeDialog').addEventListener('click',()=>dialog.close());
$('#cancelDialog').addEventListener('click',()=>dialog.close());
$('#slotForm').addEventListener('submit',async e=>{
  e.preventDefault();
  try {
    const slot=await api('/api/slots',{method:'POST',body:JSON.stringify({id:$('#slotId').value,location:$('#slotLocation').value,vehicleType:$('#slotType').value,distance:Number($('#slotDistance').value),priority:Number($('#slotPriority').value)})});
    dialog.close(); e.target.reset(); toast(`Space ${slot.id} added to inventory.`); await refresh();
  } catch(err) { toast(err.message,true); }
});
$('#exportBtn').addEventListener('click',()=>{window.location.href='/api/export';});
$('#viewInventory').addEventListener('click',()=>$('#inventory').scrollIntoView({behavior:'smooth'}));
document.querySelectorAll('.nav-link').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));a.classList.add('active');}));
