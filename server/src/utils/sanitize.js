function sanitizeFilename(name) {
  if (!name) return 'untitled';
  return name
    .replace(/[<>"'&\\\/\n\r\t\0]/g, '_')
    .replace(/\.\./g, '')
    .replace(/^[\.]+/, '')
    .substring(0, 255) || 'untitled';
}

function sanitizeId(id) {
  if (!id) return '';
  return id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32);
}

function escapeJsString(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/\//g, '\\/')
    .replace(/[\n\r\u2028\u2029]/g, '');
}

module.exports = { sanitizeFilename, sanitizeId, escapeJsString };
