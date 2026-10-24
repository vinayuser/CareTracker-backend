const Model = require('../../models/index');
const functions = require('../../common/functions');
const MailchimpService = require('../common/mailchimp.service');
const EmailPreferenceService = require('../common/emailPreference.service');

const ROLE_LABELS = {
  AGENCY_OWNER: 'Agency Owner',
  HR: 'Office Staff',
  CAREGIVER: 'Caregiver',
  CLIENT: 'Client',
};

const STATUS_LABELS = {
  Active: 'Active',
  Inactive: 'Inactive',
  Pending: 'Invited',
};

const getAgencyId = (req) => {
  const account = req.agency_owner || req.hr;
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const emptyState = (agency) => {
  const name = agency?.name || 'Agency';
  const email = agency?.email || '';
  const agencyId = String(agency?._id || '');
  const today = new Date().toISOString().slice(0, 10);
  return {
    settings: {
      fromName: name,
      fromEmail: email,
      replyTo: email,
      domain: String(email).split('@')[1] || '',
      domainStatus: 'Pending',
      unsubscribeUrl: `/email/unsubscribe?agencyId=${encodeURIComponent(agencyId)}`,
      preferencesUrl: `/email/preferences?agencyId=${encodeURIComponent(agencyId)}`,
      footer: `${name} sent this message. This is a marketing update from your care agency, not a clinical record.`,
      suppression: [],
    },
    lists: [{ id: uid('list'), name: 'Agency contacts', updatedAt: today }],
    tags: [],
    segments: [],
    contacts: [],
    templates: [],
    campaigns: [],
  };
};

const toState = (doc, agency) => {
  const seeded = emptyState(agency);
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

const getOrCreateDoc = async (agencyId) => {
  let doc = await Model.AgencyEmailMarketingModel.findOne({ agencyId });
  if (doc) return doc;
  const agency = await Model.AgencyModel.findById(agencyId).select('name email').lean();
  const seeded = emptyState(agency);
  doc = await Model.AgencyEmailMarketingModel.create({
    agencyId,
    ...seeded,
  });
  return doc;
};

const getState = async (req) => {
  const agencyId = getAgencyId(req);
  const [doc, agency] = await Promise.all([
    getOrCreateDoc(agencyId),
    Model.AgencyModel.findById(agencyId).select('name email').lean(),
  ]);
  return toState(doc, agency);
};

const saveState = async (req, payload = {}) => {
  const agencyId = getAgencyId(req);
  const agency = await Model.AgencyModel.findById(agencyId).select('name email').lean();
  const current = toState(await getOrCreateDoc(agencyId), agency);
  const next = {
    settings: payload.settings && typeof payload.settings === 'object' ? payload.settings : current.settings,
    lists: Array.isArray(payload.lists) ? payload.lists : current.lists,
    tags: Array.isArray(payload.tags) ? payload.tags : current.tags,
    segments: Array.isArray(payload.segments) ? payload.segments : current.segments,
    contacts: Array.isArray(payload.contacts) ? payload.contacts : current.contacts,
    templates: Array.isArray(payload.templates) ? payload.templates : current.templates,
    campaigns: Array.isArray(payload.campaigns) ? payload.campaigns : current.campaigns,
  };
  const doc = await Model.AgencyEmailMarketingModel.findOneAndUpdate(
    { agencyId },
    { $set: next },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return toState(doc, agency);
};

const getAudience = async (req) => {
  const agencyId = getAgencyId(req);
  const agency = await Model.AgencyModel.findById(agencyId).select('name status').lean();
  if (!agency) throw new Error('Agency not found');

  const accounts = await Model.AgencyAccountModel.find({
    agencyId,
    role: { $in: ['AGENCY_OWNER', 'HR', 'CAREGIVER', 'CLIENT'] },
  })
    .select('fullName email role status')
    .lean();

  const name = agency.name || '';
  const blocked = await EmailPreferenceService.blockedEmails(
    accounts.map((account) => account.email),
    String(agencyId),
  );
  return {
    agencies: [{
      id: String(agency._id),
      name,
      status: agency.status || 'Active',
      userCount: accounts.length,
    }],
    users: accounts.map((account) => ({
      id: String(account._id),
      name: account.fullName || '',
      email: account.email || '',
      role: ROLE_LABELS[account.role] || account.role || '',
      agency: name,
      agencyId: String(agencyId),
      status: STATUS_LABELS[account.status] || account.status || 'Active',
      optedOut: blocked.has(String(account.email || '').trim().toLowerCase()),
    })),
  };
};

const sendCampaign = async (req, body = {}) => {
  const agencyId = getAgencyId(req);
  const agency = await Model.AgencyModel.findById(agencyId).select('name email').lean();
  if (!agency) throw new Error('Agency not found');

  const subject = String(body.subject || '').trim();
  const html = String(body.html || '').trim();
  const fromName = String(body.fromName || agency.name || 'CareTracker').trim();
  const replyTo = String(body.fromEmail || body.replyTo || agency.email || '').trim();
  const incoming = Array.isArray(body.recipients) ? body.recipients : [];
  const blocked = await EmailPreferenceService.blockedEmails(
    incoming.map((person) => person?.email),
    String(agencyId),
  );
  const recipients = incoming
    .filter((person) => person?.email && !blocked.has(String(person.email).trim().toLowerCase()))
    .slice(0, 100);

  if (!subject || !html) throw new Error('Subject and email content are required');
  if (!replyTo) throw new Error('A Mailchimp from email is required');
  if (!recipients.length) throw new Error('This campaign has no recipients to send to');

  return MailchimpService.sendCampaign({
    subject,
    html,
    fromName,
    replyTo,
    recipients,
    apiBaseUrl: functions.getApiBaseUrl(req),
  });
};

module.exports = {
  getState,
  saveState,
  getAudience,
  sendCampaign,
};
