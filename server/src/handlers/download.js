const fs = require('fs');
const path = require('path');
const { getFileById, addBandwidth, FILES_DIR } = require('../db');
const { sanitizeId } = require('../utils/sanitize');

async function handleDownload(res, req) {
  const rawId = req.getParameter(0);
  const id = sanitizeId(rawId);
  const token = getQueryParam(req, 'token');

  const file = await getFileById(id);
  if (!file) {
    res.cork(() => {
      res.writeStatus('404 Not Found');
      res.end(JSON.stringify({ error: 'File not found' }));
    });
    return;
  }

  if (Date.now() > file.expires) {
    res.cork(() => {
      res.writeStatus('410 Gone');
      res.end(JSON.stringify({ error: 'File expired' }));
    });
    return;
  }

  if (file.bw_used >= file.bw_limit) {
    res.cork(() => {
      res.writeStatus('410 Gone');
      res.end(JSON.stringify({ error: 'Bandwidth limit reached' }));
    });
    return;
  }

  if (!token || file.token !== token) {
    res.cork(() => {
      res.writeStatus('403 Forbidden');
      res.end(JSON.stringify({ error: 'Invalid token' }));
    });
    return;
  }

  const encPath = path.join(FILES_DIR, `${id}.enc`);
  if (!fs.existsSync(encPath)) {
    res.cork(() => {
      res.writeStatus('404 Not Found');
      res.end(JSON.stringify({ error: 'File data missing' }));
    });
    return;
  }

  const data = fs.readFileSync(encPath);
  await addBandwidth(data.length, id);

  res.cork(() => {
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/octet-stream');
    res.writeHeader('Content-Length', data.length.toString());
    res.writeHeader('Content-Disposition', `attachment; filename="${id}.enc"`);
    res.end(data);
  });
}

function getQueryParam(req, name) {
  const qs = req.getQuery();
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  return params.get(name);
}

module.exports = { handleDownload };
