const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { nanoid } = require('nanoid');
const { insertFile, TMP_DIR, FILES_DIR } = require('../db');
const { generateKey, generateIV, generateToken, createCipher, calculateBwLimit } = require('../utils/crypto');
const { sanitizeFilename } = require('../utils/sanitize');
const { startProcessing, endProcessing } = require('../services/stats');
const { acquireSlot, releaseSlot } = require('../services/queue');

const MAX_SIZE = 500 * 1024 * 1024;
const MAX_REQUESTS_PER_MIN = parseInt(process.env.RATE_LIMIT_PER_MIN || '20', 10);
const RATE_LIMIT_WINDOW = 60 * 1000;

const rateBuckets = new Map();

function getClientIp(req) {
  const xff = req.getHeader('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.getRemoteAddress ? req.getRemoteAddress().toString() : 'unknown';
}

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW;
  }
  bucket.count++;
  rateBuckets.set(ip, bucket);
  return bucket.count <= MAX_REQUESTS_PER_MIN;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(ip);
  }
}, RATE_LIMIT_WINDOW);

function compressXz(inputPath) {
  return new Promise((resolve, reject) => {
    execFile('xz', ['-9', '-c', inputPath], { maxBuffer: 600 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

function handleUpload(res, req) {
  res.onAborted(() => {});

  const ip = getClientIp(req);

  if (!checkRateLimit(ip)) {
    res.cork(() => {
      res.writeStatus('429 Too Many Requests');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }));
    });
    return;
  }

  acquireSlot().then((got) => {
    if (!got) {
      res.cork(() => {
        res.writeStatus('503 Service Unavailable');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Server busy. Try again in a moment.' }));
      });
      return;
    }

    const rawFilename = decodeURIComponent(req.getHeader('x-filename') || 'untitled');
    const filename = sanitizeFilename(rawFilename);
    let chunks = [];
    let totalSize = 0;
    let aborted = false;
    let released = false;

    const safeRelease = () => {
      if (!released) {
        released = true;
        releaseSlot();
      }
    };

    res.onAborted(() => {
      aborted = true;
      chunks = [];
      safeRelease();
    });

    res.onData((chunk, isLast) => {
      if (aborted) return;
      const arr = new Uint8Array(chunk.byteLength);
      arr.set(new Uint8Array(chunk));
      const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
      totalSize += buf.length;
      chunks.push(buf);

      if (totalSize > MAX_SIZE) {
        aborted = true;
        chunks = [];
        safeRelease();
        try {
          res.cork(() => {
            res.writeStatus('413 Payload Too Large');
            res.end(JSON.stringify({ error: 'File too large (max 500MB)' }));
          });
        } catch {}
        return;
      }

      if (isLast) {
        const data = Buffer.concat(chunks);
        chunks = [];

        setImmediate(() => {
          if (aborted) {
            safeRelease();
            return;
          }
          processFile(filename, totalSize, data, res).finally(() => {
            safeRelease();
          });
        });
      }
    }, true);
  });
}

async function processFile(filename, originalSize, data, res) {
  const id = nanoid(8);
  startProcessing(id);
  try {
    const key = generateKey();
    const iv = generateIV();
    const token = generateToken();
    const bwLimit = calculateBwLimit(originalSize);
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const sha256 = crypto.createHash('sha256').update(data).digest('hex');

    const tmpPath = path.join(TMP_DIR, `${id}.raw`);
    fs.writeFileSync(tmpPath, data);

    const compressedData = await compressXz(tmpPath);
    try { fs.unlinkSync(tmpPath); } catch {}

    const cipher = createCipher(key, iv);
    const encrypted = Buffer.concat([iv, cipher.update(compressedData), cipher.final()]);

    const encPath = path.join(FILES_DIR, `${id}.enc`);
    fs.writeFileSync(encPath, encrypted);

    const compSize = encrypted.length;
    const created = Date.now();

    await insertFile({
      id, name: filename, size: originalSize, compSize, sha256,
      key: key.toString('hex'), iv: iv.toString('hex'), token,
      bwLimit, created, expires,
    });

    console.log(`[upload] ${id}: "${filename}" (${formatBytes(originalSize)} → ${formatBytes(compSize)}) sha256=${sha256.slice(0, 12)}...`);
    endProcessing(id);

    try {
      res.cork(() => {
        res.writeStatus('200 OK');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          id, token, name: filename, size: originalSize, compSize,
          sha256, expires, url: `/d/${id}`,
        }));
      });
    } catch {}
  } catch (err) {
    console.error('[upload] processFile error:', err.message);
    endProcessing(id);
    try {
      res.cork(() => {
        res.writeStatus('500 Internal Server Error');
        res.end(JSON.stringify({ error: 'Processing failed' }));
      });
    } catch {}
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

module.exports = { handleUpload };
