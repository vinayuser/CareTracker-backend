module.exports.prettyCase = (str) => str;

module.exports.generateRandomStringAndNumbers = function (len) {
  let text = '';
  const possible = 'abcdefghijklmnopqrstuvwxyz1234567890';
  for (let i = 0; i < len; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

module.exports.generateInviteToken = function () {
  return `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

const isLoopbackHost = (host = '') => /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(host).trim());

/** Where the admin/candidate browser is right now (Origin / X-Frontend-URL / Referer). */
const originFromRequest = (req) => {
  if (!req?.headers) return '';

  const explicit = String(req.headers['x-frontend-url'] || '').trim().replace(/\/+$/, '');
  if (explicit) return explicit;

  const origin = String(req.headers.origin || '').trim().replace(/\/+$/, '');
  if (origin) return origin;

  const referer = String(req.headers.referer || req.headers.referrer || '').trim();
  if (referer) {
    try {
      const parsed = new URL(referer);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return '';
    }
  }

  return '';
};

/**
 * Frontend base URL — dynamic from the request first.
 * Local work → localhost. Production click → production.
 */
module.exports.getFrontendUrl = function (req) {
  const fromReq = originFromRequest(req);
  if (fromReq) return fromReq;

  const fromEnv = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;

  return 'http://localhost:5173';
};

module.exports.buildInviteUrl = function (token, req) {
  return `${module.exports.getFrontendUrl(req)}/register?token=${encodeURIComponent(token)}`;
};

module.exports.generateCandidateFormToken = function () {
  return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

module.exports.buildCandidateFormUrl = function (token, req) {
  return `${module.exports.getFrontendUrl(req)}/candidate/forms/${encodeURIComponent(token)}`;
};

/**
 * API / static-files base (documents, uploads).
 * Prefer the host the client is using; fall back to env; then local NODE_PORT.
 */
module.exports.getApiBaseUrl = function (req) {
  // When browser sends X-Frontend-URL and shares host with API (production), use that.
  // For local Vite→API on another port, prefer API_BASE_URL / request Host.
  const fromEnv = (process.env.API_BASE_URL || process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');

  if (req?.headers) {
    const xfProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const xfHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const hostHeader = String(req.headers.host || '').split(',')[0].trim();
    const host = xfHost || hostHeader;

    // Production / proxied: public host on the request
    if (host && !isLoopbackHost(host)) {
      const proto = xfProto || (req.secure ? 'https' : 'http');
      return `${proto}://${host}`.replace(/\/+$/, '');
    }

    // Local: Host is localhost:3000/5000 — that IS the API origin for /documents
    if (host && isLoopbackHost(host)) {
      const proto = xfProto || (req.secure ? 'https' : 'http');
      return `${proto}://${host}`.replace(/\/+$/, '');
    }
  }

  if (fromEnv) return fromEnv;

  const frontend = (process.env.FRONTEND_URL || '').trim().replace(/\/+$/, '');
  if (frontend) return frontend;

  const port = Number(process.env.NODE_PORT) || 3000;
  return `http://localhost:${port}`;
};

module.exports.buildDocumentTemplateUrl = function (relativePath, req) {
  let clean = String(relativePath || '').replace(/^\/+/, '');
  if (clean.startsWith('documents/')) {
    clean = clean.slice('documents/'.length);
  }
  // Serve via /api/documents so production nginx /api/ proxy works (avoids SPA HTML 404)
  const pathSuffix = `/api/documents/${clean.split('/').map(encodeURIComponent).join('/')}`;
  const base = module.exports.getApiBaseUrl(req);
  return `${base}${pathSuffix}`;
};

/** Public URL for files under uploads/ (filled PDFs, resumes, etc.) via /api/uploads. */
module.exports.buildUploadUrl = function (relativePath, req) {
  let clean = String(relativePath || '').replace(/^\/+/, '');
  if (clean.startsWith('uploads/')) {
    clean = clean.slice('uploads/'.length);
  }
  if (clean.startsWith('api/uploads/')) {
    clean = clean.slice('api/uploads/'.length);
  }
  const pathSuffix = `/api/uploads/${clean.split('/').map(encodeURIComponent).join('/')}`;
  const base = module.exports.getApiBaseUrl(req);
  return `${base}${pathSuffix}`;
};

module.exports.toClientDoc = (doc) => {
  if (!doc) return null;
  const obj = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (obj._id) {
    obj.id = String(obj._id);
    delete obj._id;
  }
  delete obj.__v;
  delete obj.password;
  delete obj.jti;
  return obj;
};

module.exports.toClientList = (docs) => docs.map((doc) => module.exports.toClientDoc(doc));
