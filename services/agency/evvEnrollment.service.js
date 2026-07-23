const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const evvConstants = require('../../common/evvEnrollmentConstants');
const { formatClient } = require('./client.service');
const {
  sendEvvEnrollmentAssignedEmail,
  sendEvvEnrollmentSubmittedEmail,
  sendEvvEnrollmentSubmitConfirmationEmail,
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

const getCaregiverAccount = (req) => {
  const account = req.caregiver;
  if (!account) throw new Error('Caregiver account not found');
  return account;
};

const getCaregiverAgencyId = (req) => {
  const account = getCaregiverAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const toDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

/** Ensure caregiver has employeeId + profile fields (from candidate when needed). */
const ensureCaregiverProfile = async (caregiver) => {
  if (!caregiver) return null;

  let candidate = caregiver.candidateId;
  if (candidate && typeof candidate !== 'object') {
    candidate = await Model.CandidateModel.findById(candidate);
  } else if (!candidate && caregiver._id) {
    const fresh = await Model.AgencyAccountModel.findById(caregiver._id);
    if (fresh?.candidateId) {
      candidate = await Model.CandidateModel.findById(fresh.candidateId);
    }
  }

  let dirty = false;
  if (!caregiver.employeeId) {
    caregiver.employeeId = `CG-${String(caregiver._id).slice(-6).toUpperCase()}`;
    dirty = true;
  }
  if (!caregiver.phone && candidate?.phone) {
    caregiver.phone = candidate.phone;
    dirty = true;
  }
  if (!caregiver.dateOfBirth && candidate?.dateOfBirth) {
    caregiver.dateOfBirth = toDateInput(candidate.dateOfBirth);
    dirty = true;
  }
  if (dirty && typeof caregiver.save === 'function') {
    await caregiver.save();
  }

  return { caregiver, candidate: candidate && typeof candidate === 'object' ? candidate : null };
};

const buildPrefillFormData = (client, caregiver, agency, carePlan, assignment = {}, candidate = null) => {
  const clientFullName = client
    ? `${client.firstName || ''} ${client.lastName || ''}`.trim()
    : '';
  const clientInfo = carePlan?.formData?.clientInfo || {};
  const caregiverPhone = caregiver?.phone || candidate?.phone || '';
  const caregiverDob = toDateInput(caregiver?.dateOfBirth || candidate?.dateOfBirth);
  const caregiverAddress = candidate?.location || '';

  return {
    clientInfo: {
      clientFullName: clientFullName || clientInfo.clientFullName || '',
      dob: toDateInput(client?.dateOfBirth || clientInfo.dob) || '',
      gender: client?.gender || clientInfo.gender || '',
      address: client?.streetAddress || clientInfo.address || '',
      aptSuite: client?.aptSuite || '',
      city: client?.city || clientInfo.city || '',
      state: client?.state || clientInfo.state || '',
      zip: client?.zipCode || clientInfo.zip || '',
      phone: client?.phone || client?.phoneHome || clientInfo.phone || '',
      email: client?.email || clientInfo.email || '',
      preferredLanguage: client?.preferredLanguage || clientInfo.preferredLanguage || '',
      clientId: client?.clientCode || '',
    },
    caregiverInfo: {
      isSelf: false,
      fullName: caregiver?.fullName
        || (candidate ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() : '')
        || '',
      employeeId: caregiver?.employeeId || '',
      phone: caregiverPhone,
      email: caregiver?.email || candidate?.email || '',
      dob: caregiverDob,
      address: caregiverAddress,
      aptSuite: '',
      city: '',
      state: '',
      zip: '',
      relationship: 'Self',
      relationshipOther: '',
    },
    serviceInfo: {
      agencyName: agency?.name || '',
      agencyPhone: agency?.phone || '',
      evvVendor: '',
      medicaidProgram: client?.insuranceProvider || '',
      assignedServices: (assignment.serviceAreas || []).join(', '),
      planCode: carePlan?.planCode || '',
    },
    evvMethods: {
      methods: [],
      other: '',
    },
    mobileEnrollment: {
      smartphoneType: '',
      mobileNumber: caregiverPhone,
      email: caregiver?.email || candidate?.email || '',
    },
    landlineEnrollment: {
      primaryPhone: '',
      phoneType: '',
      alternatePhone: '',
    },
    authorization: {
      clientSignature: '',
      clientDate: '',
      caregiverSignature: '',
      caregiverDate: '',
    },
    trainingAck: {
      caregiverSignature: '',
      date: '',
    },
    officeUse: {
      evvSystem: '',
      enrollmentDate: '',
      staffInitials: '',
      methodSetUpBy: '',
      verifiedBy: '',
      verificationDate: '',
      notes: '',
    },
  };
};

const fillBlankCaregiverInfo = (existingInfo = {}, profilePrefill = {}) => {
  const merged = { ...profilePrefill, ...existingInfo };
  Object.keys(profilePrefill).forEach((key) => {
    if (merged[key] === '' || merged[key] == null) {
      merged[key] = profilePrefill[key];
    }
  });
  return merged;
};

const formatEvvEnrollment = (doc, extras = {}) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.carePlanId = String(doc.carePlanId?._id || doc.carePlanId || '');
  item.clientId = String(doc.clientId?._id || doc.clientId || '');
  item.caregiverAccountId = String(doc.caregiverAccountId?._id || doc.caregiverAccountId || '');
  item.serviceAreaKey = doc.serviceAreaKey || '';
  item.serviceAreas = Array.isArray(doc.serviceAreas) ? doc.serviceAreas : [];
  if (extras.client) {
    item.client = typeof extras.client === 'object' && extras.client.firstName
      ? formatClient(extras.client)
      : extras.client;
  }
  if (extras.carePlan) {
    item.carePlan = functions.toClientDoc(extras.carePlan);
  }
  return item;
};

const generateEnrollmentCode = async (agencyId) => {
  const count = await Model.EvvEnrollmentModel.countDocuments({ agencyId });
  return `EVV-${String(10001 + count).padStart(5, '0')}`;
};

/** One enrollment per care-need (service) assignment — not one per caregiver. */
const extractAssignments = (formData = {}) => {
  const assignments = [];
  const seen = new Set();

  (formData.careNeeds || []).forEach((need) => {
    const staffId = need.responsibleStaffId;
    if (!staffId) return;
    const areaKey = String(need.areaKey || need.areaLabel || '').trim();
    if (!areaKey) return;
    const key = `${String(staffId)}::${areaKey}`;
    if (seen.has(key)) return;
    seen.add(key);
    assignments.push({
      key,
      caregiverAccountId: String(staffId),
      serviceAreaKey: areaKey,
      serviceAreas: [need.areaLabel || areaKey],
      frequencies: need.frequency ? [need.frequency] : [],
    });
  });

  return assignments;
};

const ensurePerServiceEnrollmentIndex = async () => {
  try {
    await Model.EvvEnrollmentModel.collection.dropIndex('agencyId_1_carePlanId_1_caregiverAccountId_1');
  } catch (_) {
    /* old unique index may already be gone */
  }
  try {
    await Model.EvvEnrollmentModel.syncIndexes();
  } catch (err) {
    console.error('[evvEnrollment] syncIndexes failed', err.message);
  }
};

let indexReadyPromise = null;
const readyEnrollmentIndexes = () => {
  if (!indexReadyPromise) indexReadyPromise = ensurePerServiceEnrollmentIndex();
  return indexReadyPromise;
};

const syncFromCarePlan = async (agencyId, carePlanDoc) => {
  await readyEnrollmentIndexes();

  const clientId = carePlanDoc.clientId?._id || carePlanDoc.clientId;
  if (!clientId) return [];

  const assignments = extractAssignments(carePlanDoc.formData || {});
  if (assignments.length === 0) return [];

  const client = await Model.ClientModel.findOne({ _id: clientId, agencyId });
  const agency = await Model.AgencyModel.findById(agencyId);
  if (!client) return [];

  const activeKeys = new Set(assignments.map((a) => a.key));

  // Remove pending forms for assignments that no longer exist (or legacy combined forms)
  const pendingDocs = await Model.EvvEnrollmentModel.find({
    agencyId,
    carePlanId: carePlanDoc._id,
    status: 'Pending',
  });
  for (const doc of pendingDocs) {
    const cgId = String(doc.caregiverAccountId);
    const areaKey = doc.serviceAreaKey || '';
    const key = areaKey ? `${cgId}::${areaKey}` : '';
    const isLegacyCombined = !areaKey;
    if (isLegacyCombined || !activeKeys.has(key)) {
      await Model.EvvEnrollmentModel.deleteOne({ _id: doc._id });
    }
  }

  const results = [];
  for (const assignment of assignments) {
    const caregiverId = assignment.caregiverAccountId;
    const caregiver = await Model.AgencyAccountModel.findOne({
      _id: caregiverId,
      agencyId,
      role: 'CAREGIVER',
    }).populate('candidateId');
    if (!caregiver) continue;

    const profile = await ensureCaregiverProfile(caregiver);
    const candidate = profile?.candidate || null;
    const prefill = buildPrefillFormData(
      client,
      caregiver,
      agency,
      carePlanDoc,
      assignment,
      candidate,
    );
    let enrollment = await Model.EvvEnrollmentModel.findOne({
      agencyId,
      carePlanId: carePlanDoc._id,
      caregiverAccountId: caregiverId,
      serviceAreaKey: assignment.serviceAreaKey,
    });

    const serviceLabel = (assignment.serviceAreas || []).join(', ') || assignment.serviceAreaKey;

    if (!enrollment) {
      enrollment = await Model.EvvEnrollmentModel.create({
        agencyId,
        enrollmentCode: await generateEnrollmentCode(agencyId),
        carePlanId: carePlanDoc._id,
        clientId,
        caregiverAccountId: caregiverId,
        serviceAreaKey: assignment.serviceAreaKey,
        planCode: carePlanDoc.planCode || '',
        clientName: `${client.firstName} ${client.lastName}`.trim(),
        caregiverName: caregiver.fullName || '',
        serviceAreas: assignment.serviceAreas,
        status: 'Pending',
        enrollmentDate: new Date().toISOString().split('T')[0],
        formData: prefill,
        createdByAccountId: carePlanDoc.createdByAccountId || null,
      });

      try {
        if (caregiver.email) {
          const formUrl = `${functions.getFrontendUrl()}/caregiver/evv-enrollments/${enrollment._id}`;
          await sendEvvEnrollmentAssignedEmail({
            to: caregiver.email,
            caregiverName: caregiver.fullName || 'Caregiver',
            agencyName: agency?.name,
            clientName: enrollment.clientName,
            serviceName: serviceLabel,
            enrollmentCode: enrollment.enrollmentCode,
            formUrl,
          });
        }
      } catch (err) {
        console.error('[syncFromCarePlan] EVV assignment email failed', err.message);
      }
    } else if (enrollment.status === 'Pending' || enrollment.status === 'Rejected') {
      enrollment.planCode = carePlanDoc.planCode || '';
      enrollment.clientName = `${client.firstName} ${client.lastName}`.trim();
      enrollment.caregiverName = caregiver.fullName || '';
      enrollment.serviceAreaKey = assignment.serviceAreaKey;
      enrollment.serviceAreas = assignment.serviceAreas;
      enrollment.formData = {
        ...prefill,
        ...enrollment.formData,
        clientInfo: { ...prefill.clientInfo, ...(enrollment.formData?.clientInfo || {}) },
        caregiverInfo: fillBlankCaregiverInfo(enrollment.formData?.caregiverInfo, prefill.caregiverInfo),
        serviceInfo: { ...prefill.serviceInfo, ...(enrollment.formData?.serviceInfo || {}) },
        mobileEnrollment: {
          ...prefill.mobileEnrollment,
          ...(enrollment.formData?.mobileEnrollment || {}),
          email: enrollment.formData?.mobileEnrollment?.email || prefill.mobileEnrollment.email,
          mobileNumber: enrollment.formData?.mobileEnrollment?.mobileNumber || prefill.mobileEnrollment.mobileNumber,
        },
      };
      await enrollment.save();
    }

    results.push(enrollment);
  }

  return results;
};

const getOptions = async () => ({
  statuses: evvConstants.EVV_ENROLLMENT_STATUSES,
  genders: evvConstants.GENDERS,
  relationships: evvConstants.RELATIONSHIPS,
  evv_methods: evvConstants.EVV_METHODS,
  smartphone_types: evvConstants.SMARTPHONE_TYPES,
  phone_types: evvConstants.PHONE_TYPES,
});

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.EvvEnrollmentModel.find({ agencyId });
  return {
    total: list.length,
    pending: list.filter((i) => i.status === 'Pending').length,
    submitted: list.filter((i) => i.status === 'Submitted').length,
    verified: list.filter((i) => i.status === 'Verified').length,
    rejected: list.filter((i) => i.status === 'Rejected').length,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };

  if (query.status && query.status !== 'All') filter.status = query.status;
  if (query.client_id) filter.clientId = query.client_id;
  if (query.care_plan_id) filter.carePlanId = query.care_plan_id;
  if (query.caregiver_id) filter.caregiverAccountId = query.caregiver_id;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [
      { enrollmentCode: regex },
      { clientName: regex },
      { caregiverName: regex },
      { planCode: regex },
      { serviceAreas: regex },
      { serviceAreaKey: regex },
    ];
  }

  const list = await Model.EvvEnrollmentModel.find(filter)
    .populate('clientId')
    .populate('carePlanId')
    .sort({ createdAt: -1 });

  return list.map((doc) => formatEvvEnrollment(doc, { client: doc.clientId, carePlan: doc.carePlanId }));
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.EvvEnrollmentModel.findOne({ _id: id, agencyId })
    .populate('clientId')
    .populate('carePlanId');
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);
  return formatEvvEnrollment(doc, { client: doc.clientId, carePlan: doc.carePlanId });
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.EvvEnrollmentModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);

  if (payload.formData) doc.formData = payload.formData;
  if (payload.status) {
    doc.status = payload.status;
    if (payload.status === 'Verified') {
      doc.verifiedAt = new Date();
      doc.verifiedByAccountId = getAccountId(req);
    }
    if (payload.status === 'Rejected') {
      doc.verifiedAt = new Date();
      doc.verifiedByAccountId = getAccountId(req);
    }
  }

  await doc.save();
  const populated = await Model.EvvEnrollmentModel.findById(doc._id)
    .populate('clientId')
    .populate('carePlanId');
  return formatEvvEnrollment(populated, { client: populated.clientId, carePlan: populated.carePlanId });
};

