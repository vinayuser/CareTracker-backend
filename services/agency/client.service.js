const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const clientConstants = require('../../common/clientConstants');
const insuranceConstants = require('../../common/insuranceIntakeConstants');
const { DOC_KEYS } = require('../../middleware/insuranceIntakeUpload');
const { resolveProfilePicPath } = require('../../common/profilePicUpload');
const { sendClientWelcomeEmail } = require('../common/mail.service');

const CLIENT_PAYLOAD_FIELDS = [
  'intakeDate', 'intakeId',
  'firstName', 'lastName', 'preferredName', 'dateOfBirth', 'gender', 'maritalStatus', 'ssnLast4',
  'streetAddress', 'aptSuite', 'city', 'state', 'zipCode', 'country', 'phone', 'phoneHome', 'email',
  'preferredLanguage', 'ethnicity', 'race',
  'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
  'alternateContactName', 'alternateContactRelationship', 'alternateContactPhone',
  'physicianName', 'physicianPhone', 'lastVisitDate', 'pharmacyName', 'pharmacyPhone', 'preferredHospital',
  'insuranceProvider', 'insuranceMemberId', 'insuranceGroupNumber',
  'medicalConditions', 'primaryDiagnosis', 'allergies', 'currentMedications', 'specialDiet', 'mobility',
  'livingArrangements', 'livingArrangement', 'homeAccessibility', 'residenceType', 'assistiveDevices',
  'hasPets', 'petsDescription', 'fallHistory', 'fallHistoryDescription',
  'serviceTypes', 'mobilityAssistanceNeeded', 'mobilityAssistanceDescription',
  'personalCareAssistanceNeeded', 'personalCareAssistanceDescription',
  'careFrequency', 'preferredDays', 'preferredTimes', 'careNotes',
  'paymentResponsibility', 'paymentResponsibilityOther',
  'billingStreetAddress', 'billingCity', 'billingState', 'billingZip', 'paymentMethods',
  'authorizationSignature', 'authorizationDate', 'authorizationPrintedName', 'authorizationRelationship',
  'intakeCompletedBy', 'intakeCompletedDate', 'assignedTo', 'admissionDate', 'carePlanStartDate',
  'status', 'notes',
];

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
  const parts = [doc.streetAddress, doc.aptSuite, doc.city, doc.state, doc.zipCode].filter(Boolean);
  return parts.join(', ');
};

const syncDerivedFields = (data) => {
  const next = { ...data };

  if (next.medicalConditions && !next.primaryDiagnosis) {
    next.primaryDiagnosis = next.medicalConditions;
  } else if (next.primaryDiagnosis && !next.medicalConditions) {
    next.medicalConditions = next.primaryDiagnosis;
  }

  if (Array.isArray(next.livingArrangements) && next.livingArrangements.length > 0) {
    next.livingArrangement = next.livingArrangements.join(', ');
  } else if (next.livingArrangement && !next.livingArrangements?.length) {
    next.livingArrangements = next.livingArrangement.split(',').map((s) => s.trim()).filter(Boolean);
  }

  return next;
};

const pickPayload = (payload) => {
  const data = {};
  CLIENT_PAYLOAD_FIELDS.forEach((field) => {
    if (payload[field] !== undefined) data[field] = payload[field];
  });
  return syncDerivedFields(data);
};

const formatClient = (doc, req) => {
  const client = functions.toClientDoc(doc);
  if (!client) return null;
  client.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  client.fullName = `${doc.firstName} ${doc.lastName}`.trim();
  client.age = computeAge(doc.dateOfBirth);
  client.address = formatAddress(doc);
  client.profilePic = doc.profilePicPath
    ? functions.buildUploadUrl(doc.profilePicPath, req)
    : '';
  client.hasPortalAccess = Boolean(doc.accountId);
  client.accountId = doc.accountId ? String(doc.accountId) : null;

  if (!client.primaryDiagnosis && client.medicalConditions) {
    client.primaryDiagnosis = client.medicalConditions;
  }
  if (!client.livingArrangement && client.livingArrangements?.length) {
    client.livingArrangement = client.livingArrangements.join(', ');
  }

  return client;
};

const generateClientCode = async (agencyId) => {
  // Use max existing code + 1 (countDocuments reuses codes after deletes / failed creates)
  const latest = await Model.ClientModel.findOne({ agencyId })
    .sort({ clientCode: -1 })
    .select('clientCode')
    .lean();
  let next = 10001;
  const match = String(latest?.clientCode || '').match(/(\d+)\s*$/);
  if (match) next = Number(match[1]) + 1;
  return `CLT-${String(next).padStart(5, '0')}`;
};

const isDuplicateKeyError = (err) => err?.code === 11000 || /duplicate key/i.test(String(err?.message || ''));

const getOptions = () => clientConstants.getOptions();

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.ClientModel.find({ agencyId });
  return {
    total: list.length,
    active: list.filter((c) => c.status === 'Active').length,
    inactive: list.filter((c) => c.status === 'Inactive').length,
    pending: list.filter((c) => c.status === 'Pending').length,
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
      { preferredName: regex },
      { email: regex },
      { phone: regex },
      { phoneHome: regex },
      { clientCode: regex },
      { intakeId: regex },
      { medicalConditions: regex },
      { insuranceProvider: regex },
    ];
  }

  const list = await Model.ClientModel.find(filter).sort({ createdAt: -1 });
  return list.map((doc) => formatClient(doc, req));
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  return formatClient(doc, req);
};

