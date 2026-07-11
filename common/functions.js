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

module.exports.getFrontendUrl = function () {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').trim().replace(/\/+$/, '');
};

module.exports.buildInviteUrl = function (token) {
  return `${module.exports.getFrontendUrl()}/register?token=${encodeURIComponent(token)}`;
};

module.exports.generateCandidateFormToken = function () {
  return `cf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

module.exports.buildCandidateFormUrl = function (token) {
  return `${module.exports.getFrontendUrl()}/candidate/forms/${encodeURIComponent(token)}`;
};

module.exports.getApiBaseUrl = function () {
  const port = Number(process.env.NODE_PORT) || 3000;
  const fromEnv = (process.env.API_BASE_URL || process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  return `http://localhost:${port}`;
};

module.exports.buildDocumentTemplateUrl = function (relativePath) {
  const base = module.exports.getApiBaseUrl();
  let clean = String(relativePath || '').replace(/^\/+/, '');
  if (clean.startsWith('documents/')) {
    clean = clean.slice('documents/'.length);
  }
  return `${base}/documents/${clean.split('/').map(encodeURIComponent).join('/')}`;
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
