const Model = require('../../models/index');

const SCOPE = 'platform';

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyState = () => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    settings: {
      fromName: 'CareTracker',
      fromEmail: process.env.MAILCHIMP_FROM_EMAIL || process.env.MAIL_FROM_ADDRESS || 'hello@caretraker.com',
      replyTo: process.env.MAILCHIMP_FROM_EMAIL || process.env.MAIL_FROM_ADDRESS || 'support@caretraker.com',
      domain: 'caretraker.com',
      domainStatus: 'Pending',
      unsubscribeUrl: '/email/unsubscribe',
      preferencesUrl: '/email/preferences',
      footer: 'CareTracker helps agencies coordinate care. This message is a product or marketing update, not a clinical record.',
      suppression: [],
    },
    lists: [{ id: uid('list'), name: 'Platform contacts', updatedAt: today }],
    tags: [],
    segments: [],
    contacts: [],
    templates: [],
    campaigns: [],
  };
};

const toState = (doc) => {
  const seeded = emptyState();
  if (!doc) return seeded;
  return {
    settings: { ...seeded.settings, ...(doc.settings || {}) },
    lists: Array.isArray(doc.lists) && doc.lists.length ? doc.lists : seeded.lists,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    segments: Array.isArray(doc.segments) ? doc.segments : [],
    contacts: Array.isArray(doc.contacts) ? doc.contacts : [],
    templates: Array.isArray(doc.templates) ? doc.templates : [],
    campaigns: Array.isArray(doc.campaigns) ? doc.campaigns : [],
  };
};

const getOrCreateDoc = async () => {
  let doc = await Model.PlatformEmailMarketingModel.findOne({ scope: SCOPE });
  if (doc) return doc;
  doc = await Model.PlatformEmailMarketingModel.create({
    scope: SCOPE,
    ...emptyState(),
  });
  return doc;
};

const getState = async () => toState(await getOrCreateDoc());

const saveState = async (payload = {}) => {
  const current = toState(await getOrCreateDoc());
  const next = {
    settings: payload.settings && typeof payload.settings === 'object' ? payload.settings : current.settings,
    lists: Array.isArray(payload.lists) ? payload.lists : current.lists,
    tags: Array.isArray(payload.tags) ? payload.tags : current.tags,
    segments: Array.isArray(payload.segments) ? payload.segments : current.segments,
    contacts: Array.isArray(payload.contacts) ? payload.contacts : current.contacts,
    templates: Array.isArray(payload.templates) ? payload.templates : current.templates,
    campaigns: Array.isArray(payload.campaigns) ? payload.campaigns : current.campaigns,
  };
  const doc = await Model.PlatformEmailMarketingModel.findOneAndUpdate(
    { scope: SCOPE },
    { $set: next },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return toState(doc);
};

module.exports = {
  getState,
  saveState,
};
