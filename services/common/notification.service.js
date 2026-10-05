const mongoose = require('mongoose');
const Model = require('../../models/index');
const functions = require('../../common/functions');

const TYPES = {
  AGENCY_ONBOARDED: 'agency.onboarded',
  REGISTRATION_COMPLETE: 'registration.complete',
  AGENCY_CREDENTIALS_RESET: 'agency.credentials.reset',
  INVITATION_SENT: 'invitation.sent',
  EVV_ENROLLMENT_ASSIGNED: 'evv.enrollment.assigned',
  EVV_ENROLLMENT_SUBMITTED: 'evv.enrollment.submitted',
  EVV_ENROLLMENT_SUBMIT_CONFIRMATION: 'evv.enrollment.submit_confirmation',
  EVV_VISIT_CHECKOUT: 'evv.visit.checkout_pending',
  EVV_VISIT_APPROVED: 'evv.visit.approved',
  EVV_VISIT_REJECTED: 'evv.visit.rejected',
  SCHEDULE_CREATED: 'schedule.created',
  LEAVE_REQUEST_SUBMITTED: 'leave.request.submitted',
  LEAVE_REQUEST_REVIEWED: 'leave.request.reviewed',
  HIRING_APPLICATION_RECEIVED: 'hiring.application.received',
  HIRING_STAGE_ADVANCED: 'hiring.stage.advanced',
  HIRING_FORMS_SENT: 'hiring.forms.sent',
  HIRING_FORM_RESET: 'hiring.form.reset',
  CAREGIVER_HIRED: 'hiring.caregiver.hired',
  HR_STAFF_CREATED: 'hr.staff.created',
  CLIENT_PORTAL_READY: 'client.portal.ready',
  ASSESSMENT_CREATED: 'assessment.created',
  ASSESSMENT_QUOTE_GENERATED: 'assessment.quote_generated',
  ASSESSMENT_QUOTE_ACCEPTED: 'assessment.quote_accepted',
  CARE_PLAN_UPDATED: 'care_plan.updated',
  INVOICE_SENT: 'billing.invoice.sent',
  INVOICE_RECEIVED: 'billing.invoice.received',
  MESSAGE_RECEIVED: 'message.received',
};

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
};

const formatOne = (doc) => {
  const row = functions.toClientDoc(doc);
  if (!row) return null;
  row.read = Boolean(doc.readAt);
  row.createdAt = doc.createdAt?.toISOString?.() || doc.createdAt;
  return row;
};

const createOne = async (payload) => {
  const recipientId = toOid(payload.recipientId);
  if (!recipientId || !payload.recipientType || !payload.title || !payload.type) return null;

  const doc = await Model.NotificationModel.create({
    recipientType: payload.recipientType,
    recipientId,
    agencyId: toOid(payload.agencyId),
    type: payload.type,
    category: payload.category || 'system',
    priority: payload.priority || 'normal',
    title: payload.title,
    body: payload.body || '',
    tone: payload.tone || 'info',
    actionUrl: payload.actionUrl || '',
    actionLabel: payload.actionLabel || 'View',
    entityType: payload.entityType || '',
    entityId: toOid(payload.entityId),
    metadata: payload.metadata || {},
  });
  return formatOne(doc);
};

/** Fire-and-forget helper — never blocks the caller. */
const emit = (promiseFactory) => {
  Promise.resolve()
    .then(promiseFactory)
    .catch((err) => console.error('[notification]', err.message));
};

