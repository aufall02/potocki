const fs = require('fs');
const path = require('path');
const { getExpiredFiles, deleteFileById, FILES_DIR } = require('../db');

const CLEANUP_INTERVAL = 5 * 60 * 1000;

async function cleanup() {
  const now = Date.now();
  const expired = await getExpiredFiles(now);
  for (const row of expired) {
    const encPath = path.join(FILES_DIR, `${row.id}.enc`);
    try {
      if (fs.existsSync(encPath)) fs.unlinkSync(encPath);
    } catch {}
    try {
      await deleteFileById(row.id);
    } catch {}
  }
  if (expired.length > 0) {
    console.log(`[cleanup] removed ${expired.length} expired file(s)`);
  }
}

function startCleanup() {
  cleanup();
  setInterval(cleanup, CLEANUP_INTERVAL);
  console.log('[cleanup] scheduler started (every 5 min)');
}

module.exports = { startCleanup, deleteFileById };
