const knex = require('knex');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILES_DIR = path.join(DATA_DIR, 'files');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const DB_PATH = path.join(DATA_DIR, 'potocki.db');

[DATA_DIR, FILES_DIR, TMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const db = knex({
  client: 'better-sqlite3',
  connection: { filename: DB_PATH },
  useNullAsDefault: true,
  pool: { min: 1, max: 1 },
});

async function init() {
  await db.raw(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size INTEGER NOT NULL,
      comp_size INTEGER DEFAULT 0,
      sha256 TEXT NOT NULL,
      key TEXT NOT NULL,
      iv TEXT NOT NULL,
      token TEXT NOT NULL,
      bw_used INTEGER DEFAULT 0,
      bw_limit INTEGER NOT NULL,
      created INTEGER NOT NULL,
      expires INTEGER NOT NULL
    )
  `);
  await db.raw(`CREATE INDEX IF NOT EXISTS idx_expires ON files(expires)`);
  await db.raw(`CREATE INDEX IF NOT EXISTS idx_token ON files(token)`);
  await db.raw(`PRAGMA journal_mode = WAL`);
  await db.raw(`PRAGMA synchronous = NORMAL`);
}

const initPromise = init();

async function insertFile(row) {
  await db('files').insert({
    id: row.id,
    name: row.name,
    size: row.size,
    comp_size: row.compSize,
    sha256: row.sha256,
    key: row.key,
    iv: row.iv,
    token: row.token,
    bw_used: 0,
    bw_limit: row.bwLimit,
    created: row.created,
    expires: row.expires,
  });
}

async function getFileById(id) {
  const rows = await db('files').where({ id }).limit(1);
  return rows[0] || null;
}

async function getFileByToken(token) {
  const rows = await db('files').where({ token }).limit(1);
  return rows[0] || null;
}

async function addBandwidth(bytes, id) {
  await db('files').where({ id }).increment('bw_used', bytes);
}

async function deleteFileById(id) {
  await db('files').where({ id }).del();
}

async function getExpiredFiles(now) {
  return db('files')
    .where('expires', '<=', now)
    .orWhere('bw_used', '>=', db.ref('bw_limit'))
    .select('id');
}

async function getAllFiles() {
  return db('files').select('id', 'name', 'size', 'comp_size', 'bw_used', 'bw_limit', 'created', 'expires');
}

module.exports = {
  db,
  initPromise,
  insertFile,
  getFileById,
  getFileByToken,
  addBandwidth,
  deleteFileById,
  getExpiredFiles,
  getAllFiles,
  DATA_DIR,
  FILES_DIR,
  TMP_DIR,
};
