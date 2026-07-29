const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const {
  ASSESSMENT_FIELDS,
  DEFAULT_SERVICES,
} = require('../../common/carePlanConstants');
const { formatClient } = require('./client.service');
const { syncFromCarePlan } = require('./evvEnrollment.service');
const { sendCarePlanUpdatedEmail } = require('../common/mail.service');
const {
  getAgencyContext,
  uniqueEmails,
  agencyPortalUrl,
} = require('../common/notifyHelpers');

const notifyCarePlanChange = async (req, plan, client, action = 'updated', version) => {
  try {
    const agencyId = plan.agencyId?._id || plan.agencyId;
    const { agencyName, ownerEmails, ownerName } = await getAgencyContext(agencyId);
    const clientName = client
      ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.name
      : '';
    const clientEmail = client?.email || '';
    const planId = plan._id || plan.id;
    const portalUrl = agencyPortalUrl(req, `/agency/care-plans/${planId}/versions`);
    const emails = uniqueEmails([...ownerEmails, clientEmail]);
    await Promise.all(emails.map(async (to) => {
      try {
        await sendCarePlanUpdatedEmail({
          to,
          recipientName: to === String(clientEmail).toLowerCase() ? clientName : ownerName,
          agencyName,
          clientName,
          planCode: plan.planCode,
          status: plan.status,
          version: version || plan.version,
          action,
          portalUrl,
        });
      } catch (err) {
        console.error('[carePlan] email failed', to, err.message);
      }
    }));
  } catch (err) {
    console.error('[carePlan] notify failed', err.message);
  }
};

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const getAccountId = (req) => {
  const account = getAgencyAccount(req);
  return account?._id || account?.id;
};

const buildDefaultAssessment = () => {
  const assessment = {};
  ASSESSMENT_FIELDS.forEach((field) => {
    assessment[field.key] = field.default;
  });
  return assessment;
};

const formatCarePlan = (doc, client = null) => {
  const plan = functions.toClientDoc(doc);
  if (!plan) return null;
  plan.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  plan.clientId = doc.clientId ? String(doc.clientId._id || doc.clientId || '') : null;
  plan.assessmentId = doc.assessmentId ? String(doc.assessmentId) : null;
  if (client) {
    const isDoc = typeof client === 'object' && (client._id || client.id || client.firstName || client.clientCode);
    plan.client = isDoc ? formatClient(client) : client;
  }
  return plan;
};

const buildSnapshot = (doc) => {
  const raw = doc.toObject ? doc.toObject({ depopulate: true }) : { ...doc };
  delete raw._id;
  delete raw.__v;
  delete raw.createdAt;
  delete raw.updatedAt;
  return raw;
};

const normalizeVersion = (value) => {
  const n = parseInt(String(value || 'v1').replace(/^v/i, ''), 10);
  return `v${Number.isFinite(n) && n > 0 ? n : 1}`;
};

const nextVersionLabel = (current) => {
  const n = parseInt(String(current || 'v1').replace(/^v/i, ''), 10);
  return `v${(Number.isFinite(n) && n > 0 ? n : 1) + 1}`;
};

/** Archive current live plan into history, then bump doc.version to the next label. */
const archiveCurrentVersion = async (req, doc) => {
  const version = normalizeVersion(doc.version);
  const existing = await Model.CarePlanHistoryModel.findOne({ carePlanId: doc._id, version }).lean();
  if (!existing) {
    await Model.CarePlanHistoryModel.create({
      agencyId: doc.agencyId,
      carePlanId: doc._id,
      clientId: doc.clientId || null,
      version,
      snapshot: buildSnapshot(doc),
      createdByAccountId: getAccountId(req),
    });
  }
  doc.version = nextVersionLabel(version);
};

const generatePlanCode = async (agencyId) => {
  const count = await Model.CarePlanModel.countDocuments({ agencyId });
  return `CP-${String(10001 + count).padStart(5, '0')}`;
};

