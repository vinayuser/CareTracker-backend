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