const verify = async (req, id, payload = {}) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.EvvEnrollmentModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);
  if (doc.status !== 'Submitted') {
    throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_SUBMITTED);
  }

  const action = payload.action === 'reject' ? 'Rejected' : 'Verified';
  doc.status = action;
  doc.verifiedAt = new Date();
  doc.verifiedByAccountId = getAccountId(req);

  if (payload.formData?.officeUse) {
    doc.formData = {
      ...doc.formData,
      officeUse: { ...(doc.formData?.officeUse || {}), ...payload.formData.officeUse },
    };
  }

  await doc.save();
  const populated = await Model.EvvEnrollmentModel.findById(doc._id)
    .populate('clientId')
    .populate('carePlanId');
  return formatEvvEnrollment(populated, { client: populated.clientId, carePlan: populated.carePlanId });
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const doc = await Model.EvvEnrollmentModel.findOne({ _id: id, agencyId });
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);
  await Model.EvvEnrollmentModel.deleteOne({ _id: id });
  return { id: String(id) };
};

const syncCarePlan = async (req, carePlanId) => {
  const agencyId = getAgencyId(req);
  const plan = await Model.CarePlanModel.findOne({ _id: carePlanId, agencyId });
  if (!plan) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);
  const created = await syncFromCarePlan(agencyId, plan);
  return { synced: created.length, enrollments: created.map((d) => formatEvvEnrollment(d)) };
};

