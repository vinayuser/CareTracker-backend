const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const assessmentConstants = require('../../common/assessmentConstants');
const { DEFAULT_SERVICES } = require('../../common/carePlanConstants');
const { create: createClient } = require('./client.service');
const {
  sendAssessmentCreatedEmail,
  sendQuoteGeneratedEmail,
  sendQuoteAcceptedEmail,
} = require('../common/mail.service');
const {
  getAgencyContext,
  uniqueEmails,
  agencyPortalUrl,
} = require('../common/notifyHelpers');

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

const getCreatorEmail = (req) => {
  const account = getAgencyAccount(req);
  return String(account?.email || '').trim().toLowerCase();
};

const notifyMany = async (emails, sendFn) => {
  const list = uniqueEmails(emails);
  await Promise.all(list.map(async (to) => {
    try {
      await sendFn(to);
    } catch (err) {
      console.error('[assessment] email failed', to, err.message);
    }
  }));
};

const splitClientName = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
};

const syncSummaryFields = (formData = {}) => {
  const ci = formData.clientInfo || {};
  const contact = formData.contactInfo || {};
  return {
    clientName: ci.clientName || '',
    clientPhone: contact.mobile || contact.homePhone || '',
    clientEmail: contact.email || '',
  };
};

const formatAssessment = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.carePlanId = doc.carePlanId ? String(doc.carePlanId) : null;
  item.clientId = doc.clientId ? String(doc.clientId) : null;
  return item;
};

const generateAssessmentCode = async (agencyId) => {
  const count = await Model.ClientAssessmentModel.countDocuments({ agencyId });
  return `ASM-${String(10001 + count).padStart(5, '0')}`;
};

const generatePlanCode = async (agencyId) => {
  const count = await Model.CarePlanModel.countDocuments({ agencyId });
  return `CP-${String(10001 + count).padStart(5, '0')}`;
};

const mapRequestedServices = (requested = []) => {
  if (!requested.length) return DEFAULT_SERVICES.map((s) => ({ ...s }));
  return requested.map((category) => ({
    enabled: true,
    category,
    description: '',
    frequency: 'Daily',
    duration: '30 mins',
    provider: 'Care Giver',
    notes: '',
  }));
};

const mapAssessmentToClientPayload = (formData = {}) => {
  const ci = formData.clientInfo || {};
  const contact = formData.contactInfo || {};
  const emergency = formData.emergencyInfo || {};
  const physician = formData.physicianInfo || {};
  const insurance = formData.insurance || {};
  const { firstName, lastName } = splitClientName(ci.clientName);

  return {
    firstName,
    lastName,
    dateOfBirth: ci.dob || '',
    gender: ci.gender || '',
    maritalStatus: ci.maritalStatus || '',
    phone: contact.mobile || contact.homePhone || '',
    phoneHome: contact.homePhone || '',
    email: contact.email || '',
    preferredLanguage: ci.primaryLanguage || '',
    streetAddress: contact.homeAddress || '',
    city: contact.city || '',
    state: contact.state || '',
    zipCode: contact.zip || '',
    medicalConditions: [ci.primaryDiagnosis, ci.secondaryDiagnoses].filter(Boolean).join('; '),
    allergies: formData.allergies?.details || (formData.allergies?.types || []).join(', '),
    currentMedications: (formData.medications || [])
      .filter((m) => m.name)
      .map((m) => `${m.name} ${m.dosage} ${m.frequency}`.trim())
      .join('; '),
    physicianName: physician.primaryPhysician || '',
    physicianPhone: physician.primaryPhysicianPhone || '',
    pharmacyName: physician.pharmacy || '',
    pharmacyPhone: physician.pharmacyPhone || '',
    preferredHospital: physician.preferredHospital || '',
    insuranceProvider: (insurance.types || []).join(', '),
    insuranceMemberId: insurance.policyNumber || '',
    insuranceGroupNumber: insurance.authorizationNumber || '',
    primaryDiagnosis: ci.primaryDiagnosis || '',
    emergencyContactName: emergency.primaryName || '',
    emergencyContactRelationship: emergency.primaryRelationship || '',
    emergencyContactPhone: emergency.primaryPhone || '',
    alternateContactName: emergency.backupName || '',
    alternateContactRelationship: emergency.backupRelationship || '',
    alternateContactPhone: emergency.backupPhone || '',
    serviceTypes: formData.requestedServices || [],
    careFrequency: '',
    careNotes: formData.coordinatorNotes || '',
    admissionDate: formData.carePlanSummary?.startOfCareDate || '',
    carePlanStartDate: formData.carePlanSummary?.startOfCareDate || '',
    status: 'Active',
    intakeDate: new Date().toISOString().split('T')[0],
  };
};

