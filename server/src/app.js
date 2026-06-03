const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { App } = require('uWebSockets.js');
const { handleUpload } = require('./handlers/upload');
const { handleDownload } = require('./handlers/download');
const { handleFileInfo, handleFileKey } = require('./handlers/api');
const { getFileById, initPromise } = require('./db');
const { startCleanup } = require('./services/cleanup');
const { getStats, formatStatBytes } = require('./services/stats');
const { sanitizeId } = require('./utils/sanitize');
const { VERSION } = require('./utils/version');

const PORT = parseInt(process.env.PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VIEWS_DIR = path.join(__dirname, '..', 'views');
const BASE_URL = process.env.BASE_URL || 'http://localhost:' + PORT;

let indexHtml = '';
let downloadTemplate = '';
let tosHtml = '';

function loadTemplates() {
  try {
    const indexTpl = fs.readFileSync(path.join(VIEWS_DIR, 'index.ejs'), 'utf8');
    indexHtml = ejs.render(indexTpl, { version: VERSION, baseUrl: BASE_URL });
    downloadTemplate = fs.readFileSync(path.join(VIEWS_DIR, 'download.ejs'), 'utf8');
    tosHtml = ejs.render(fs.readFileSync(path.join(VIEWS_DIR, 'tos.ejs'), 'utf8'), {});
  } catch (err) {
    console.error('[app] failed to load templates:', err.message);
    indexHtml = '<h1>potocki - template load error</h1>';
  }
}

function renderDownloadPage(file) {
  return ejs.render(downloadTemplate, {
    name: file.name,
    sizeStr: formatSize(file.size),
    compSizeStr: formatSize(file.comp_size),
    expiresDate: new Date(file.expires).toLocaleString(),
    bwPercent: ((file.bw_used / file.bw_limit) * 100).toFixed(1),
    sha256: file.sha256 || '',
    fid: file.id,
    baseUrl: BASE_URL,
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function handleUI(res) {
  res.cork(() => {
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(indexHtml);
  });
}

function handleTos(res) {
  res.cork(() => {
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(tosHtml);
  });
}

async function handleDownloadPage(res, req) {
  const rawId = req.getParameter(0);
  const id = sanitizeId(rawId);
  const file = await getFileById(id);

  if (!file) {
    res.cork(() => {
      res.writeStatus('404 Not Found');
      res.writeHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body style="background:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif"><div style="text-align:center"><h2 style="color:#e53e3e">File not found</h2><p style="color:#a0aec0">This file may have expired or been deleted.</p></div></body></html>');
    });
    return;
  }

  if (Date.now() > file.expires || file.bw_used >= file.bw_limit) {
    res.cork(() => {
      res.writeStatus('410 Gone');
      res.writeHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<html><body style="background:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif"><div style="text-align:center"><h2 style="color:#e53e3e">File expired</h2><p style="color:#a0aec0">This file has expired or its bandwidth limit has been reached.</p></div></body></html>');
    });
    return;
  }

  const html = renderDownloadPage(file);
  res.cork(() => {
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
}

function handleClientDownload(res) {
  const filePath = path.join(PUBLIC_DIR, 'bin', 'potocki-linux-amd64');
  if (!fs.existsSync(filePath)) {
    res.cork(() => { res.writeStatus('404 Not Found'); res.end('Client binary not found'); });
    return;
  }
  const stat = fs.statSync(filePath);
  const data = fs.readFileSync(filePath);
  res.cork(() => {
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/octet-stream');
    res.writeHeader('Content-Length', stat.size.toString());
    res.writeHeader('Content-Disposition', 'attachment; filename="potocki-linux-amd64"');
    res.end(data);
  });
}

async function handleStats(res) {
  try {
    const stats = await getStats();
    res.cork(() => {
      res.writeStatus('200 OK');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ...stats,
        bytesUploadedFmt: formatStatBytes(stats.bytesUploaded),
        bytesDownloadedFmt: formatStatBytes(stats.bytesDownloaded),
        bytesCompressedFmt: formatStatBytes(stats.bytesCompressed),
      }));
    });
  } catch (err) {
    console.error('[stats] error:', err.message);
    res.cork(() => {
      res.writeStatus('500 Internal Server Error');
      res.end(JSON.stringify({ error: 'Failed to fetch stats' }));
    });
  }
}

loadTemplates();

async function start() {
  await initPromise;
  console.log(`[potocki] v${VERSION} - database initialized`);

  App({})
    .get('/', handleUI)
    .get('/d/:id', handleDownloadPage)
    .get('/dl/:id', handleDownload)
    .get('/api/info/:id', handleFileInfo)
    .get('/api/key/:id', handleFileKey)
    .get('/api/stats', handleStats)
    .get('/bin', handleClientDownload)
    .post('/upload', handleUpload)
    .get('/tos', handleTos)
    .any('/*', (res) => {
      res.writeStatus('404 Not Found');
      res.end('not found');
    })
    .listen(PORT, (listenSocket) => {
      if (listenSocket) {
        console.log(`[potocki] listening on port ${PORT}`);
        console.log(`[potocki] base URL: ${BASE_URL}`);
        startCleanup();
      } else {
        console.error('[potocki] failed to listen on port', PORT);
        process.exit(1);
      }
    });
}

start().catch((err) => {
  console.error('[potocki] startup error:', err.message);
  process.exit(1);
});
