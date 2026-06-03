const { db } = require('../db');
const { getQueueStats } = require('./queue');

const processing = new Set();

function startProcessing(id) {
  processing.add(id);
}

function endProcessing(id) {
  processing.delete(id);
}

async function getStats() {
  const now = Date.now();
  const row = await db('files')
    .select(
      db.raw('COUNT(*) as total_uploads'),
      db.raw('COALESCE(SUM(size), 0) as bytes_uploaded'),
      db.raw('COALESCE(SUM(bw_used), 0) as bytes_downloaded'),
      db.raw('COALESCE(SUM(comp_size), 0) as bytes_compressed'),
      db.raw("COUNT(CASE WHEN expires > ? AND bw_used < bw_limit THEN 1 END) as active_files", [now]),
    )
    .first();

  const queue = getQueueStats();

  return {
    totalUploads: Number(row.total_uploads) || 0,
    bytesUploaded: Number(row.bytes_uploaded) || 0,
    bytesDownloaded: Number(row.bytes_downloaded) || 0,
    bytesCompressed: Number(row.bytes_compressed) || 0,
    activeFiles: Number(row.active_files) || 0,
    processing: processing.size,
    queueActive: queue.active,
    queuePending: queue.queued,
    queueCapacity: queue.capacity,
  };
}

function formatStatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

module.exports = { startProcessing, endProcessing, getStats, formatStatBytes };
