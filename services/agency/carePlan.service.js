const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const {
  ASSESSMENT_FIELDS,
  DEFAULT_SERVICES,
} = require('../../common/carePlanConstants');
const { formatClient } = require('./client.service');
const { syncFromCarePlan } = require('./evvEnrollment.service');

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
    plan.client = typeof client === 'object' && client.firstName
      ? formatClient(client)
      : client;
  }
  return plan;
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
  return formatCarePlan(doc, doc.clientId);
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
    version: payload.version || '1.0',
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
  return formatCarePlan(populated, populated.clientId || null);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  if (payload.clientId) {
    const client = await Model.ClientModel.findOne({ _id: payload.clientId, agencyId });
    if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
    doc.clientId = client._id;
  }

  ['status', 'effectiveDate', 'reviewDate', 'version', 'assessmentNotes', 'hourlyRate', 'weeklyHours', 'quotedMonthlyPrice', 'agreementDate'].forEach((field) => {
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
  return formatCarePlan(populated, populated.clientId || null);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.CarePlanModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);
  await Model.CarePlanModel.deleteOne({ _id: id });
  return { id: String(id) };
};

module.exports = {
  getOptions,
  getStats,
  getAll,
  getById,
  create,
  update,
  remove,
};
