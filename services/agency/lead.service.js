const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const leadConstants = require('../../common/leadConstants');
const { create: createClient } = require('./client.service');
const { create: createAssessment } = require('./clientAssessment.service');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const getAccountId = (req) => {
  const account = getAgencyAccount(req);
  return account?._id || account?.id || null;
};

const splitName = (fullName = '') => {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Unknown',
    lastName: parts.slice(1).join(' ') || 'Lead',
  };
};

/** Parse "82 Years (12 May 1944)" or ISO / YYYY-MM-DD into DOB when possible */
const parseAgeOrDob = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return { dateOfBirth: '', ageHint: '' };
  const paren = raw.match(/\(([^)]+)\)/);
  const candidate = paren ? paren[1].trim() : raw;
  const iso = candidate.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (iso) return { dateOfBirth: iso[1], ageHint: raw };
  const parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return { dateOfBirth: `${y}-${m}-${d}`, ageHint: raw };
  }
  return { dateOfBirth: '', ageHint: raw };
};

const syncSummaryFields = (formData = {}) => {
  const basic = formData.basicInfo || {};
  const recipient = formData.careRecipient || {};
  return {
    fullName: basic.fullName || '',
    phone: basic.phone || '',
    email: String(basic.email || '').trim().toLowerCase(),
    recipientName: recipient.name || '',
    leadSource: basic.leadSource || '',
  };
};

const formatLead = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.clientId = doc.clientId ? String(doc.clientId) : null;
  item.assessmentId = doc.assessmentId ? String(doc.assessmentId) : null;
  item.assignedToAccountId = doc.assignedToAccountId ? String(doc.assignedToAccountId) : null;
  item.createdByAccountId = doc.createdByAccountId ? String(doc.createdByAccountId) : null;
  item.formData = doc.formData || {};
  return item;
};

const pushActivity = (formData, activity) => {
  const activities = Array.isArray(formData.activities) ? [...formData.activities] : [];
  activities.unshift({
    id: `act_${Date.now()}`,
    at: new Date().toISOString(),
    ...activity,
  });
  return { ...formData, activities: activities.slice(0, 50) };
};

const resolveNextStageFromContact = (payload = {}) => {
  if (payload.callStatus === 'cancel') return 'Contacted';
  if (payload.callStatus === 'needs_time') return 'Contacted';
  if (payload.callStatus !== 'move_next') return 'Contacted';
  if (payload.nextLevel === 'Schedule Home Assessment') return 'Assessment Scheduled';
  if (payload.nextLevel === 'Proposal Sent') return 'Proposal Sent';
  if (payload.nextLevel === 'Converted') return 'Converted';
  return 'Contacted';
};