/** Seed care-plan form sections from assessment physician / insurance / client info. */
const mapAssessmentToCarePlanFormData = (formData = {}) => {
  const ci = formData.clientInfo || {};
  const contact = formData.contactInfo || {};
  const emergency = formData.emergencyInfo || {};
  const physician = formData.physicianInfo || {};
  const insurance = formData.insurance || {};

  return {
    clientInfo: {
      clientName: ci.clientName || '',
      dob: ci.dob || '',
      address: contact.homeAddress || '',
      city: contact.city || '',
      state: contact.state || '',
      zip: contact.zip || '',
      phone: contact.mobile || contact.homePhone || '',
      email: contact.email || '',
      primaryLanguage: ci.primaryLanguage || '',
      gender: ci.gender || '',
      maritalStatus: ci.maritalStatus || '',
      emergencyContact: emergency.primaryName || '',
      emergencyRelationship: emergency.primaryRelationship || '',
      emergencyPhone: emergency.primaryPhone || '',
    },
    medicalInfo: {
      primaryDiagnosis: ci.primaryDiagnosis || '',
      otherDiagnoses: ci.secondaryDiagnoses || '',
      allergies: formData.allergies?.details || (formData.allergies?.types || []).join(', '),
      physician: physician.primaryPhysician || '',
      physicianPhone: physician.primaryPhysicianPhone || '',
    },
    supplementary: {
      preferredHospital: physician.preferredHospital || '',
      preferredPharmacy: physician.pharmacy || '',
      healthInsurance: (insurance.types || []).join(', '),
      policyId: insurance.policyNumber || '',
    },
  };
};

