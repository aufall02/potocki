const MAX_CONCURRENT_UPLOADS = parseInt(process.env.MAX_CONCURRENT || '3', 10);
const MAX_QUEUE_DEPTH = parseInt(process.env.MAX_QUEUE || '20', 10);

let activeUploads = 0;
let queuedUploads = 0;
const queue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    const tryStart = () => {
      if (activeUploads < MAX_CONCURRENT_UPLOADS) {
        activeUploads++;
        resolve(true);
      } else if (queuedUploads < MAX_QUEUE_DEPTH) {
        queuedUploads++;
        queue.push(tryStart);
      } else {
        resolve(false);
      }
    };
    tryStart();
  });
}

function releaseSlot() {
  activeUploads--;
  if (queue.length > 0) {
    const next = queue.shift();
    queuedUploads--;
    activeUploads++;
    next();
  }
}

function getQueueStats() {
  return {
    active: activeUploads,
    queued: queuedUploads,
    capacity: MAX_CONCURRENT_UPLOADS,
    maxQueue: MAX_QUEUE_DEPTH,
  };
}

module.exports = { acquireSlot, releaseSlot, getQueueStats, MAX_CONCURRENT_UPLOADS, MAX_QUEUE_DEPTH };