const notifyMany = async (recipients, payload) => {
  const unique = new Map();
  for (const row of recipients || []) {
    const key = `${row.recipientType}:${String(row.recipientId)}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  const created = [];
  for (const row of unique.values()) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await createOne({ ...payload, ...row });
    if (doc) created.push(doc);
  }
  return created;
};

const getPlatformAdmins = async () => {
  const admins = await Model.AdminModel.find({ status: { $ne: 'Inactive' } })
    .select('_id')
    .lean();
  return admins.map((a) => ({
    recipientType: 'admin',
    recipientId: a._id,
    agencyId: null,
  }));
};

const getAgencyRecipients = async (agencyId, { roles = ['AGENCY_OWNER', 'HR'], moduleKey = null } = {}) => {
  const id = toOid(agencyId);
  if (!id) return [];

  const filter = {
    agencyId: id,
    role: { $in: roles },
    status: { $ne: 'Inactive' },
  };
  const accounts = await Model.AgencyAccountModel.find(filter)
    .select('_id role moduleAccess')
    .lean();

  return accounts
    .filter((account) => {
      if (account.role === 'AGENCY_OWNER') return true;
      if (!moduleKey) return true;
      const access = Array.isArray(account.moduleAccess) ? account.moduleAccess : [];
      return access.includes(moduleKey);
    })
    .map((account) => ({
      recipientType: 'agency_account',
      recipientId: account._id,
      agencyId: id,
    }));
};

const notifyPlatformAdmins = async (payload) => notifyMany(await getPlatformAdmins(), payload);

const notifyAgency = async (agencyId, payload, options = {}) => {
  const recipients = await getAgencyRecipients(agencyId, options);
  return notifyMany(recipients, { ...payload, agencyId: toOid(agencyId) });
};

const notifyAccount = async (accountId, payload) => {
  const account = await Model.AgencyAccountModel.findById(accountId).select('_id agencyId').lean();
  if (!account) return null;
  return createOne({
    ...payload,
    recipientType: 'agency_account',
    recipientId: account._id,
    agencyId: account.agencyId,
  });
};

const resolveRecipient = (req) => {
  if (req.super_admin) {
    return { recipientType: 'admin', recipientId: req.super_admin._id || req.super_admin.id };
  }
  const account = req.agency_owner || req.hr || req.caregiver || req.client;
  if (account) {
    const agencyId = account.agencyId?._id || account.agencyId;
    return {
      recipientType: 'agency_account',
      recipientId: account._id || account.id,
      agencyId,
    };
  }
  return null;
};

const listForRequest = async (req, query = {}) => {
  const recipient = resolveRecipient(req);
  if (!recipient?.recipientId) return { items: [], unreadCount: 0, pagination: { page: 1, limit: 20, total: 0 } };

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;
  const filter = {
    recipientType: recipient.recipientType,
    recipientId: toOid(recipient.recipientId),
  };
  if (query.unreadOnly === 'true' || query.unreadOnly === true) {
    filter.readAt = null;
  }

  const [total, unreadCount, rows] = await Promise.all([
    Model.NotificationModel.countDocuments(filter),
    Model.NotificationModel.countDocuments({
      recipientType: recipient.recipientType,
      recipientId: toOid(recipient.recipientId),
      readAt: null,
    }),
    Model.NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  return {
    items: rows.map(formatOne).filter(Boolean),
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
};

const unreadCountForRequest = async (req) => {
  const recipient = resolveRecipient(req);
  if (!recipient?.recipientId) return { unreadCount: 0 };
  const count = await Model.NotificationModel.countDocuments({
    recipientType: recipient.recipientType,
    recipientId: toOid(recipient.recipientId),
    readAt: null,
  });
  return { unreadCount: count };
};

const markRead = async (req, id) => {
  const recipient = resolveRecipient(req);
  if (!recipient?.recipientId) throw new Error('Unauthorized');

  const doc = await Model.NotificationModel.findOneAndUpdate(
    {
      _id: id,
      recipientType: recipient.recipientType,
      recipientId: toOid(recipient.recipientId),
    },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (!doc) throw new Error('Notification not found');
  return formatOne(doc);
};

const markAllRead = async (req) => {
  const recipient = resolveRecipient(req);
  if (!recipient?.recipientId) throw new Error('Unauthorized');

  const result = await Model.NotificationModel.updateMany(
    {
      recipientType: recipient.recipientType,
      recipientId: toOid(recipient.recipientId),
      readAt: null,
    },
    { $set: { readAt: new Date() } },
  );
  return { updated: result.modifiedCount || 0 };
};

module.exports = {
  TYPES,
  createOne,
  emit,
  notifyPlatformAdmins,
  notifyAgency,
  notifyAccount,
  listForRequest,
  unreadCountForRequest,
  markRead,
  markAllRead,
};
