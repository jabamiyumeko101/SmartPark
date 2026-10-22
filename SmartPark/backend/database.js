const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbDir = path.join(__dirname, '..', 'database');
fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'smartpark.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS slots (
  id TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'Any',
  distance REAL NOT NULL DEFAULT 0,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0,1)),
  priority INTEGER NOT NULL DEFAULT 3,
  allocated_to TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS waiting_vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT 'Car',
  priority INTEGER NOT NULL DEFAULT 3,
  preference TEXT NOT NULL DEFAULT 'Any',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const count = db.prepare('SELECT COUNT(*) AS n FROM slots').get().n;
if (count === 0) {
  const seed = [
    ['A-01','North entrance','Car',35,1,2],['A-02','North entrance','EV',42,1,1],
    ['A-03','North entrance','Car',48,0,2],['B-01','Central deck','Bike',64,1,3],
    ['B-02','Central deck','Car',72,1,2],['B-03','Central deck','EV',80,1,1],
    ['C-01','East wing','Car',95,1,3],['C-02','East wing','Accessible',102,1,1],
    ['C-03','East wing','Car',115,0,3],['D-01','South annex','Bike',140,1,3],
    ['D-02','South annex','Car',155,1,2],['D-03','South annex','EV',168,1,1]
  ];
  const insert = db.prepare('INSERT INTO slots (id,location,vehicle_type,distance,available,priority) VALUES (?,?,?,?,?,?)');
  const tx = db.transaction(rows => rows.forEach(r => insert.run(...r)));
  tx(seed);
  db.prepare('INSERT INTO activity_log(action,details) VALUES (?,?)').run('SYSTEM READY','Sample parking inventory initialized.');
}
module.exports = db;
