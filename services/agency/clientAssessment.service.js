const mongoose = require('mongoose');
const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const assessmentConstants = require('../../common/assessmentConstants');
const { DEFAULT_SERVICES } = require('../../common/carePlanConstants');
const { create: createClient, formatClient } = require('./client.service');
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
const { allocateNextCode, isDuplicateKeyError } = require('../../common/agencyCodeSequence');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const toObjectId = (value) => {
  if (!value) return value;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return new mongoose.Types.ObjectId(String(value));
};

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

const syncSummaryFields = (formData = {}) => {
  const ci = formData.clientInfo || {};
  const contact = formData.contactInfo || {};
  const clientName = [ci.firstName, ci.lastName].filter(Boolean).join(' ').trim()
    || ci.clientName
    || '';
  return {
    clientName,
    clientPhone: contact.mobile || contact.homePhone || '',
    clientEmail: contact.email || '',
  };
};

const PACKET_FORM_CODES = [
  '110', '324', '325', '350', '400', '410', '610', '790', '800',
  '1009', '1081', '1082', '1083', '7000', '7050',
];

const packetProgressFromFormData = (formData = {}) => {
  const meta = formData?.formMeta || {};
  let saved = 0;
  let started = 0;
  PACKET_FORM_CODES.forEach((code) => {
    const status = meta[code]?.status;
    if (status === 'saved' || status === 'complete') saved += 1;
    else if (status === 'in_progress') started += 1;
  });
  return { total: PACKET_FORM_CODES.length, saved, started };
};

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const formatAssessment = (doc, req = null) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  const plan = doc.carePlanId?._id ? doc.carePlanId : null;
  item.carePlanId = plan ? String(plan._id) : (doc.carePlanId ? String(doc.carePlanId) : null);
  const clientRaw = doc.clientId;
  const clientDoc = clientRaw && typeof clientRaw === 'object' && (clientRaw._id || clientRaw.id || clientRaw.firstName)
    ? clientRaw
    : null;
  item.clientId = clientDoc
    ? String(clientDoc._id || clientDoc.id)
    : (clientRaw ? String(clientRaw) : null);
  if (plan) {
    item.hourlyRate = plan.hourlyRate;
    item.weeklyHours = plan.weeklyHours;
    item.quotedMonthlyPrice = plan.quotedMonthlyPrice;
  }
  if (clientDoc) {
    item.client = formatClient(clientDoc, req);
    item.clientPhoto = item.client?.profilePic || '';
  } else {
    item.client = null;
    item.clientPhoto = '';
  }
  item.packetProgress = doc.packetProgress || packetProgressFromFormData(doc.formData);
  item.recommendedWeeklyHours = Number(doc.formData?.carePlanSummary?.recommendedWeeklyHours) || 0;
  return item;
};

/** List row — no formData / nested client payload. */
const formatAssessmentListItem = (doc, req = null) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  const plan = doc.carePlanId && typeof doc.carePlanId === 'object' && doc.carePlanId._id
    ? doc.carePlanId
    : null;
  const clientDoc = doc.clientId && typeof doc.clientId === 'object' && (doc.clientId._id || doc.clientId.profilePicPath)
    ? doc.clientId
    : null;
  const photoPath = clientDoc?.profilePicPath || '';
  delete item.formData;
  delete item.formMeta;
  delete item.client;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.carePlanId = plan ? String(plan._id) : (doc.carePlanId ? String(doc.carePlanId) : null);
  item.clientId = clientDoc
    ? String(clientDoc._id)
    : (doc.clientId ? String(doc.clientId) : null);
  item.hourlyRate = plan?.hourlyRate;
  item.weeklyHours = plan?.weeklyHours;
  item.quotedMonthlyPrice = plan?.quotedMonthlyPrice;
  item.clientPhoto = photoPath ? functions.buildUploadUrl(photoPath, req) : '';
  const storedProgress = doc.packetProgress && typeof doc.packetProgress === 'object'
    ? {
      total: Number(doc.packetProgress.total) || PACKET_FORM_CODES.length,
      saved: Number(doc.packetProgress.saved) || 0,
      started: Number(doc.packetProgress.started) || 0,
    }
    : null;
  const computedProgress = packetProgressFromFormData(doc.formData || { formMeta: doc.formMeta });
  item.packetProgress = (computedProgress.saved || computedProgress.started)
    ? computedProgress
    : (storedProgress || computedProgress);
  item.recommendedWeeklyHours = Number(
    doc.recommendedWeeklyHours
    ?? doc.formData?.carePlanSummary?.recommendedWeeklyHours,
  ) || 0;
  return item;
};

const applyPacketProgress = (doc) => {
  doc.packetProgress = packetProgressFromFormData(doc.formData);
  return doc;
};