const mapLeadToAssessmentPayload = (lead, extras = {}) => {
  const fd = lead.formData || {};
  const basic = fd.basicInfo || {};
  const recipient = fd.careRecipient || {};
  const family = fd.familyRep || {};
  const care = fd.careSummary || {};
  const home = fd.homeAssessment || {};
  const contact = fd.contactLog || {};
  const { dateOfBirth } = parseAgeOrDob(recipient.ageOrDob);
  const conditions = Array.isArray(recipient.medicalConditions)
    ? recipient.medicalConditions.join(', ')
    : (recipient.medicalConditions || '');
  const address = family.address || basic.zipLocation || home.location || '';
  const notesParts = [
    care.careNotes,
    home.notes,
    contact.notes,
    lead.notes,
  ].filter(Boolean);

  return {
    assessorName: extras.assessorName || home.assessorName || lead.assignedToName || '',
    assessorTitle: extras.assessorTitle || 'Care Assessment Specialist',
    assessorPhoto: '',
    assessmentDate: extras.assessmentDate || home.visitDate || new Date().toISOString().slice(0, 10),
    assessmentTypes: extras.assessmentTypes || ['Initial Assessment'],
    status: 'Enquiry',
    clientId: lead.clientId || null,
    formData: {
      clientInfo: {
        clientName: recipient.name || basic.fullName || lead.fullName || '',
        dob: dateOfBirth,
        age: '',
        gender: recipient.gender || '',
        ssn: '',
        primaryLanguage: '',
        religion: '',
        height: '',
        weight: '',
        interpreterNeeded: false,
        maritalStatus: '',
        primaryDiagnosis: conditions,
        secondaryDiagnoses: '',
      },
      contactInfo: {
        homeAddress: address,
        city: '',
        state: '',
        zip: basic.zipLocation || '',
        homePhone: basic.alternateNumber || '',
        mobile: basic.phone || lead.phone || '',
        email: basic.email || lead.email || '',
        preferredContactMethods: basic.preferredContactMethod ? [basic.preferredContactMethod] : [],
      },
      responsibleParty: {
        name: family.name || basic.fullName || '',
        relationship: family.relationship || basic.relationship || '',
        phone: family.phone || basic.phone || '',
        email: family.email || basic.email || '',
        powerOfAttorney: false,
        medicalPoa: false,
        guardian: false,
      },
      physicianInfo: {
        primaryPhysician: recipient.doctorClinic || '',
        primaryPhysicianPhone: '',
        specialists: '',
        preferredHospital: '',
        pharmacy: '',
        pharmacyPhone: '',
      },
      insurance: { types: [], policyNumber: '', authorizationNumber: '', hoursAuthorized: '', startDate: '' },
      emergencyInfo: {
        primaryName: family.name || basic.fullName || '',
        primaryRelationship: family.relationship || basic.relationship || '',
        primaryPhone: family.phone || basic.phone || '',
        backupName: '',
        backupRelationship: '',
        backupPhone: '',
      },
      medicalHistory: Array.isArray(recipient.medicalConditions) ? recipient.medicalConditions : [],
      medicalHistoryOther: '',
      allergies: {
        types: recipient.allergies && recipient.allergies !== 'No Known Allergies' ? [recipient.allergies] : [],
        details: recipient.allergies || '',
      },
      medications: [],
      adls: {},
      adlComments: '',
      iadls: {},
      medicationReminder: 'Not Needed',
      mobility: { ambulation: [], transferAssistance: [], fallHistory: false, fallCount: '' },
      cognitiveStatus: {
        orientation: '', memory: '', decisionMaking: '', confusion: false, wandering: false, behaviorConcerns: '',
      },
      homeSafety: {},
      nutrition: { dietTypes: [], weightLoss: false, mealAssistance: false, fluidRestrictions: false },
      painAssessment: { painToday: false, painScore: '', location: '', painMedication: '' },
      mentalHealth: { depression: false, anxiety: false, behavioralConcerns: '' },
      clientGoals: [],
      clientGoalsOther: '',
      requestedServices: Array.isArray(care.primaryNeeds) ? care.primaryNeeds : [],
      schedule: {
        daysNeeded: [],
        preferredStart: care.preferredTime || home.visitTime || '',
        preferredEnd: '',
      },
      coordinatorNotes: notesParts.join('\n\n'),
      carePlanSummary: {
        primaryNeeds: Array.isArray(care.primaryNeeds) ? care.primaryNeeds.join(', ') : '',
        recommendedWeeklyHours: '',
        startOfCareDate: basic.preferredStartDate || '',
        riskLevel: '',
      },
      signatures: {
        clientSignature: '', clientDate: '',
        responsiblePartySignature: '', responsiblePartyDate: '',
        coordinatorSignature: '', coordinatorDate: '',
        rnSignature: '', rnDate: '',
      },
      leadMeta: {
        leadId: String(lead._id || lead.id || ''),
        leadCode: lead.leadCode || '',
        careTypeRequested: care.careTypeRequested || '',
        careRequiredFor: care.careRequiredFor || '',
        careSchedule: care.careSchedule || '',
        specialConditions: care.specialConditions || '',
      },
    },
  };
};

const generateLeadCode = async (agencyId) => {
  const latest = await Model.LeadModel.findOne({ agencyId })
    .sort({ leadCode: -1 })
    .select('leadCode')
    .lean();
  let next = 10001;
  const match = String(latest?.leadCode || '').match(/(\d+)\s*$/);
  if (match) next = Number(match[1]) + 1;
  return `LD-${String(next).padStart(5, '0')}`;
};