const applyProfilePic = (doc, payload) => {
  const nextPath = resolveProfilePicPath(payload?.profilePic, 'clients');
  if (nextPath === null) return;
  doc.profilePicPath = nextPath;
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const data = pickPayload(payload);
  const profilePicPath = resolveProfilePicPath(payload?.profilePic, 'clients');
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const doc = await Model.ClientModel.create({
        agencyId,
        clientCode: await generateClientCode(agencyId),
        ...data,
        status: data.status || 'Pending',
        ...(profilePicPath ? { profilePicPath } : {}),
      });
      return formatClient(doc, req);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to create client');
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

  const data = pickPayload(payload);
  CLIENT_PAYLOAD_FIELDS.forEach((field) => {
    if (data[field] !== undefined) doc[field] = data[field];
  });
  applyProfilePic(doc, payload);

  await doc.save();
  return formatClient(doc, req);
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

/** Latest related forms/docs for client ZIP export (agency owner). */
const getRelatedForms = async (req, id) => {
  const agencyId = getAgencyId(req);
  const client = await Model.ClientModel.findOne({ _id: id, agencyId });
  if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

  const filter = { agencyId, clientId: client._id };
  const [assessment, carePlan, insuranceIntake, evvEnrollment] = await Promise.all([
    Model.ClientAssessmentModel.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).lean(),
    Model.CarePlanModel.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).lean(),
    Model.ClientInsuranceIntakeModel.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).lean(),
    Model.EvvEnrollmentModel.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).lean(),
  ]);

  const documents = [];
  if (insuranceIntake?.formData?.requiredDocuments) {
    const docs = insuranceIntake.formData.requiredDocuments;
    DOC_KEYS.forEach((key) => {
      const entry = docs[key];
      const filePath = String(entry?.path || '').trim();
      if (!filePath) return;
      const label = insuranceConstants.REQUIRED_DOCUMENTS.find((d) => d.key === key)?.label || key;
      documents.push({
        key,
        label,
        url: functions.buildUploadUrl(filePath, req),
        originalName: String(entry.originalName || '').trim(),
        mimeType: String(entry.mimeType || '').trim(),
      });
    });
  }

  return {
    client: {
      id: String(client._id),
      clientCode: client.clientCode || '',
      fullName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
    },
    assessment: assessment
      ? { id: String(assessment._id), assessmentCode: assessment.assessmentCode || '' }
      : null,
    care_plan: carePlan
      ? { id: String(carePlan._id), planCode: carePlan.planCode || '' }
      : null,
    insurance_intake: insuranceIntake
      ? {
        id: String(insuranceIntake._id),
        intakeCode: insuranceIntake.intakeCode || '',
        documents,
      }
      : null,
    evv_enrollment: evvEnrollment
      ? { id: String(evvEnrollment._id), enrollmentCode: evvEnrollment.enrollmentCode || '' }
      : null,
  };
};

/**
 * Create or update a CLIENT portal account and email credentials.
 */
const setPassword = async (req, id, password) => {
  const agencyId = getAgencyId(req);
  const client = await Model.ClientModel.findOne({ _id: id, agencyId });
  if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

  const email = String(client.email || '').trim().toLowerCase();
  if (!email) throw new Error(constants.MESSAGE.CLIENT.EMAIL_MISSING);

  const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim() || email;
  let account = null;

  if (client.accountId) {
    account = await Model.AgencyAccountModel.findOne({
      _id: client.accountId,
      agencyId,
      role: 'CLIENT',
    });
  }

  if (!account) {
    account = await Model.AgencyAccountModel.findOne({
      agencyId,
      role: 'CLIENT',
      clientId: client._id,
    });
  }

  if (!account) {
    const conflict = await Model.AgencyAccountModel.findOne({
      $or: [{ email }, { userId: email }],
    });
    if (conflict) {
      if (conflict.role === 'CLIENT' && String(conflict.clientId) === String(client._id)) {
        account = conflict;
      } else {
        throw new Error(constants.MESSAGE.CLIENT.ACCOUNT_CONFLICT);
      }
    }
  }

  if (!account) {
    account = new Model.AgencyAccountModel({
      userId: email,
      email,
      fullName,
      role: 'CLIENT',
      status: 'Active',
      agencyId,
      clientId: client._id,
      phone: client.phone || client.phoneHome || '',
      dateOfBirth: client.dateOfBirth || '',
      jti: functions.generateRandomStringAndNumbers(20),
    });
  } else {
    account.userId = email;
    account.email = email;
    account.fullName = fullName;
    account.clientId = client._id;
    account.agencyId = agencyId;
    account.status = 'Active';
    if (client.phone || client.phoneHome) {
      account.phone = client.phone || client.phoneHome;
    }
  }

  await account.setPassword(password);
  account.jti = functions.generateRandomStringAndNumbers(20);
  await account.save();

  client.accountId = account._id;
  await client.save();

  const agency = await Model.AgencyModel.findById(agencyId).select('name');
  await sendClientWelcomeEmail({
    to: email,
    clientName: fullName,
    agencyName: agency?.name || '',
    email,
    password,
  });

  return formatClient(client, req);
};

module.exports = {
  getOptions,
  getStats,
  getAll,
  getById,
  create,
  update,
  remove,
  getRelatedForms,
  formatClient,
  setPassword,
};