const resolveClientPhoto = async (agencyId, assessment, req) => {
  if (assessment.clientPhoto) return assessment;
  const email = String(assessment.clientEmail || assessment.formData?.contactInfo?.email || '').trim().toLowerCase();
  const phone = String(assessment.clientPhone || assessment.formData?.contactInfo?.mobile || assessment.formData?.contactInfo?.homePhone || '').trim();
  if (!email && !phone) return assessment;

  const or = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone }, { phoneHome: phone });
  const client = await Model.ClientModel.findOne({ agencyId, $or: or });
  if (client?.profilePicPath) {
    assessment.clientPhoto = functions.buildUploadUrl(client.profilePicPath, req);
    assessment.client = formatClient(client, req);
  }
  return assessment;
};

const notifyQuoteGenerated = async (req, assessment, plan) => {
  try {
    const { agencyName, ownerEmails, ownerName } = await getAgencyContext(getAgencyId(req));
    const clientEmail = assessment.clientEmail || assessment.formData?.contactInfo?.email || '';
    const base = {
      agencyName,
      clientName: assessment.clientName,
      assessmentCode: assessment.assessmentCode,
      planCode: plan.planCode,
      weeklyHours: plan.weeklyHours,
      hourlyRate: plan.hourlyRate,
      quotedMonthlyPrice: plan.quotedMonthlyPrice,
      portalUrl: agencyPortalUrl(req, `/agency/care-plans/${plan._id}`),
    };
    await notifyMany([...ownerEmails, clientEmail], (to) => sendQuoteGeneratedEmail({
      to,
      recipientName: to === clientEmail ? assessment.clientName : ownerName,
      ...base,
    }));
  } catch (err) {
    console.error('[assessment] quote notify failed', err.message);
  }
};

const generateAssessmentCode = async (agencyId) => allocateNextCode({
  agencyId,
  key: 'assessment',
  prefix: 'ASM',
  existingModel: Model.ClientAssessmentModel,
  codeField: 'assessmentCode',
});

