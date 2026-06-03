const { getFileById } = require('../db');
const { sanitizeId } = require('../utils/sanitize');

async function handleFileInfo(res, req) {
  const rawId = req.getParameter(0);
  const id = sanitizeId(rawId);
  const file = await getFileById(id);

  if (!file) {
    res.cork(() => {
      res.writeStatus('404 Not Found');
      res.end(JSON.stringify({ error: 'File not found' }));
    });
    return;
  }

  res.cork(() => {
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      id: file.id,
      name: file.name,
      size: file.size,
      compSize: file.comp_size,
      sha256: file.sha256,
      bwUsed: file.bw_used,
      bwLimit: file.bw_limit,
      created: file.created,
      expires: file.expires,
    }));
  });
}

async function handleFileKey(res, req) {
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

  if (!token || file.token !== token) {
    res.cork(() => {
      res.writeStatus('403 Forbidden');
      res.end(JSON.stringify({ error: 'Invalid token' }));
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

  res.cork(() => {
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      key: file.key,
      iv: file.iv,
      name: file.name,
      sha256: file.sha256,
    }));
  });
}

function getQueryParam(req, name) {
  const qs = req.getQuery();
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  return params.get(name);
}

module.exports = { handleFileInfo, handleFileKey };
