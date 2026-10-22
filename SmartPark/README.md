# SmartPark | Smart Parking Search & Allocation

A full-stack DSA mini project with a browser dashboard, Express API, and persistent SQLite database.

## Stack
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express
- Database: SQLite (`better-sqlite3`)
- DSA: binary search over sorted slot IDs, merge sort, min-heap priority queue

## Run locally
1. Install Node.js 18 or newer.
2. Open a terminal in the `SmartPark` folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

The database is created automatically at `database/smartpark.db` and seeded with sample slots on first launch. Data persists across restarts.

## Features
- Search a slot by exact ID using binary search on the sorted inventory.
- Allocate a suitable available slot, prioritizing accessible/EV preferences and then distance.
- Release allocated slots.
- Insert and remove slots.
- Sort by ID, distance, location, or priority.
- Priority queue for waiting vehicles; the highest-priority request is served first, then earlier requests.
- Activity log, allocation sequence, live dashboard counts, and CSV export.

## DSA mapping
| Requirement | Implementation | Complexity |
|---|---|---|
| Exact slot search | Binary search on sorted slot array | O(log n) |
| Sort slots | Merge sort | O(n log n) |
| Prioritize waiting vehicles | Binary min-heap priority queue | O(log n) enqueue/dequeue |
| Allocate nearest suitable slot | Filter available slots then rank by priority and distance | O(n) selection |
| Database persistence | SQLite tables: `slots`, `waiting_vehicles`, `activity_log` | Depends on query/index |

## API routes
- `GET /api/dashboard`
- `GET /api/slots?sort=id|distance|location|priority&order=asc|desc`
- `GET /api/slots/:id` (binary search)
- `POST /api/slots`
- `DELETE /api/slots/:id`
- `POST /api/allocate` body: `{ "vehicleNumber": "MH01AB1234", "vehicleType": "Car", "priority": 2, "preference": "Any" }`
- `POST /api/release/:id`
- `POST /api/waiting` (queue a vehicle)
- `DELETE /api/waiting/:id`
- `GET /api/activity`
- `GET /api/export` (CSV)

## Notes for submission
This is a demonstrable mini-project, not a production parking controller. The sample inventory is illustrative. For a real deployment, add authentication, role permissions, payment integration, sensor integration, migrations, and stronger input validation/rate limiting.