const getOptions = () => assessmentConstants.getOptions();

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.ClientAssessmentModel.find({ agencyId });
  return {
    total: list.length,
    enquiry: list.filter((a) => a.status === 'Enquiry').length,
    quoted: list.filter((a) => a.status === 'Quoted').length,
    accepted: list.filter((a) => a.status === 'Accepted').length,
    declined: list.filter((a) => a.status === 'Declined').length,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };
  if (query.status && query.status !== 'All') filter.status = query.status;
  if (query.client_id) filter.clientId = query.client_id;

  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { clientName: regex },
      { clientPhone: regex },
      { clientEmail: regex },
      { assessmentCode: regex },
      { assessorName: regex },
    ];
  }

  const list = await Model.ClientAssessmentModel.find(filter).sort({ createdAt: -1 });
  return list.map(formatAssessment);
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientAssessmentModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.ASSESSMENT.NOT_FOUND);
  return formatAssessment(doc);
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const summary = syncSummaryFields(payload.formData);
  const doc = await Model.ClientAssessmentModel.create({
    agencyId,
    assessmentCode: await generateAssessmentCode(agencyId),
    assessorName: payload.assessorName || '',
    assessorTitle: payload.assessorTitle || 'Care Assessment Specialist',
    assessorPhoto: payload.assessorPhoto || '',
    assessmentDate: payload.assessmentDate || new Date().toISOString().split('T')[0],
    assessmentTypes: payload.assessmentTypes || [],
    formData: payload.formData,
    status: payload.status || 'Enquiry',
    ...summary,
    createdByAccountId: getAccountId(req),
  });

  try {
    const { agencyName, ownerEmails, ownerName } = await getAgencyContext(agencyId);
    const assessorEmail = getCreatorEmail(req);
    const clientEmail = summary.clientEmail || payload.formData?.contactInfo?.email || '';
    const portalUrl = agencyPortalUrl(req, '/agency/assessments');
    const base = {
      agencyName,
      clientName: summary.clientName || doc.clientName,
      assessmentCode: doc.assessmentCode,
      assessorName: doc.assessorName,
      assessmentDate: doc.assessmentDate,
      portalUrl,
    };
    await notifyMany(
      [...ownerEmails, assessorEmail, clientEmail],
      (to) => sendAssessmentCreatedEmail({
        to,
        recipientName: to === clientEmail
          ? summary.clientName
          : to === assessorEmail
            ? doc.assessorName
            : ownerName,
        ...base,
      }),
    );
  } catch (err) {
    console.error('[assessment] create notify failed', err.message);
  }

  return formatAssessment(doc);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientAssessmentModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.ASSESSMENT.NOT_FOUND);
  if (doc.status === 'Accepted') throw new Error(constants.MESSAGE.ASSESSMENT.ALREADY_ACCEPTED);

  ['assessorName', 'assessorTitle', 'assessorPhoto', 'assessmentDate', 'assessmentTypes', 'formData', 'status'].forEach((field) => {
    if (payload[field] !== undefined) doc[field] = payload[field];
  });

  if (payload.formData) {
    Object.assign(doc, syncSummaryFields(payload.formData));
  }

  await doc.save();

  // Keep draft care-plan form in sync when assessment is edited after quote
  if (payload.formData && doc.carePlanId) {
    const plan = await Model.CarePlanModel.findOne({ _id: doc.carePlanId, agencyId });
    if (plan && plan.quoteStatus !== 'Accepted') {
      const seeded = mapAssessmentToCarePlanFormData(payload.formData);
      const existing = plan.formData?.toObject?.() || plan.formData || {};
      plan.formData = {
        ...existing,
        clientInfo: { ...(existing.clientInfo || {}), ...seeded.clientInfo },
        medicalInfo: { ...(existing.medicalInfo || {}), ...seeded.medicalInfo },
        supplementary: { ...(existing.supplementary || {}), ...seeded.supplementary },
      };
      await plan.save();
    }
  }

  return formatAssessment(doc);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientAssessmentModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.ASSESSMENT.NOT_FOUND);
  if (doc.status === 'Accepted') throw new Error(constants.MESSAGE.ASSESSMENT.ALREADY_ACCEPTED);
  await Model.ClientAssessmentModel.deleteOne({ _id: id });
  return { id: String(id) };
};

const generateQuote = async (req, id, pricing) => {
  const agencyId = getAgencyId(req);
  const assessment = await Model.ClientAssessmentModel.findOne({ _id: id, agencyId });
  if (!assessment) throw new Error(constants.MESSAGE.ASSESSMENT.NOT_FOUND);
  if (assessment.status === 'Accepted') throw new Error(constants.MESSAGE.ASSESSMENT.ALREADY_ACCEPTED);
  if (assessment.carePlanId) throw new Error(constants.MESSAGE.CARE_PLAN.ALREADY_QUOTED);

  const formData = assessment.formData || {};
  const summary = formData.carePlanSummary || {};
  const weeklyHours = pricing.weeklyHours ?? (Number(summary.recommendedWeeklyHours) || 0);
  const hourlyRate = pricing.hourlyRate ?? 0;
  const quotedMonthlyPrice = pricing.quotedMonthlyPrice ?? Math.round(weeklyHours * hourlyRate * 4.33 * 100) / 100;

  const seededForm = mapAssessmentToCarePlanFormData(formData);

  const plan = await Model.CarePlanModel.create({
    agencyId,
    assessmentId: assessment._id,
    planCode: await generatePlanCode(agencyId),
    status: 'Draft',
    quoteStatus: 'Quoted',
    hourlyRate,
    weeklyHours,
    quotedMonthlyPrice,
    effectiveDate: summary.startOfCareDate || '',
    reviewDate: '',
    assessmentNotes: formData.coordinatorNotes || '',
    services: mapRequestedServices(formData.requestedServices),
    formData: seededForm,
    createdByAccountId: getAccountId(req),
  });

  assessment.carePlanId = plan._id;
  assessment.status = 'Quoted';
  await assessment.save();

  try {
    const { agencyName, ownerEmails, ownerName } = await getAgencyContext(agencyId);
    const clientEmail = assessment.clientEmail || assessment.formData?.contactInfo?.email || '';
    const portalUrl = agencyPortalUrl(req, `/agency/care-plans/${plan._id}`);
    const base = {
      agencyName,
      clientName: assessment.clientName,
      assessmentCode: assessment.assessmentCode,
      planCode: plan.planCode,
      weeklyHours: plan.weeklyHours,
      hourlyRate: plan.hourlyRate,
      quotedMonthlyPrice: plan.quotedMonthlyPrice,
      portalUrl,
    };
    await notifyMany(
      [...ownerEmails, clientEmail],
      (to) => sendQuoteGeneratedEmail({
        to,
        recipientName: to === clientEmail ? assessment.clientName : ownerName,
        ...base,
      }),
    );
  } catch (err) {
    console.error('[assessment] quote notify failed', err.message);
  }

  return {
    assessment: formatAssessment(assessment),
    carePlan: {
      id: String(plan._id),
      planCode: plan.planCode,
      status: plan.status,
      quoteStatus: plan.quoteStatus,
      hourlyRate: plan.hourlyRate,
      weeklyHours: plan.weeklyHours,
      quotedMonthlyPrice: plan.quotedMonthlyPrice,
    },
  };
};

