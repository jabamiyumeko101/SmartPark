# Data Structures & Algorithms Mapping

## 1. Binary Search
The API fetches the inventory sorted by slot ID (`ORDER BY id COLLATE NOCASE`) and runs iterative binary search in `backend/algorithms.js`. The search endpoint is `GET /api/slots/:id`. Time complexity: **O(log n)** after obtaining the ordered list; database retrieval itself costs additional time.

## 2. Merge Sort
`mergeSort(items, compare)` is implemented from scratch. The inventory API uses it to sort by ID, distance, location, or priority. Time: **O(n log n)**; auxiliary space: **O(n)**.

## 3. Heap / Priority Queue
`PriorityQueue` is a binary min-heap. Waiting requests are ordered by ascending numeric priority (1 is highest); sequence number preserves first-in ordering when priorities tie. Enqueue/dequeue: **O(log n)**; peek: **O(1)**. The persisted waiting list is rebuilt into a heap when displayed or when a released space may serve the queue.

## 4. Allocation strategy
Available slots are filtered for vehicle-type and preference compatibility. The system ranks compatible candidates by slot priority, distance, then ID, and allocates the first candidate. This uses a sort and is **O(n log n)** for `n` compatible slots. A released slot triggers a check of the priority queue.

## 5. Database
- `slots`: slot inventory and current allocation.
- `waiting_vehicles`: requests waiting for a compatible space.
- `activity_log`: persistent event history.

SQLite is created automatically on first start. The UI never writes to the database directly; all changes pass through the Express API.