const getOptions = async () => ({
  assessment_fields: ASSESSMENT_FIELDS,
  default_services: DEFAULT_SERVICES,
});

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.CarePlanModel.find({ agencyId });
  return {
    total: list.length,
    active: list.filter((p) => p.status === 'Active').length,
    draft: list.filter((p) => p.status === 'Draft').length,
    archived: list.filter((p) => p.status === 'Archived').length,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };

  if (query.status && query.status !== 'All') {
    filter.status = query.status;
  }
  if (query.client_id) {
    filter.clientId = query.client_id;
  }

  const list = await Model.CarePlanModel.find(filter)
    .populate('clientId')
    .sort({ createdAt: -1 });

  return list.map((doc) => formatCarePlan(doc, doc.clientId));
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);
  const plan = formatCarePlan(doc, doc.clientId);

  if (doc.assessmentId && plan.client) {
    const assessment = await Model.ClientAssessmentModel.findOne({ _id: doc.assessmentId, agencyId }).lean();
    const physician = assessment?.formData?.physicianInfo || {};
    const insurance = assessment?.formData?.insurance || {};
    const c = plan.client;
    plan.client = {
      ...c,
      physicianName: c.physicianName || physician.primaryPhysician || '',
      physicianPhone: c.physicianPhone || physician.primaryPhysicianPhone || '',
      pharmacyName: c.pharmacyName || physician.pharmacy || '',
      pharmacyPhone: c.pharmacyPhone || physician.pharmacyPhone || '',
      preferredHospital: c.preferredHospital || physician.preferredHospital || '',
      insuranceProvider: c.insuranceProvider || (insurance.types || []).join(', '),
      insuranceMemberId: c.insuranceMemberId || insurance.policyNumber || '',
    };
  }

  return plan;
};

const QUOTE_STATUSES = ['Quoted', 'Accepted', 'Declined'];

const normalizeQuoteStatus = (value) => (
  value && QUOTE_STATUSES.includes(value) ? value : undefined
);

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  if (!payload.clientId && !payload.assessmentId) {
    throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  }
  let client = null;
  if (payload.clientId) {
    client = await Model.ClientModel.findOne({ _id: payload.clientId, agencyId });
    if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  }

  const planCode = await generatePlanCode(agencyId);
  const createData = {
    agencyId,
    clientId: client?._id || null,
    assessmentId: payload.assessmentId || null,
    planCode,
    status: payload.status || 'Draft',
    hourlyRate: payload.hourlyRate ?? 0,
    weeklyHours: payload.weeklyHours ?? 0,
    quotedMonthlyPrice: payload.quotedMonthlyPrice ?? 0,
    agreementDate: payload.agreementDate || '',
    effectiveDate: payload.effectiveDate || '',
    reviewDate: payload.reviewDate || '',
    version: 'v1',
    formData: payload.formData || {},
    assessment: payload.assessment || buildDefaultAssessment(),
    assessmentNotes: payload.assessmentNotes || '',
    services: payload.services?.length ? payload.services : DEFAULT_SERVICES,
    createdByAccountId: getAccountId(req),
  };

  const quoteStatus = normalizeQuoteStatus(payload.quoteStatus);
  if (quoteStatus) createData.quoteStatus = quoteStatus;

  const doc = await Model.CarePlanModel.create(createData);

  const populated = await Model.CarePlanModel.findById(doc._id).populate('clientId');
  if (populated.clientId) {
    await syncFromCarePlan(agencyId, populated);
  }
  await notifyCarePlanChange(req, populated, populated.clientId || null, 'created');
  return formatCarePlan(populated, populated.clientId || null);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  await archiveCurrentVersion(req, doc);

  if (payload.clientId) {
    const client = await Model.ClientModel.findOne({ _id: payload.clientId, agencyId });
    if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
    doc.clientId = client._id;
  }

  ['status', 'effectiveDate', 'reviewDate', 'assessmentNotes', 'hourlyRate', 'weeklyHours', 'quotedMonthlyPrice', 'agreementDate'].forEach((field) => {
    if (payload[field] !== undefined) doc[field] = payload[field];
  });

  if (payload.quoteStatus !== undefined) {
    const quoteStatus = normalizeQuoteStatus(payload.quoteStatus);
    if (quoteStatus) doc.quoteStatus = quoteStatus;
    else doc.set('quoteStatus', undefined);
  }

  if (payload.formData) doc.formData = payload.formData;

  if (payload.assessment) doc.assessment = { ...doc.assessment.toObject?.() || doc.assessment, ...payload.assessment };
  if (payload.services) doc.services = payload.services;

  await doc.save();
  const populated = await Model.CarePlanModel.findById(doc._id).populate('clientId');
  if (populated.clientId) {
    await syncFromCarePlan(agencyId, populated);
  }
  await notifyCarePlanChange(req, populated, populated.clientId || null, 'updated');
  return formatCarePlan(populated, populated.clientId || null);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);
  await Model.CarePlanHistoryModel.deleteMany({ carePlanId: id, agencyId });
  await Model.CarePlanModel.deleteOne({ _id: id });
  return { id: String(id) };
};