const acceptQuote = async (req, id) => {
  const agencyId = getAgencyId(req);
  const assessment = await Model.ClientAssessmentModel.findOne({ _id: id, agencyId });
  if (!assessment) throw new Error(constants.MESSAGE.ASSESSMENT.NOT_FOUND);
  if (assessment.status === 'Accepted') throw new Error(constants.MESSAGE.ASSESSMENT.ALREADY_ACCEPTED);
  if (!assessment.carePlanId) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_QUOTED);

  const plan = await Model.CarePlanModel.findOne({ _id: assessment.carePlanId, agencyId });
  if (!plan) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  const client = await createClient(req, mapAssessmentToClientPayload(assessment.formData));
  const seededForm = mapAssessmentToCarePlanFormData(assessment.formData);
  const existingForm = plan.formData?.toObject?.() || plan.formData || {};

  plan.clientId = client.id;
  plan.status = 'Active';
  plan.quoteStatus = 'Accepted';
  plan.agreementDate = new Date().toISOString().split('T')[0];
  plan.formData = {
    ...existingForm,
    clientInfo: { ...(existingForm.clientInfo || {}), ...seededForm.clientInfo },
    medicalInfo: { ...(existingForm.medicalInfo || {}), ...seededForm.medicalInfo },
    supplementary: { ...(existingForm.supplementary || {}), ...seededForm.supplementary },
  };
  await plan.save();

  assessment.clientId = client.id;
  assessment.status = 'Accepted';
  await assessment.save();

  try {
    const { agencyName, ownerEmails, ownerName } = await getAgencyContext(agencyId);
    const clientEmail = client.email || assessment.clientEmail || assessment.formData?.contactInfo?.email || '';
    const portalUrl = agencyPortalUrl(req, `/agency/care-plans/${plan._id}`);
    const base = {
      agencyName,
      clientName: assessment.clientName || `${client.firstName || ''} ${client.lastName || ''}`.trim(),
      assessmentCode: assessment.assessmentCode,
      planCode: plan.planCode,
      quotedMonthlyPrice: plan.quotedMonthlyPrice,
      portalUrl,
    };
    await notifyMany(
      [...ownerEmails, clientEmail],
      (to) => sendQuoteAcceptedEmail({
        to,
        recipientName: to === clientEmail ? base.clientName : ownerName,
        ...base,
      }),
    );
  } catch (err) {
    console.error('[assessment] accept notify failed', err.message);
  }

  return {
    assessment: formatAssessment(assessment),
    client,
    carePlan: {
      id: String(plan._id),
      planCode: plan.planCode,
      status: plan.status,
      quoteStatus: plan.quoteStatus,
      quotedMonthlyPrice: plan.quotedMonthlyPrice,
    },
  };
};

module.exports = {
  getOptions,
  getStats,
  getAll,
  getById,
  create,
  update,
  remove,
  generateQuote,
  acceptQuote,
  formatAssessment,
};