const getCaregiverAll = async (req) => {
  const caregiver = getCaregiverAccount(req);
  const agencyId = getCaregiverAgencyId(req);
  const list = await Model.EvvEnrollmentModel.find({
    agencyId,
    caregiverAccountId: caregiver._id || caregiver.id,
  })
    .populate('clientId')
    .populate('carePlanId')
    .sort({ createdAt: -1 });

  return list.map((doc) => formatEvvEnrollment(doc, { client: doc.clientId, carePlan: doc.carePlanId }));
};

const getCaregiverById = async (req, id) => {
  const caregiver = getCaregiverAccount(req);
  const agencyId = getCaregiverAgencyId(req);
  const doc = await Model.EvvEnrollmentModel.findOne({
    _id: id,
    agencyId,
    caregiverAccountId: caregiver._id || caregiver.id,
  })
    .populate('clientId')
    .populate('carePlanId');
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);

  const account = await Model.AgencyAccountModel.findById(caregiver._id || caregiver.id)
    .populate('candidateId');
  if (account && ['Pending', 'Rejected'].includes(doc.status)) {
    const profile = await ensureCaregiverProfile(account);
    const prefill = buildPrefillFormData(
      doc.clientId,
      account,
      null,
      doc.carePlanId,
      { serviceAreas: doc.serviceAreas || [] },
      profile?.candidate || null,
    );
    const nextCaregiverInfo = fillBlankCaregiverInfo(
      doc.formData?.caregiverInfo,
      prefill.caregiverInfo,
    );
    const nextMobile = {
      ...(doc.formData?.mobileEnrollment || {}),
      email: doc.formData?.mobileEnrollment?.email || prefill.mobileEnrollment.email,
      mobileNumber: doc.formData?.mobileEnrollment?.mobileNumber || prefill.mobileEnrollment.mobileNumber,
    };
    const changed = JSON.stringify(doc.formData?.caregiverInfo || {}) !== JSON.stringify(nextCaregiverInfo)
      || JSON.stringify(doc.formData?.mobileEnrollment || {}) !== JSON.stringify(nextMobile);
    if (changed) {
      doc.formData = {
        ...doc.formData,
        caregiverInfo: nextCaregiverInfo,
        mobileEnrollment: nextMobile,
      };
      await doc.save();
    }
  }

  return formatEvvEnrollment(doc, { client: doc.clientId, carePlan: doc.carePlanId });
};