const generatePlanCode = async (agencyId) => allocateNextCode({
  agencyId,
  key: 'care_plan',
  prefix: 'CP',
  existingModel: Model.CarePlanModel,
  codeField: 'planCode',
});

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
  const firstName = String(ci.firstName || '').trim();
  const lastName = String(ci.lastName || '').trim();
  if (!firstName || !lastName) {
    throw new Error('First name and last name are required to onboard the client');
  }

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
  const agencyId = toObjectId(getAgencyId(req));
  const rows = await Model.ClientAssessmentModel.aggregate([
    { $match: { agencyId } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(rows.map((row) => [row._id, row.n]));
  const enquiry = byStatus.Enquiry || 0;
  const quoted = byStatus.Quoted || 0;
  const accepted = byStatus.Accepted || 0;
  const declined = byStatus.Declined || 0;
  return {
    total: enquiry + quoted + accepted + declined,
    enquiry,
    quoted,
    accepted,
    declined,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = toObjectId(getAgencyId(req));
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const filter = { agencyId };
  if (query.status && query.status !== 'All') filter.status = query.status;
  if (query.client_id && mongoose.Types.ObjectId.isValid(String(query.client_id))) {
    filter.clientId = toObjectId(query.client_id);
  }

  const search = String(query.search || '').trim();
  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { clientName: regex },
      { clientPhone: regex },
      { clientEmail: regex },
      { assessmentCode: regex },
      { assessorName: regex },
    ];
  }

  const [total, list] = await Promise.all([
    Model.ClientAssessmentModel.countDocuments(filter),
    Model.ClientAssessmentModel.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $project: {
          assessmentCode: 1,
          status: 1,
          assessorName: 1,
          assessorTitle: 1,
          assessorPhoto: 1,
          assessmentDate: 1,
          clientName: 1,
          clientPhone: 1,
          clientEmail: 1,
          carePlanId: 1,
          clientId: 1,
          packetProgress: 1,
          createdAt: 1,
          updatedAt: 1,
          agencyId: 1,
          formMeta: '$formData.formMeta',
          recommendedWeeklyHours: '$formData.carePlanSummary.recommendedWeeklyHours',
        },
      },
      {
        $lookup: {
          from: Model.CarePlanModel.collection.name,
          let: { planId: '$carePlanId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$planId'] } } },
            { $project: { hourlyRate: 1, weeklyHours: 1, quotedMonthlyPrice: 1 } },
          ],
          as: '_carePlan',
        },
      },
      {
        $lookup: {
          from: Model.ClientModel.collection.name,
          let: { cid: '$clientId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$cid'] } } },
            { $project: { profilePicPath: 1 } },
          ],
          as: '_client',
        },
      },
      {
        $addFields: {
          carePlanId: { $ifNull: [{ $arrayElemAt: ['$_carePlan', 0] }, '$carePlanId'] },
          clientId: { $ifNull: [{ $arrayElemAt: ['$_client', 0] }, '$clientId'] },
        },
      },
      { $project: { _carePlan: 0, _client: 0 } },
    ]),
  ]);

  return {
    items: list.map((doc) => formatAssessmentListItem(doc, req)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      from: total === 0 ? 0 : (page - 1) * limit + 1,
      to: Math.min(page * limit, total),
    },
  };
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.ClientAssessmentModel.findOne({ _id: id, agencyId }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.ASSESSMENT.NOT_FOUND);
  const assessment = formatAssessment(doc, req);
  return resolveClientPhoto(agencyId, assessment, req);
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const summary = syncSummaryFields(payload.formData);
  let doc;
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      doc = await Model.ClientAssessmentModel.create({
        agencyId,
        assessmentCode: await generateAssessmentCode(agencyId),
        assessorName: payload.assessorName || '',
        assessorTitle: payload.assessorTitle || 'Care Assessment Specialist',
        assessorPhoto: payload.assessorPhoto || '',
        assessmentDate: payload.assessmentDate || new Date().toISOString().split('T')[0],
        assessmentTypes: payload.assessmentTypes || [],
        formData: payload.formData,
        packetProgress: packetProgressFromFormData(payload.formData),
        status: payload.status || 'Enquiry',
        clientId: payload.clientId || null,
        ...summary,
        createdByAccountId: getAccountId(req),
      });
      break;
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      lastError = err;
    }
  }
  if (!doc) throw lastError || new Error('Failed to create assessment');

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

  return formatAssessment(doc, req);
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
    applyPacketProgress(doc);
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

  return formatAssessment(doc, req);
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
    version: 'v1',
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
  await notifyQuoteGenerated(req, assessment, plan);

  return {
    assessment: formatAssessment(assessment, req),
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

/** Update pricing on the existing care plan quote. Never creates a client. */
const updateQuote = async (req, id, pricing) => {
  const agencyId = getAgencyId(req);
  const assessment = await Model.ClientAssessmentModel.findOne({ _id: id, agencyId });
  if (!assessment) throw new Error(constants.MESSAGE.ASSESSMENT.NOT_FOUND);
  if (!assessment.carePlanId) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_QUOTED);

  const plan = await Model.CarePlanModel.findOne({ _id: assessment.carePlanId, agencyId });
  if (!plan) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  const { archiveCurrentVersion } = require('./carePlan.service');
  await archiveCurrentVersion(req, plan);

  const weeklyHours = pricing.weeklyHours ?? plan.weeklyHours ?? 0;
  const hourlyRate = pricing.hourlyRate ?? plan.hourlyRate ?? 0;
  plan.hourlyRate = hourlyRate;
  plan.weeklyHours = weeklyHours;
  plan.quotedMonthlyPrice = pricing.quotedMonthlyPrice
    ?? Math.round(weeklyHours * hourlyRate * 4.33 * 100) / 100;
  await plan.save();
  await notifyQuoteGenerated(req, assessment, plan);

  return {
    assessment: formatAssessment(assessment, req),
    carePlan: {
      id: String(plan._id),
      planCode: plan.planCode,
      status: plan.status,
      quoteStatus: plan.quoteStatus,
      hourlyRate: plan.hourlyRate,
      weeklyHours: plan.weeklyHours,
      quotedMonthlyPrice: plan.quotedMonthlyPrice,
      version: plan.version,
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

  const { archiveCurrentVersion } = require('./carePlan.service');
  await archiveCurrentVersion(req, plan);

  const client = await createClient(req, mapAssessmentToClientPayload(assessment.formData));
  const seededForm = mapAssessmentToCarePlanFormData(assessment.formData);
  const existingForm = plan.formData?.toObject?.() || plan.formData || {};

  plan.clientId = client.id;
  plan.status = 'Active';
  plan.quoteStatus = 'Accepted';
  plan.agreementDate = new Date().toISOString().split('T')[0];
  plan.formData = {
    ...existingForm,
    clientInfo: {
      ...(existingForm.clientInfo || {}),
      ...seededForm.clientInfo,
      clientId: client.clientCode || seededForm.clientInfo?.clientId || '',
    },
    medicalInfo: { ...(existingForm.medicalInfo || {}), ...seededForm.medicalInfo },
    supplementary: { ...(existingForm.supplementary || {}), ...seededForm.supplementary },
  };
  await plan.save();

  assessment.clientId = client.id;
  assessment.status = 'Accepted';
  await assessment.save();

  // If this assessment came from a lead, attach the client and mark lead Converted (do not create another client).
  try {
    const leadId = assessment.formData?.leadMeta?.leadId;
    const leadFilter = leadId
      ? { _id: leadId, agencyId }
      : { agencyId, assessmentId: assessment._id };
    const lead = await Model.LeadModel.findOne(leadFilter);
    if (lead) {
      lead.clientId = client.id;
      lead.stage = 'Converted';
      lead.formData = {
        ...(lead.formData || {}),
        statusInfo: {
          ...(lead.formData?.statusInfo || {}),
          stage: 'Converted',
          nextAction: 'Onboarded from assessment',
        },
      };
      lead.nextAction = 'Onboarded from assessment';
      await lead.save();
    }
  } catch (err) {
    console.warn('[assessment] link lead after onboard failed', err.message);
  }

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
    assessment: formatAssessment(assessment, req),
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
  updateQuote,
  acceptQuote,
  formatAssessment,
  formatAssessmentListItem,
};