const getOptions = () => leadConstants.getOptions();

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.LeadModel.find({ agencyId }).select('stage priority').lean();
  const byStage = {};
  leadConstants.LEAD_STAGES.forEach((s) => { byStage[s] = 0; });
  list.forEach((l) => {
    if (byStage[l.stage] != null) byStage[l.stage] += 1;
  });
  return {
    total: list.length,
    hot: list.filter((l) => l.priority === 'Hot' || l.priority === 'High').length,
    converted: list.filter((l) => l.stage === 'Converted').length,
    open: list.filter((l) => l.stage !== 'Converted').length,
    by_stage: byStage,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };

  if (query.stage && query.stage !== 'All') filter.stage = query.stage;
  if (query.priority && query.priority !== 'All') filter.priority = query.priority;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { leadCode: regex },
      { fullName: regex },
      { phone: regex },
      { email: regex },
      { recipientName: regex },
      { leadSource: regex },
    ];
  }

  const list = await Model.LeadModel.find(filter).sort({ createdAt: -1 });
  return list.map(formatLead);
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.LeadModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.LEAD.NOT_FOUND);
  return formatLead(doc);
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const account = getAgencyAccount(req);
  const formData = payload.formData || {};
  const summary = syncSummaryFields(formData);

  const doc = await Model.LeadModel.create({
    agencyId,
    leadCode: await generateLeadCode(agencyId),
    stage: payload.stage || 'New Lead',
    priority: payload.priority || formData.statusInfo?.priority || 'Medium',
    nextAction: payload.nextAction ?? formData.statusInfo?.nextAction ?? '',
    notes: payload.notes ?? formData.internalNotes ?? '',
    ...summary,
    formData,
    assignedToAccountId: payload.assignedToAccountId || account?._id || null,
    assignedToName: payload.assignedToName
      || account?.fullName
      || account?.name
      || '',
    createdByAccountId: getAccountId(req),
  });

  return formatLead(doc);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.LeadModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.LEAD.NOT_FOUND);

  if (payload.formData) {
    doc.formData = { ...doc.formData, ...payload.formData };
    const summary = syncSummaryFields(doc.formData);
    Object.assign(doc, summary);
  }
  if (payload.stage !== undefined) doc.stage = payload.stage;
  if (payload.priority !== undefined) doc.priority = payload.priority;
  if (payload.nextAction !== undefined) doc.nextAction = payload.nextAction;
  if (payload.notes !== undefined) doc.notes = payload.notes;
  if (payload.assignedToAccountId !== undefined) {
    doc.assignedToAccountId = payload.assignedToAccountId || null;
  }
  if (payload.assignedToName !== undefined) doc.assignedToName = payload.assignedToName;

  // Keep statusInfo in formData in sync when top-level status fields change
  const statusInfo = { ...(doc.formData?.statusInfo || {}) };
  if (payload.stage !== undefined) statusInfo.stage = payload.stage;
  if (payload.priority !== undefined) statusInfo.priority = payload.priority;
  if (payload.nextAction !== undefined) statusInfo.nextAction = payload.nextAction;
  doc.formData = { ...doc.formData, statusInfo };

  await doc.save();
  return formatLead(doc);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.LeadModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.LEAD.NOT_FOUND);
  await Model.LeadModel.deleteOne({ _id: id });
  return { id: String(id) };
};

