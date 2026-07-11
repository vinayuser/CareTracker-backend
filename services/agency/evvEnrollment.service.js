const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const evvConstants = require('../../common/evvEnrollmentConstants');
const { formatClient } = require('./client.service');
const { sendEvvEnrollmentAssignedEmail } = require('../common/mail.service');

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

const buildPrefillFormData = (client, caregiver, agency, carePlan, assignment = {}) => {
  const clientFullName = client
    ? `${client.firstName || ''} ${client.lastName || ''}`.trim()
  : '';
  const clientInfo = carePlan?.formData?.clientInfo || {};

  return {
    clientInfo: {
      clientFullName: clientFullName || clientInfo.clientFullName || '',
      dob: client?.dateOfBirth || clientInfo.dob || '',
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
      fullName: caregiver?.fullName || '',
      employeeId: '',
      phone: '',
      email: caregiver?.email || '',
      dob: '',
      address: '',
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
      mobileNumber: '',
      email: caregiver?.email || '',
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

const formatEvvEnrollment = (doc, extras = {}) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.carePlanId = String(doc.carePlanId?._id || doc.carePlanId || '');
  item.clientId = String(doc.clientId?._id || doc.clientId || '');
  item.caregiverAccountId = String(doc.caregiverAccountId?._id || doc.caregiverAccountId || '');
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

const extractAssignments = (formData = {}) => {
  const careNeeds = formData.careNeeds || [];
  const assignments = new Map();

  careNeeds.forEach((need) => {
    const staffId = need.responsibleStaffId;
    if (!staffId) return;
    const key = String(staffId);
    if (!assignments.has(key)) {
      assignments.set(key, { caregiverAccountId: staffId, serviceAreas: [], frequencies: [] });
    }
    const entry = assignments.get(key);
    if (need.areaLabel) entry.serviceAreas.push(need.areaLabel);
    if (need.frequency) entry.frequencies.push(need.frequency);
  });

  return assignments;
};

const syncFromCarePlan = async (agencyId, carePlanDoc) => {
  const clientId = carePlanDoc.clientId?._id || carePlanDoc.clientId;
  if (!clientId) return [];

  const assignments = extractAssignments(carePlanDoc.formData || {});
  if (assignments.size === 0) return [];

  const client = await Model.ClientModel.findOne({ _id: clientId, agencyId });
  const agency = await Model.AgencyModel.findById(agencyId);
  if (!client) return [];

  const activeIds = [...assignments.keys()];

  await Model.EvvEnrollmentModel.deleteMany({
    agencyId,
    carePlanId: carePlanDoc._id,
    status: 'Pending',
    caregiverAccountId: { $nin: activeIds },
  });

  const results = [];
  for (const [caregiverId, assignment] of assignments) {
    const caregiver = await Model.AgencyAccountModel.findOne({
      _id: caregiverId,
      agencyId,
      role: 'CAREGIVER',
    });
    if (!caregiver) continue;

    const prefill = buildPrefillFormData(client, caregiver, agency, carePlanDoc, assignment);
    let enrollment = await Model.EvvEnrollmentModel.findOne({
      agencyId,
      carePlanId: carePlanDoc._id,
      caregiverAccountId: caregiverId,
    });

    if (!enrollment) {
      enrollment = await Model.EvvEnrollmentModel.create({
        agencyId,
        enrollmentCode: await generateEnrollmentCode(agencyId),
        carePlanId: carePlanDoc._id,
        clientId,
        caregiverAccountId: caregiverId,
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
      enrollment.serviceAreas = assignment.serviceAreas;
      enrollment.formData = {
        ...prefill,
        ...enrollment.formData,
        clientInfo: { ...prefill.clientInfo, ...(enrollment.formData?.clientInfo || {}) },
        caregiverInfo: { ...prefill.caregiverInfo, ...(enrollment.formData?.caregiverInfo || {}) },
        serviceInfo: { ...prefill.serviceInfo, ...(enrollment.formData?.serviceInfo || {}) },
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
  return formatEvvEnrollment(populated, { client: populated.clientId, carePlan: populated.carePlanId });
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