const submitCaregiver = async (req, id, payload) => {
  const caregiver = getCaregiverAccount(req);
  const agencyId = getCaregiverAgencyId(req);
  const doc = await Model.EvvEnrollmentModel.findOne({
    _id: id,
    agencyId,
    caregiverAccountId: caregiver._id || caregiver.id,
  });
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);
  if (!['Pending', 'Rejected'].includes(doc.status)) {
    throw new Error(constants.MESSAGE.EVV_ENROLLMENT.ALREADY_SUBMITTED);
  }

  if (payload.formData) {
    const existing = doc.formData || {};
    doc.formData = {
      ...payload.formData,
      clientInfo: existing.clientInfo || payload.formData.clientInfo,
      serviceInfo: existing.serviceInfo || payload.formData.serviceInfo,
    };
  }
  doc.status = 'Submitted';
  doc.submittedAt = new Date();
  await doc.save();

  const populated = await Model.EvvEnrollmentModel.findById(doc._id)
    .populate('clientId')
    .populate('carePlanId');

  const result = formatEvvEnrollment(populated, {
    client: populated.clientId,
    carePlan: populated.carePlanId,
  });

  // Fire-and-forget emails so submit response is not blocked by SMTP
  const notifyPayload = {
    agencyId: String(agencyId),
    enrollmentId: String(populated._id),
    enrollmentCode: populated.enrollmentCode,
    clientName: populated.clientName
      || (populated.clientId
        ? `${populated.clientId.firstName || ''} ${populated.clientId.lastName || ''}`.trim()
        : ''),
    caregiverName: populated.caregiverName
      || caregiver.fullName
      || caregiver.name
      || 'Caregiver',
    caregiverEmail: caregiver.email
      || populated.formData?.caregiverInfo?.email
      || populated.formData?.mobileEnrollment?.email
      || '',
    reviewUrl: agencyPortalUrl(req, `/agency/evv/enrollments/${populated._id}/review`),
    portalUrl: `${functions.getFrontendUrl()}/caregiver/evv-enrollments/${populated._id}`,
  };

  setImmediate(() => {
    notifyEvvEnrollmentSubmitted(notifyPayload).catch((err) => {
      console.error('[evvEnrollment] background submit notify failed', err.message);
    });
  });

  return result;
};

