const Model = require('../../models/index');

const TOPICS = [
  { id: 'product', label: 'Product updates' },
  { id: 'billing', label: 'Billing and invoices' },
  { id: 'hiring', label: 'Hiring and recruiting' },
  { id: 'updates', label: 'Agency news' },
];

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const format = (email, doc) => ({
  email,
  unsubscribed: Boolean(doc?.unsubscribed),
  topics: Array.isArray(doc?.topics) && doc.topics.length
    ? doc.topics
    : TOPICS.map((item) => item.id),
  topicsAvailable: TOPICS,
});

const getPreferences = async (rawEmail) => {
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email)) throw new Error('A valid email is required');
  const doc = await Model.EmailPreferenceModel.findOne({ email }).lean();
  return format(email, doc);
};

const savePreferences = async (rawEmail, payload = {}) => {
  const email = normalizeEmail(rawEmail);
  if (!isEmail(email)) throw new Error('A valid email is required');
  const unsubscribed = Boolean(payload.unsubscribed);
  const allowed = new Set(TOPICS.map((item) => item.id));
  const topics = unsubscribed
    ? []
    : (Array.isArray(payload.topics) ? payload.topics : [])
      .map((item) => String(item))
      .filter((item) => allowed.has(item));
  const doc = await Model.EmailPreferenceModel.findOneAndUpdate(
    { email },
    { $set: { email, unsubscribed, topics } },
    { upsert: true, new: true },
  );
  return format(email, doc);
};

const unsubscribe = async (rawEmail) => savePreferences(rawEmail, { unsubscribed: true, topics: [] });

const blockedEmails = async (emails = []) => {
  const list = [...new Set(emails.map(normalizeEmail).filter(isEmail))];
  if (!list.length) return new Set();
  const rows = await Model.EmailPreferenceModel.find({
    email: { $in: list },
    unsubscribed: true,
  }).select('email').lean();
  return new Set(rows.map((row) => row.email));
};

module.exports = {
  TOPICS,
  getPreferences,
  savePreferences,
  unsubscribe,
  blockedEmails,
};