const mapLeadToClientPayload = (lead) => {
  const fd = lead.formData || {};
  const basic = fd.basicInfo || {};
  const recipient = fd.careRecipient || {};
  const family = fd.familyRep || {};
  const care = fd.careSummary || {};
  const { firstName, lastName } = splitName(recipient.name || basic.fullName);
  const { dateOfBirth } = parseAgeOrDob(recipient.ageOrDob);
  const conditions = Array.isArray(recipient.medicalConditions)
    ? recipient.medicalConditions.join(', ')
    : (recipient.medicalConditions || '');

  let streetAddress = '';
  let city = '';
  let state = '';
  let zipCode = '';
  const loc = String(basic.zipLocation || '').trim();
  if (loc) {
    // Prefer last token as ZIP if it looks like one; otherwise store full string as street
    const zipMatch = loc.match(/\b(\d{5}(-\d{4})?)\b/);
    if (zipMatch) zipCode = zipMatch[1];
    streetAddress = loc;
  }
  if (family.address && !family.sameAsLeadAddress) {
    streetAddress = family.address || streetAddress;
  } else if (family.sameAsLeadAddress && family.address) {
    streetAddress = family.address || streetAddress;
  }

  return {
    firstName,
    lastName,
    dateOfBirth,
    gender: recipient.gender || '',
    phone: basic.phone || family.phone || '',
    phoneHome: basic.alternateNumber || '',
    email: basic.email || family.email || '',
    streetAddress,
    city,
    state,
    zipCode,
    medicalConditions: conditions,
    allergies: recipient.allergies || '',
    physicianName: recipient.doctorClinic || '',
    emergencyContactName: family.name || basic.fullName || '',
    emergencyContactRelationship: family.relationship || basic.relationship || '',
    emergencyContactPhone: family.phone || basic.phone || '',
    careFrequency: care.careSchedule || '',
    preferredTimes: care.preferredTime ? [care.preferredTime] : [],
    serviceTypes: Array.isArray(care.primaryNeeds) ? care.primaryNeeds : [],
    careNotes: care.careNotes || lead.notes || '',
    status: 'Pending',
    notes: `Converted from lead ${lead.leadCode}`,
    intakeDate: basic.inquiryDate || new Date().toISOString().slice(0, 10),
  };
};

const convertToClient = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.LeadModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.LEAD.NOT_FOUND);
  if (doc.stage === 'Converted' && doc.clientId) {
    throw new Error(constants.MESSAGE.LEAD.ALREADY_CONVERTED);
  }

  const clientPayload = mapLeadToClientPayload(doc);
  if (!clientPayload.firstName) {
    throw new Error(constants.MESSAGE.LEAD.CONVERT_INCOMPLETE);
  }

  const client = await createClient(req, clientPayload);
  doc.clientId = client.id;
  doc.stage = 'Converted';
  doc.formData = {
    ...doc.formData,
    statusInfo: {
      ...(doc.formData?.statusInfo || {}),
      stage: 'Converted',
    },
  };
  await doc.save();

  return {
    lead: formatLead(doc),
    client,
  };
};

const logContact = async (req, id, payload = {}) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.LeadModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.LEAD.NOT_FOUND);

  const contactLog = {
    contactMethod: payload.contactMethod || '',
    contactedAt: payload.contactedAt || new Date().toISOString(),
    spokeWith: payload.spokeWith || '',
    relationship: payload.relationship || '',
    contactedBy: payload.contactedBy || '',
    designation: payload.designation || '',
    notes: payload.notes || '',
    followUpDate: payload.followUpDate || '',
    followUpTime: payload.followUpTime || '',
    callStatus: payload.callStatus || 'move_next',
    nextLevel: payload.nextLevel || '',
    assignTo: payload.assignTo || '',
    addReminder: Boolean(payload.addReminder),
    reminderTask: payload.reminderTask || '',
    disqualified: payload.callStatus === 'cancel',
  };

  let nextStage = resolveNextStageFromContact(payload);
  // Converted via contact modal still needs convertToClient — keep Proposal Sent max here
  if (nextStage === 'Converted') nextStage = 'Proposal Sent';

  let formData = {
    ...doc.formData,
    contactLog,
    statusInfo: {
      ...(doc.formData?.statusInfo || {}),
      stage: nextStage,
      nextAction: payload.callStatus === 'needs_time'
        ? `Follow up ${payload.followUpDate || ''} ${payload.followUpTime || ''}`.trim()
        : (payload.nextLevel || doc.nextAction || ''),
    },
  };

  formData = pushActivity(formData, {
    type: 'contacted',
    title: 'Contacted',
    description: contactLog.notes || `Spoke with ${contactLog.spokeWith || 'contact'} via ${contactLog.contactMethod}`,
    user: contactLog.contactedBy,
  });

  if (contactLog.addReminder && contactLog.reminderTask) {
    formData = pushActivity(formData, {
      type: 'task',
      title: 'Reminder / Task',
      description: contactLog.reminderTask,
      user: contactLog.assignTo || contactLog.contactedBy,
    });
  }

  if (contactLog.disqualified) {
    formData.disqualified = true;
  }

  doc.formData = formData;
  doc.stage = nextStage;
  doc.nextAction = formData.statusInfo.nextAction;
  if (payload.assignTo) doc.assignedToName = payload.assignTo;
  if (payload.notes) {
    doc.notes = [doc.notes, payload.notes].filter(Boolean).join('\n\n');
  }
  await doc.save();
  return formatLead(doc);
};