const notifyEvvEnrollmentSubmitted = async ({
  agencyId,
  enrollmentCode,
  clientName,
  caregiverName,
  caregiverEmail,
  reviewUrl,
  portalUrl,
}) => {
  const { agencyName, ownerEmails, ownerName } = await getAgencyContext(agencyId);
  const emails = uniqueEmails(ownerEmails);

  await Promise.all(emails.map(async (to) => {
    try {
      await sendEvvEnrollmentSubmittedEmail({
        to,
        recipientName: ownerName || agencyName || 'Agency',
        agencyName,
        caregiverName,
        clientName,
        enrollmentCode,
        reviewUrl,
      });
    } catch (err) {
      console.error('[evvEnrollment] submit notify failed', to, err.message);
    }
  }));

  if (caregiverEmail) {
    try {
      await sendEvvEnrollmentSubmitConfirmationEmail({
        to: caregiverEmail,
        caregiverName,
        agencyName,
        clientName,
        enrollmentCode,
        portalUrl,
      });
    } catch (err) {
      console.error('[evvEnrollment] caregiver submit confirmation failed', err.message);
    }
  }
};

module.exports = {
  syncFromCarePlan,
  getOptions,
  getStats,
  getAll,
  getById,
  update,
  verify,
  remove,
  syncCarePlan,
  getCaregiverAll,
  getCaregiverById,
  submitCaregiver,
};
