// DSA implementations used by the API. No third-party sorting/heap library.

function binarySearch(sortedSlots, target) {
  let low = 0, high = sortedSlots.length - 1;
  const key = String(target).trim().toUpperCase();
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = String(sortedSlots[mid].id).toUpperCase();
    if (current === key) return sortedSlots[mid];
    if (current < key) low = mid + 1;
    else high = mid - 1;
  }
  return null;
}

function mergeSort(items, compare) {
  if (items.length <= 1) return items.slice();
  const mid = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, mid), compare);
  const right = mergeSort(items.slice(mid), compare);
  const out = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) out.push(left[i++]);
    else out.push(right[j++]);
  }
  return out.concat(left.slice(i), right.slice(j));
}

class PriorityQueue {
  constructor(compare = (a, b) => a.priority - b.priority || a.sequence - b.sequence) {
    this.heap = [];
    this.compare = compare;
  }
  get size() { return this.heap.length; }
  peek() { return this.heap[0] || null; }
  push(value) {
    this.heap.push(value);
    let i = this.heap.length - 1;
    while (i > 0) {
      const p = Math.floor((i - 1) / 2);
      if (this.compare(this.heap[i], this.heap[p]) >= 0) break;
      [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
      i = p;
    }
  }
  pop() {
    if (!this.heap.length) return null;
    const top = this.heap[0], last = this.heap.pop();
    if (this.heap.length) {
      this.heap[0] = last;
      let i = 0;
      while (true) {
        let best = i, left = i * 2 + 1, right = left + 1;
        if (left < this.heap.length && this.compare(this.heap[left], this.heap[best]) < 0) best = left;
        if (right < this.heap.length && this.compare(this.heap[right], this.heap[best]) < 0) best = right;
        if (best === i) break;
        [this.heap[i], this.heap[best]] = [this.heap[best], this.heap[i]];
        i = best;
      }
    }
    return top;
  }
}

function buildWaitingQueue(rows) {
  const q = new PriorityQueue();
  rows.forEach((r, i) => q.push({ ...r, sequence: i }));
  const ordered = [];
  while (q.size) ordered.push(q.pop());
  return ordered;
}

module.exports = { binarySearch, mergeSort, PriorityQueue, buildWaitingQueue };