const createAssessmentFromLead = async (req, id, extras = {}) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.LeadModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.LEAD.NOT_FOUND);
  if (doc.assessmentId) {
    const existing = await Model.ClientAssessmentModel.findById(doc.assessmentId);
    if (existing) {
      throw new Error(constants.MESSAGE.LEAD.ASSESSMENT_EXISTS);
    }
  }

  // Ensure client exists for assessment continuity when possible
  if (!doc.clientId) {
    try {
      const clientPayload = mapLeadToClientPayload(doc);
      if (clientPayload.firstName) {
        const client = await createClient(req, clientPayload);
        doc.clientId = client.id;
      }
    } catch (err) {
      // Non-blocking — assessment can still be created without client
      console.warn('[lead] auto-client before assessment failed', err.message);
    }
  }

  const assessmentPayload = mapLeadToAssessmentPayload(doc, extras);
  if (doc.clientId) assessmentPayload.clientId = String(doc.clientId);
  const assessment = await createAssessment(req, assessmentPayload);

  doc.assessmentId = assessment.id;
  let formData = {
    ...doc.formData,
    statusInfo: {
      ...(doc.formData?.statusInfo || {}),
      stage: doc.stage === 'New Lead' || doc.stage === 'Contacted'
        ? 'Assessment Scheduled'
        : doc.stage,
      nextAction: 'Complete assessment',
    },
  };
  formData = pushActivity(formData, {
    type: 'assessment_created',
    title: 'Assessment Created',
    description: `Assessment ${assessment.assessmentCode || ''} created from lead`,
    user: assessmentPayload.assessorName || doc.assignedToName,
  });
  if (doc.stage === 'New Lead' || doc.stage === 'Contacted') {
    doc.stage = 'Assessment Scheduled';
  }
  doc.formData = formData;
  doc.nextAction = 'Complete assessment';
  await doc.save();

  return {
    lead: formatLead(doc),
    assessment,
  };
};
const scheduleHomeAssessment = async (req, id, payload = {}) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.LeadModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.LEAD.NOT_FOUND);

  const homeAssessment = {
    visitDate: payload.visitDate || '',
    visitTime: payload.visitTime || '',
    location: payload.location || '',
    assessorName: payload.assessorName || '',
    notes: payload.notes || '',
    scheduledAt: new Date().toISOString(),
  };

  let formData = {
    ...doc.formData,
    homeAssessment,
    statusInfo: {
      ...(doc.formData?.statusInfo || {}),
      stage: 'Assessment Scheduled',
      nextAction: `Home assessment ${homeAssessment.visitDate} ${homeAssessment.visitTime}`.trim(),
    },
  };

  formData = pushActivity(formData, {
    type: 'assessment_scheduled',
    title: 'Home Assessment Scheduled',
    description: [
      homeAssessment.visitDate && `Date: ${homeAssessment.visitDate}`,
      homeAssessment.visitTime && `Time: ${homeAssessment.visitTime}`,
      homeAssessment.location && `Location: ${homeAssessment.location}`,
      homeAssessment.notes,
    ].filter(Boolean).join(' · '),
    user: homeAssessment.assessorName || doc.assignedToName,
  });

  doc.formData = formData;
  doc.stage = 'Assessment Scheduled';
  doc.nextAction = formData.statusInfo.nextAction;
  if (homeAssessment.assessorName) doc.assignedToName = homeAssessment.assessorName;
  await doc.save();

  let assessment = null;
  if (payload.createAssessmentAfter) {
    const created = await createAssessmentFromLead(req, id, {
      assessorName: homeAssessment.assessorName,
      assessmentDate: homeAssessment.visitDate,
    });
    return created;
  }

  return { lead: formatLead(doc), assessment };
};


module.exports = {
  getOptions,
  getStats,
  getAll,
  getById,
  create,
  update,
  remove,
  convertToClient,
  logContact,
  scheduleHomeAssessment,
  createAssessmentFromLead,
};
