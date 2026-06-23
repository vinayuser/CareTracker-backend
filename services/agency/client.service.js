const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const computeAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

const formatAddress = (doc) => {
  const parts = [doc.streetAddress, doc.city, doc.state, doc.zipCode].filter(Boolean);
  return parts.join(', ');
};

const formatClient = (doc) => {
  const client = functions.toClientDoc(doc);
  if (!client) return null;
  client.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  client.fullName = `${doc.firstName} ${doc.lastName}`.trim();
  client.age = computeAge(doc.dateOfBirth);
  client.address = formatAddress(doc);
  return client;
};

const generateClientCode = async (agencyId) => {
  const count = await Model.ClientModel.countDocuments({ agencyId });
  return `CLT-${String(10001 + count).padStart(5, '0')}`;
};

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.ClientModel.find({ agencyId });
  return {
    total: list.length,
    active: list.filter((c) => c.status === 'Active').length,
    inactive: list.filter((c) => c.status === 'Inactive').length,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };

  if (query.status && query.status !== 'All') {
    filter.status = query.status;
  }

  if (query.search) {
    const search = String(query.search).trim();
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { email: regex },
      { phone: regex },
      { clientCode: regex },
    ];
  }

  const list = await Model.ClientModel.find(filter).sort({ createdAt: -1 });
  return list.map(formatClient);
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  return formatClient(doc);
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const clientCode = await generateClientCode(agencyId);

  const doc = await Model.ClientModel.create({
    agencyId,
    clientCode,
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email || '',
    phone: payload.phone || '',
    dateOfBirth: payload.dateOfBirth || '',
    gender: payload.gender || '',
    streetAddress: payload.streetAddress || '',
    city: payload.city || '',
    state: payload.state || '',
    zipCode: payload.zipCode || '',
    country: payload.country || 'United States',
    primaryDiagnosis: payload.primaryDiagnosis || '',
    allergies: payload.allergies || '',
    mobility: payload.mobility || '',
    livingArrangement: payload.livingArrangement || '',
    emergencyContactName: payload.emergencyContactName || '',
    emergencyContactRelationship: payload.emergencyContactRelationship || '',
    emergencyContactPhone: payload.emergencyContactPhone || '',
    status: payload.status || 'Active',
    notes: payload.notes || '',
  });

  return formatClient(doc);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

  const fields = [
    'firstName', 'lastName', 'email', 'phone', 'dateOfBirth', 'gender',
    'streetAddress', 'city', 'state', 'zipCode', 'country',
    'primaryDiagnosis', 'allergies', 'mobility', 'livingArrangement',
    'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
    'status', 'notes',
  ];

  fields.forEach((field) => {
    if (payload[field] !== undefined) doc[field] = payload[field];
  });

  await doc.save();
  return formatClient(doc);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

  const planCount = await Model.CarePlanModel.countDocuments({ clientId: id, agencyId });
  if (planCount > 0) {
    throw new Error(constants.MESSAGE.CLIENT.HAS_CARE_PLANS);
  }

  await Model.ClientModel.deleteOne({ _id: id });
  return { id: String(id) };
};

module.exports = {
  getStats,
  getAll,
  getById,
  create,
  update,
  remove,
  formatClient,
};
