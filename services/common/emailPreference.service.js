const Model = require('../../models/index');

const TOPICS = [
  { id: 'product', label: 'Product updates' },
  { id: 'billing', label: 'Billing and invoices' },
  { id: 'hiring', label: 'Hiring and recruiting' },
  { id: 'updates', label: 'Agency news' },
];

const PLATFORM_SCOPE = 'platform';
let droppedLegacyIndex = false;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeScope = (value) => {
  const scope = String(value || '').trim();
  return scope || PLATFORM_SCOPE;
};

const ensureIndexes = async () => {
  if (droppedLegacyIndex) return;
  droppedLegacyIndex = true;
  try {
    await Model.EmailPreferenceModel.collection.dropIndex('email_1');
  } catch {
    /* already dropped or never existed */
  }
};

const format = (email, doc) => ({
  email,
  unsubscribed: Boolean(doc?.unsubscribed),
  topics: Array.isArray(doc?.topics) && doc.topics.length
    ? doc.topics
    : TOPICS.map((item) => item.id),
  topicsAvailable: TOPICS,
  scope: doc?.scope || PLATFORM_SCOPE,
});

const findPreference = async (email, scope) => {
  await ensureIndexes();
  if (scope === PLATFORM_SCOPE) {
    return Model.EmailPreferenceModel.findOne({
      email,
      $or: [{ scope: PLATFORM_SCOPE }, { scope: { $exists: false } }, { scope: null }],
    }).lean();
  }
  return Model.EmailPreferenceModel.findOne({ email, scope }).lean();
};

const getPreferences = async (rawEmail, rawScope) => {
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email)) throw new Error('A valid email is required');
  const scope = normalizeScope(rawScope);
  const doc = await findPreference(email, scope);
  return format(email, doc);
};

const savePreferences = async (rawEmail, payload = {}, rawScope) => {
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email)) throw new Error('A valid email is required');
  const scope = normalizeScope(rawScope || payload.agencyId || payload.scope);
  await ensureIndexes();
  const unsubscribed = Boolean(payload.unsubscribed);
  const allowed = new Set(TOPICS.map((item) => item.id));
  const topics = unsubscribed
    ? []
    : (Array.isArray(payload.topics) ? payload.topics : [])
      .map((item) => String(item))
      .filter((item) => allowed.has(item));
  const doc = await Model.EmailPreferenceModel.findOneAndUpdate(
    { email, scope },
    { $set: { email, scope, unsubscribed, topics } },
    { upsert: true, new: true },
  );
  return format(email, doc);
};

const unsubscribe = async (rawEmail, rawScope) => savePreferences(rawEmail, { unsubscribed: true, topics: [] }, rawScope);

const blockedEmails = async (emails = [], rawScope) => {
  const list = [...new Set(emails.map(normalizeEmail).filter(isEmail))];
  if (!list.length) return new Set();
  const scope = normalizeScope(rawScope);
  await ensureIndexes();
  const filter = {
    email: { $in: list },
    unsubscribed: true,
  };
  if (scope === PLATFORM_SCOPE) {
    filter.$or = [{ scope: PLATFORM_SCOPE }, { scope: { $exists: false } }, { scope: null }];
  } else {
    filter.scope = scope;
  }
  const rows = await Model.EmailPreferenceModel.find(filter).select('email').lean();
  return new Set(rows.map((row) => row.email));
};

module.exports = {
  TOPICS,
  getPreferences,
  savePreferences,
  unsubscribe,
  blockedEmails,
};