const formatVersionRow = ({
  id,
  version,
  isLatest,
  createdAt,
  status,
  planCode,
  client,
  assessor,
}) => ({
  id,
  version,
  isLatest: Boolean(isLatest),
  createdAt,
  status: status || '',
  planCode: planCode || '',
  client: client || { name: '', code: '', photo: '', email: '', phone: '' },
  assessor: assessor || { name: '', title: '', photo: '' },
});

const pickAssessor = (formData = {}) => {
  const a = formData.assessor || {};
  return {
    name: a.name || '',
    title: a.title || '',
    photo: a.photo || '',
  };
};

const pickClientSummary = (clientDoc, formData = {}, req) => {
  const ci = formData.clientInfo || {};
  const name = clientDoc
    ? `${clientDoc.firstName || ''} ${clientDoc.lastName || ''}`.trim()
      || clientDoc.fullName
      || ''
    : (ci.clientName || '');
  const photo = clientDoc?.profilePicPath
    ? functions.buildUploadUrl(clientDoc.profilePicPath, req)
    : '';
  return {
    name: name || '',
    code: clientDoc?.clientCode || ci.clientId || '',
    photo,
    email: clientDoc?.email || ci.email || '',
    phone: clientDoc?.phone || clientDoc?.phoneHome || ci.phone || '',
  };
};

const getVersions = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  const liveClient = doc.clientId || null;
  const liveForm = doc.formData?.toObject?.() || doc.formData || {};
  const history = await Model.CarePlanHistoryModel.find({ carePlanId: id, agencyId }).sort({ createdAt: -1 });

  const latest = formatVersionRow({
    id: 'latest',
    version: normalizeVersion(doc.version),
    isLatest: true,
    createdAt: doc.updatedAt || doc.createdAt,
    status: doc.status,
    planCode: doc.planCode,
    client: pickClientSummary(liveClient, liveForm, req),
    assessor: pickAssessor(liveForm),
  });

  const archived = history.map((h) => {
    const s = h.snapshot || {};
    const snapForm = s.formData || {};
    return formatVersionRow({
      id: String(h._id),
      version: h.version,
      isLatest: false,
      createdAt: h.createdAt,
      status: s.status,
      planCode: s.planCode || doc.planCode,
      client: pickClientSummary(liveClient, snapForm, req),
      assessor: pickAssessor(snapForm),
    });
  });

  return {
    carePlanId: String(doc._id),
    planCode: doc.planCode,
    client: liveClient ? formatClient(liveClient) : null,
    versions: [latest, ...archived],
  };
};

const getVersionById = async (req, id, historyId) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  if (!historyId || historyId === 'latest') {
    return {
      ...formatCarePlan(doc, doc.clientId),
      isLatest: true,
      historyId: null,
    };
  }

  const history = await Model.CarePlanHistoryModel.findOne({ _id: historyId, carePlanId: id, agencyId });
  if (!history) throw new Error(constants.MESSAGE.CARE_PLAN.VERSION_NOT_FOUND);

  const snap = history.snapshot || {};
  const fakeDoc = {
    ...snap,
    _id: doc._id,
    agencyId: doc.agencyId,
    clientId: doc.clientId,
    assessmentId: snap.assessmentId || doc.assessmentId,
    planCode: snap.planCode || doc.planCode,
    version: history.version,
  };
  return {
    ...formatCarePlan(fakeDoc, doc.clientId),
    isLatest: false,
    historyId: String(history._id),
  };
};

const sendVersion = async (req, id, { historyId } = {}) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  let version = normalizeVersion(doc.version);
  let status = doc.status;
  let planCode = doc.planCode;

  if (historyId && historyId !== 'latest') {
    const history = await Model.CarePlanHistoryModel.findOne({ _id: historyId, carePlanId: id, agencyId });
    if (!history) throw new Error(constants.MESSAGE.CARE_PLAN.VERSION_NOT_FOUND);
    version = history.version;
    status = history.snapshot?.status || status;
    planCode = history.snapshot?.planCode || planCode;
  }

  await notifyCarePlanChange(req, { ...doc.toObject(), planCode, status, version }, doc.clientId || null, 'version', version);
  return { carePlanId: String(doc._id), version, historyId: historyId && historyId !== 'latest' ? historyId : null };
};

module.exports = {
  getOptions,
  getStats,
  getAll,
  getById,
  create,
  update,
  remove,
  getVersions,
  getVersionById,
  sendVersion,
  archiveCurrentVersion,
  formatCarePlan,
};
