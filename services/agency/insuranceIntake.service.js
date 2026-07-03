const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const insuranceConstants = require('../../common/insuranceIntakeConstants');
const { formatClient } = require('./client.service');

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

const syncSummaryFields = (formData = {}) => {
  const ci = formData.clientInfo || {};
  return {
    clientName: ci.clientFullName || '',
    clientPhone: ci.phoneMobile || ci.phoneHome || '',
    clientEmail: ci.email || '',
  };
};

const formatInsuranceIntake = (doc, client = null) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.clientId = doc.clientId ? String(doc.clientId._id || doc.clientId || '') : null;
  if (client) {
    item.client = typeof client === 'object' && client.firstName
      ? formatClient(client)
      : client;
  }
  return item;
};

const generateIntakeCode = async (agencyId) => {
  const count = await Model.ClientInsuranceIntakeModel.countDocuments({ agencyId });
  return `INS-${String(10001 + count).padStart(5, '0')}`;
};

const getOptions = async () => ({
  statuses: insuranceConstants.INSURANCE_INTAKE_STATUSES,
  primary_insurance_types: insuranceConstants.PRIMARY_INSURANCE_TYPES,
  genders: insuranceConstants.GENDERS,
  marital_statuses: insuranceConstants.MARITAL_STATUSES,
  relationships: insuranceConstants.RELATIONSHIPS,
  medicare_types: insuranceConstants.MEDICARE_TYPES,
  auth_statuses: insuranceConstants.AUTH_STATUSES,
  required_documents: insuranceConstants.REQUIRED_DOCUMENTS,
});

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.ClientInsuranceIntakeModel.find({ agencyId });
  return {
    total: list.length,
    draft: list.filter((i) => i.status === 'Draft').length,
    submitted: list.filter((i) => i.status === 'Submitted').length,
    verified: list.filter((i) => i.status === 'Verified').length,
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
  if (query.search) {
    const search = String(query.search).trim();
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { intakeCode: regex },
      { clientName: regex },
      { clientEmail: regex },
      { clientPhone: regex },
    ];
  }

  const list = await Model.ClientInsuranceIntakeModel.find(filter)
    .populate('clientId')
    .sort({ createdAt: -1 });

  return list.map((doc) => formatInsuranceIntake(doc, doc.clientId));
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);
  return formatInsuranceIntake(doc, doc.clientId);
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  let client = null;
  if (payload.clientId) {
    client = await Model.ClientModel.findOne({ _id: payload.clientId, agencyId });
    if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  }

  const formData = payload.formData || {};
  const summary = syncSummaryFields(formData);
  const intakeCode = await generateIntakeCode(agencyId);

  const doc = await Model.ClientInsuranceIntakeModel.create({
    agencyId,
    intakeCode,
    status: payload.status || 'Draft',
    intakeDate: payload.intakeDate || new Date().toISOString().split('T')[0],
    clientId: client?._id || null,
    ...summary,
    formData,
    createdByAccountId: getAccountId(req),
  });

  const populated = await Model.ClientInsuranceIntakeModel.findById(doc._id).populate('clientId');
  return formatInsuranceIntake(populated, populated.clientId || null);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);

  if (payload.clientId) {
    const client = await Model.ClientModel.findOne({ _id: payload.clientId, agencyId });
    if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
    doc.clientId = client._id;
  }

  if (payload.status !== undefined) doc.status = payload.status;
  if (payload.intakeDate !== undefined) doc.intakeDate = payload.intakeDate;
  if (payload.formData) {
    doc.formData = payload.formData;
    const summary = syncSummaryFields(payload.formData);
    doc.clientName = summary.clientName;
    doc.clientPhone = summary.clientPhone;
    doc.clientEmail = summary.clientEmail;
  }

  await doc.save();
  const populated = await Model.ClientInsuranceIntakeModel.findById(doc._id).populate('clientId');
  return formatInsuranceIntake(populated, populated.clientId || null);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientInsuranceIntakeModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.INSURANCE_INTAKE.NOT_FOUND);
  await Model.ClientInsuranceIntakeModel.deleteOne({ _id: id });
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
