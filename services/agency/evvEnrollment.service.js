const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const evvConstants = require('../../common/evvEnrollmentConstants');
const { formatClient } = require('./client.service');
const {
  sendEvvEnrollmentAssignedEmail,
  sendEvvEnrollmentClientAssignedEmail,
  sendEvvEnrollmentSubmittedEmail,
  sendEvvEnrollmentSubmitConfirmationEmail,
  sendEvvEnrollmentVerifiedEmail,
  sendEvvEnrollmentRejectedEmail,
} = require('../common/mail.service');
const {
  getAgencyContext,
  uniqueEmails,
  agencyPortalUrl,
} = require('../common/notifyHelpers');
const NotificationService = require('../common/notification.service');

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

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
};

/** Parse "City ST 12345" / "mohali 144205" style combined city-state-zip strings. */
const parseCityStateZip = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return { city: '', state: '', zip: '' };
  const withState = text.match(/^(.+?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (withState) {
    return { city: withState[1].trim(), state: withState[2].toUpperCase(), zip: withState[3] };
  }
  const zipOnly = text.match(/^(.+?)\s+(\d{5}(?:-\d{4})?)$/);
  if (zipOnly) return { city: zipOnly[1].trim(), state: '', zip: zipOnly[2] };
  return { city: text, state: '', zip: '' };
};

/**
 * Map a hiring PDF submission into EVV caregiver profile fields.
 * Prefers I-9 / Employment Application field names used in candidate portal forms.
 */
const profileFromHiringForm = (documentCode, formData = {}) => {
  const fd = formData || {};
  const code = String(documentCode || '');
  const out = {
    fullName: '',
    phone: '',
    email: '',
    dob: '',
    address: '',
    aptSuite: '',
    city: '',
    state: '',
    zip: '',
  };

  if (code === 'I-9') {
    out.fullName = firstNonEmpty(
      `${fd['First Name (Given Name)'] || ''} ${fd['Last Name (Family Name)'] || ''}`.trim(),
    );
    out.address = firstNonEmpty(fd['Address Street Number and Name']);
    out.aptSuite = firstNonEmpty(fd['Apt Number (if any)']);
    out.city = firstNonEmpty(fd['City or Town']);
    out.state = firstNonEmpty(fd.State);
    out.zip = firstNonEmpty(fd['ZIP Code']);
    out.dob = toDateInput(fd['Date of Birth mmddyyyy']);
    out.email = firstNonEmpty(fd['Employees E-mail Address']);
    out.phone = firstNonEmpty(fd['Telephone Number']);
    return out;
  }

  if (code === '1020') {
    out.fullName = firstNonEmpty(fd.Name);
    out.address = firstNonEmpty(fd.Address);
    out.city = firstNonEmpty(fd.City);
    out.state = firstNonEmpty(fd.State);
    out.zip = firstNonEmpty(fd.Zip, fd.ZIP, fd.zipcode);
    out.email = firstNonEmpty(fd['Email Address'], fd.Email);
    out.phone = firstNonEmpty(fd.Phone, fd['Phone Number']);
    out.dob = toDateInput(fd['Date of Birth'] || fd.DOB);
    return out;
  }

  if (code === '1021') {
    out.fullName = firstNonEmpty(
      fd['Name of Employee'],
      `${fd['First Name'] || ''} ${fd['Last Name'] || ''}`.trim(),
    );
    out.address = firstNonEmpty(fd.Address);
    out.city = firstNonEmpty(fd.City);
    out.state = firstNonEmpty(fd.State);
    out.zip = firstNonEmpty(fd.Zip, fd.ZIP, fd.zipcode);
    out.dob = toDateInput(fd['Date of Birth']);
    return out;
  }

  if (code === '1010') {
    out.fullName = firstNonEmpty(
      fd['Employee Name'],
      `${fd['First Name'] || ''} ${fd['Last Name'] || ''}`.trim(),
    );
    out.address = firstNonEmpty(fd.Mail, fd.Address);
    out.state = firstNonEmpty(fd.State);
    out.zip = firstNonEmpty(fd.zipcode, fd.Zip, fd.ZIP);
    out.dob = toDateInput(fd['Date of Birth']);
    return out;
  }

  if (code === '1070') {
    out.fullName = firstNonEmpty(fd['Print Name'], fd['Last First Middle']);
    out.address = firstNonEmpty(fd.Street, fd.Address);
    const parsed = parseCityStateZip(fd.CityStateZip);
    out.city = parsed.city;
    out.state = firstNonEmpty(fd.State, parsed.state);
    out.zip = parsed.zip;
    out.dob = toDateInput(fd.DOB || fd['Date of Birth']);
    out.phone = firstNonEmpty(fd.Phone);
    return out;
  }

  if (code === '1600') {
    out.fullName = firstNonEmpty(`${fd['First Name'] || ''} ${fd['Last Name'] || ''}`.trim());
    out.address = firstNonEmpty(fd.Address);
    out.phone = firstNonEmpty(fd['Cellular Phone'], fd.Phone, fd['Phone Numbers']);
    out.email = firstNonEmpty(fd['Email Address']);
    return out;
  }

  if (code === 'W-4') {
    out.fullName = firstNonEmpty(
      `${fd['text_ First name and middle initial'] || ''} ${fd.text_last_name || fd['text_last name'] || ''}`.trim(),
    );
    out.address = firstNonEmpty(fd.text_address);
    out.city = firstNonEmpty(fd['text_City or town']);
    return out;
  }

  return out;
};

/** Merge hiring-form profiles; earlier codes win for each non-empty field. */
const mergeHiringFormProfiles = (submissions = []) => {
  const priority = ['I-9', '1020', '1021', '1010', '1070', '1600', 'W-4'];
  const byCode = new Map();
  submissions.forEach((sub) => {
    const code = String(sub.documentCode || '');
    if (!code || byCode.has(code)) return;
    byCode.set(code, sub);
  });

  const merged = {
    fullName: '',
    phone: '',
    email: '',
    dob: '',
    address: '',
    aptSuite: '',
    city: '',
    state: '',
    zip: '',
  };

  priority.forEach((code) => {
    const sub = byCode.get(code);
    if (!sub) return;
    const part = profileFromHiringForm(code, sub.formData || {});
    Object.keys(merged).forEach((key) => {
      if (!merged[key] && part[key]) merged[key] = part[key];
    });
  });

  return merged;
};

/** Load personal data from the caregiver's hired application PDF forms. */
const loadCaregiverFormProfile = async (candidateId, agencyId) => {
  if (!candidateId) return null;
  const application = await Model.CandidateApplicationModel.findOne({
    candidateId,
    ...(agencyId ? { agencyId } : {}),
  }).sort({ updatedAt: -1 }).select('_id');
  if (!application) return null;

  const submissions = await Model.CandidateFormSubmissionModel.find({
    applicationId: application._id,
    status: { $in: ['Submitted', 'Draft'] },
    documentCode: { $in: ['I-9', '1020', '1021', '1010', '1070', '1600', 'W-4'] },
  })
    .sort({ updatedAt: -1 })
    .select('documentCode formData status updatedAt')
    .lean();

  if (!submissions.length) return null;
  // Prefer Submitted over Draft when both exist for same code (already first-wins by sort + map)
  const submittedFirst = [
    ...submissions.filter((s) => s.status === 'Submitted'),
    ...submissions.filter((s) => s.status !== 'Submitted'),
  ];
  return mergeHiringFormProfiles(submittedFirst);
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

  const candidateDoc = candidate && typeof candidate === 'object' ? candidate : null;
  const agencyId = caregiver.agencyId?._id || caregiver.agencyId;
  const formProfile = await loadCaregiverFormProfile(
    candidateDoc?._id || caregiver.candidateId,
    agencyId,
  );

  return { caregiver, candidate: candidateDoc, formProfile };
};

const buildPrefillFormData = (
  client,
  caregiver,
  agency,
  carePlan,
  assignment = {},
  candidate = null,
  formProfile = null,
) => {
  const clientFullName = client
    ? `${client.firstName || ''} ${client.lastName || ''}`.trim()
    : '';
  const clientInfo = carePlan?.formData?.clientInfo || {};
  const fromForms = formProfile || {};
  const caregiverPhone = firstNonEmpty(
    caregiver?.phone,
    candidate?.phone,
    fromForms.phone,
  );
  const caregiverDob = toDateInput(
    firstNonEmpty(caregiver?.dateOfBirth, candidate?.dateOfBirth, fromForms.dob),
  );
  const caregiverEmail = firstNonEmpty(caregiver?.email, candidate?.email, fromForms.email);
  const caregiverFullName = firstNonEmpty(
    caregiver?.fullName,
    candidate ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() : '',
    fromForms.fullName,
  );
  const caregiverAddress = firstNonEmpty(fromForms.address, candidate?.location);

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
      fullName: caregiverFullName,
      employeeId: caregiver?.employeeId || '',
      phone: caregiverPhone,
      email: caregiverEmail,
      dob: caregiverDob,
      address: caregiverAddress,
      aptSuite: fromForms.aptSuite || '',
      city: fromForms.city || '',
      state: fromForms.state || '',
      zip: fromForms.zip || '',
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
      email: caregiverEmail,
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

const parseEnrollmentSeq = (code) => {
  const match = String(code || '').match(/^EVV-(\d+)$/i);
  return match ? Number(match[1]) : 0;
};

/**
 * Next unique enrollment code for an agency.
 * Uses max existing sequence (not count) so deleted enrollments do not reuse codes.
 */
const generateEnrollmentCode = async (agencyId) => {
  const codes = await Model.EvvEnrollmentModel.distinct('enrollmentCode', { agencyId });
  let maxSeq = 10000;
  codes.forEach((code) => {
    const seq = parseEnrollmentSeq(code);
    if (seq > maxSeq) maxSeq = seq;
  });
  return `EVV-${String(maxSeq + 1).padStart(5, '0')}`;
};

const createEnrollmentWithUniqueCode = async (payload) => {
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Model.EvvEnrollmentModel.create({
        ...payload,
        enrollmentCode: await generateEnrollmentCode(payload.agencyId),
      });
    } catch (err) {
      lastError = err;
      const isDup = err?.code === 11000
        && (String(err?.message || '').includes('enrollmentCode')
          || String(err?.message || '').includes('agencyId_1_enrollmentCode_1'));
      if (!isDup) throw err;
    }
  }
  throw lastError;
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
      profile?.formProfile || null,
    );
    let enrollment = await Model.EvvEnrollmentModel.findOne({
      agencyId,
      carePlanId: carePlanDoc._id,
      caregiverAccountId: caregiverId,
      serviceAreaKey: assignment.serviceAreaKey,
    });

    const serviceLabel = (assignment.serviceAreas || []).join(', ') || assignment.serviceAreaKey;

    if (!enrollment) {
      enrollment = await createEnrollmentWithUniqueCode({
        agencyId,
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

      try {
        const clientEmail = client.email || '';
        if (clientEmail) {
          const clientFormUrl = `${functions.getFrontendUrl()}/client/evv-enrollments/${enrollment._id}`;
          await sendEvvEnrollmentClientAssignedEmail({
            to: clientEmail,
            clientName: enrollment.clientName || `${client.firstName || ''} ${client.lastName || ''}`.trim(),
            agencyName: agency?.name,
            caregiverName: caregiver.fullName || '',
            serviceName: serviceLabel,
            enrollmentCode: enrollment.enrollmentCode,
            formUrl: clientFormUrl,
          });
        }
      } catch (err) {
        console.error('[syncFromCarePlan] EVV client assignment email failed', err.message);
      }

      NotificationService.emit(async () => {
        const actionPath = `/caregiver/evv-enrollments/${enrollment._id}`;
        const payload = {
          type: NotificationService.TYPES.EVV_ENROLLMENT_ASSIGNED,
          category: 'compliance',
          title: 'EVV enrollment assigned',
          body: `Complete enrollment ${enrollment.enrollmentCode} for ${enrollment.clientName}.`,
          tone: 'info',
          actionUrl: actionPath,
          entityType: 'EvvEnrollment',
          entityId: enrollment._id,
          metadata: { enrollmentCode: enrollment.enrollmentCode, clientName: enrollment.clientName },
        };
        await NotificationService.notifyAccount(caregiverId, payload);
        await NotificationService.notifyAgency(agencyId, {
          ...payload,
          title: 'EVV enrollment created',
          body: `Enrollment ${enrollment.enrollmentCode} assigned to ${caregiver.fullName || 'caregiver'} for ${enrollment.clientName}.`,
          actionUrl: `/agency/evv/enrollments/${enrollment._id}/review`,
        }, { moduleKey: 'AGENCY_EVV_ENROLLMENTS' });
        await NotificationService.notifyPlatformAdmins({
          ...payload,
          title: `EVV enrollment assigned — ${agency?.name || 'Agency'}`,
          body: `${agency?.name || 'Agency'}: ${enrollment.enrollmentCode} for ${enrollment.clientName}.`,
          actionUrl: '/admin/evv-compliance',
        });
        const clientAccount = client.accountId
          ? await Model.AgencyAccountModel.findOne({ _id: client.accountId, role: 'CLIENT' }).select('_id')
          : await Model.AgencyAccountModel.findOne({ agencyId, clientId: client._id, role: 'CLIENT' }).select('_id');
        if (clientAccount) {
          await NotificationService.notifyAccount(clientAccount._id, {
            ...payload,
            title: 'EVV enrollment ready for review',
            body: `Review enrollment ${enrollment.enrollmentCode} with ${caregiver.fullName || 'your caregiver'}.`,
            actionUrl: `/client/evv-enrollments/${enrollment._id}`,
          });
        }
      });
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
  const rows = await Model.EvvEnrollmentModel.aggregate([
    { $match: { agencyId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const pending = byStatus.Pending || 0;
  const submitted = byStatus.Submitted || 0;
  const verified = byStatus.Verified || 0;
  const rejected = byStatus.Rejected || 0;

  return {
    total: pending + submitted + verified + rejected,
    pending,
    submitted,
    verified,
    rejected,
  };
};

const LIST_PROJECTION = {
  enrollmentCode: 1,
  status: 1,
  clientName: 1,
  caregiverName: 1,
  planCode: 1,
  serviceAreas: 1,
  serviceAreaKey: 1,
  clientId: 1,
  carePlanId: 1,
  caregiverAccountId: 1,
  enrollmentDate: 1,
  submittedAt: 1,
  verifiedAt: 1,
  createdAt: 1,
  updatedAt: 1,
};

const formatEvvEnrollmentListItem = (doc) => ({
  id: String(doc._id),
  enrollmentCode: doc.enrollmentCode || '',
  status: doc.status || 'Pending',
  clientName: doc.clientName || '',
  caregiverName: doc.caregiverName || '',
  planCode: doc.planCode || '',
  serviceAreas: Array.isArray(doc.serviceAreas) ? doc.serviceAreas : [],
  serviceAreaKey: doc.serviceAreaKey || '',
  clientId: doc.clientId ? String(doc.clientId) : '',
  carePlanId: doc.carePlanId ? String(doc.carePlanId) : '',
  caregiverAccountId: doc.caregiverAccountId ? String(doc.caregiverAccountId) : '',
  enrollmentDate: doc.enrollmentDate || '',
  submittedAt: doc.submittedAt || null,
  verifiedAt: doc.verifiedAt || null,
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
});

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 5));
  const filter = { agencyId };

  if (query.status && query.status !== 'All') filter.status = query.status;
  if (query.client_id) filter.clientId = query.client_id;
  if (query.care_plan_id) filter.carePlanId = query.care_plan_id;
  if (query.caregiver_id) filter.caregiverAccountId = query.caregiver_id;
  if (query.search) {
    const regex = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { enrollmentCode: regex },
      { clientName: regex },
      { caregiverName: regex },
      { planCode: regex },
      { serviceAreas: regex },
      { serviceAreaKey: regex },
    ];
  }

  const [total, list] = await Promise.all([
    Model.EvvEnrollmentModel.countDocuments(filter),
    Model.EvvEnrollmentModel.find(filter)
      .select(LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  return {
    list: list.map(formatEvvEnrollmentListItem),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      from: total === 0 ? 0 : (page - 1) * limit + 1,
      to: Math.min(page * limit, total),
    },
  };
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

  // Agency may attach a missing client signature during review, plus office-use notes.
  if (payload.formData) {
    const existing = doc.formData || {};
    const existingAuth = existing.authorization || {};
    const incomingAuth = payload.formData.authorization || {};
    const nextAuth = { ...existingAuth };
    if (
      incomingAuth.clientSignature
      && String(incomingAuth.clientSignature).startsWith('data:image')
      && !(existingAuth.clientSignature && String(existingAuth.clientSignature).startsWith('data:image'))
    ) {
      nextAuth.clientSignature = incomingAuth.clientSignature;
      nextAuth.clientDate = toDateInput(incomingAuth.clientDate) || toDateInput(new Date());
    } else if (incomingAuth.clientDate && !existingAuth.clientDate) {
      nextAuth.clientDate = toDateInput(incomingAuth.clientDate);
    }
    doc.formData = {
      ...existing,
      authorization: nextAuth,
      officeUse: {
        ...(existing.officeUse || {}),
        ...(payload.formData.officeUse || {}),
      },
    };
    doc.markModified('formData');
  }

  const action = payload.action === 'reject' ? 'Rejected' : 'Verified';
  if (action === 'Verified') {
    const auth = doc.formData?.authorization || {};
    const clientSigned = Boolean(auth.clientSignature && String(auth.clientSignature).startsWith('data:image'));
    const caregiverSigned = Boolean(auth.caregiverSignature && String(auth.caregiverSignature).startsWith('data:image'));
    if (!clientSigned || !caregiverSigned) {
      throw new Error(constants.MESSAGE.EVV_ENROLLMENT.SIGNATURES_REQUIRED);
    }
  }

  doc.status = action;
  doc.verifiedAt = new Date();
  doc.verifiedByAccountId = getAccountId(req);

  await doc.save();
  const populated = await Model.EvvEnrollmentModel.findById(doc._id)
    .populate('clientId')
    .populate('carePlanId');

  const result = formatEvvEnrollment(populated, {
    client: populated.clientId,
    carePlan: populated.carePlanId,
  });

  // Notify caregiver (email + in-app) — fire-and-forget so verify response stays fast
  notifyEvvEnrollmentReviewed({
    agencyId: String(agencyId),
    enrollmentId: String(populated._id),
    caregiverAccountId: populated.caregiverAccountId,
    status: action,
    enrollmentCode: populated.enrollmentCode,
    clientName: populated.clientName
      || (populated.clientId
        ? `${populated.clientId.firstName || ''} ${populated.clientId.lastName || ''}`.trim()
        : ''),
    caregiverName: populated.caregiverName || '',
    serviceName: (populated.serviceAreas || []).join(', '),
  }).catch((err) => {
    console.error('[evvEnrollment] verify notify failed', err.message);
  });

  return result;
};

const notifyEvvEnrollmentReviewed = async ({
  agencyId,
  enrollmentId,
  caregiverAccountId,
  status,
  enrollmentCode,
  clientName,
  caregiverName,
  serviceName,
}) => {
  const isVerified = status === 'Verified';
  const { agencyName } = await getAgencyContext(agencyId);

  let caregiverEmail = '';
  let resolvedCaregiverName = caregiverName || '';
  if (caregiverAccountId) {
    const account = await Model.AgencyAccountModel.findById(caregiverAccountId)
      .select('email fullName');
    caregiverEmail = account?.email || '';
    if (!resolvedCaregiverName) resolvedCaregiverName = account?.fullName || '';
  }

  const portalUrl = enrollmentId
    ? `${functions.getFrontendUrl()}/caregiver/evv-enrollments/${enrollmentId}`
    : `${functions.getFrontendUrl()}/caregiver/evv-enrollments`;

  if (caregiverEmail) {
    try {
      if (isVerified) {
        await sendEvvEnrollmentVerifiedEmail({
          to: caregiverEmail,
          caregiverName: resolvedCaregiverName,
          agencyName,
          clientName,
          enrollmentCode,
          serviceName,
          portalUrl,
        });
      } else {
        await sendEvvEnrollmentRejectedEmail({
          to: caregiverEmail,
          caregiverName: resolvedCaregiverName,
          agencyName,
          clientName,
          enrollmentCode,
          serviceName,
          portalUrl,
        });
      }
    } catch (err) {
      console.error('[evvEnrollment] caregiver review email failed', err.message);
    }
  }

  if (caregiverAccountId) {
    await NotificationService.notifyAccount(caregiverAccountId, {
      type: isVerified
        ? NotificationService.TYPES.EVV_ENROLLMENT_VERIFIED
        : NotificationService.TYPES.EVV_ENROLLMENT_REJECTED,
      category: 'compliance',
      title: isVerified ? 'EVV enrollment verified' : 'EVV enrollment rejected',
      body: isVerified
        ? `Your enrollment ${enrollmentCode || ''} for ${clientName || 'your client'} was verified. You can clock in for covered visits.`
        : `Your enrollment ${enrollmentCode || ''} for ${clientName || 'your client'} was rejected. Please update and resubmit.`,
      tone: isVerified ? 'success' : 'warning',
      actionUrl: enrollmentId
        ? `/caregiver/evv-enrollments/${enrollmentId}`
        : '/caregiver/evv-enrollments',
      entityType: 'EvvEnrollment',
      entityId: enrollmentId,
      metadata: { enrollmentCode, clientName, status },
    });
  }
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
    const agency = await Model.AgencyModel.findById(agencyId).select('name phone');
    const prefill = buildPrefillFormData(
      doc.clientId,
      account,
      agency,
      doc.carePlanId,
      { serviceAreas: doc.serviceAreas || [] },
      profile?.candidate || null,
      profile?.formProfile || null,
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
    const nextServiceInfo = fillBlankCaregiverInfo(
      doc.formData?.serviceInfo,
      prefill.serviceInfo,
    );
    const changed = JSON.stringify(doc.formData?.caregiverInfo || {}) !== JSON.stringify(nextCaregiverInfo)
      || JSON.stringify(doc.formData?.mobileEnrollment || {}) !== JSON.stringify(nextMobile)
      || JSON.stringify(doc.formData?.serviceInfo || {}) !== JSON.stringify(nextServiceInfo);
    if (changed) {
      doc.formData = {
        ...doc.formData,
        caregiverInfo: nextCaregiverInfo,
        mobileEnrollment: nextMobile,
        serviceInfo: nextServiceInfo,
      };
      doc.markModified('formData');
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
    const existingAuth = existing.authorization || {};
    const incomingAuth = payload.formData.authorization || {};
    // Caregiver may sign caregiver sections only — never overwrite client signature.
    doc.formData = {
      ...payload.formData,
      clientInfo: existing.clientInfo || payload.formData.clientInfo,
      serviceInfo: existing.serviceInfo || payload.formData.serviceInfo,
      authorization: {
        ...incomingAuth,
        clientSignature: existingAuth.clientSignature || '',
        clientDate: existingAuth.clientDate || '',
      },
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
    caregiverAccountId: caregiver._id || caregiver.id,
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
  enrollmentId,
  caregiverAccountId,
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

  const actionPath = enrollmentId
    ? `/agency/evv/enrollments/${enrollmentId}/review`
    : '/agency/evv/enrollments';
  const payload = {
    type: NotificationService.TYPES.EVV_ENROLLMENT_SUBMITTED,
    category: 'compliance',
    title: 'EVV enrollment submitted',
    body: `${caregiverName} submitted enrollment ${enrollmentCode} for ${clientName}.`,
    tone: 'info',
    actionUrl: actionPath,
    entityType: 'EvvEnrollment',
    entityId: enrollmentId,
    metadata: { enrollmentCode, clientName, caregiverName },
  };
  await NotificationService.notifyAgency(agencyId, payload, { moduleKey: 'AGENCY_EVV_ENROLLMENTS' });
  await NotificationService.notifyPlatformAdmins({
    ...payload,
    title: `EVV enrollment submitted — ${agencyName}`,
    body: `${agencyName}: ${caregiverName} submitted ${enrollmentCode} for ${clientName}.`,
    actionUrl: '/admin/evv-compliance',
  });

  if (caregiverAccountId) {
    await NotificationService.notifyAccount(caregiverAccountId, {
      type: NotificationService.TYPES.EVV_ENROLLMENT_SUBMIT_CONFIRMATION,
      category: 'compliance',
      title: 'EVV enrollment submitted',
      body: `Your enrollment ${enrollmentCode} for ${clientName} was submitted successfully.`,
      tone: 'success',
      actionUrl: enrollmentId ? `/caregiver/evv-enrollments/${enrollmentId}` : '/caregiver/evv-enrollments',
      entityType: 'EvvEnrollment',
      entityId: enrollmentId,
      metadata: { enrollmentCode, clientName },
    });
  }
};

const getClientAccountContext = (req) => {
  const account = req.client;
  if (!account) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
  const agencyId = account.agencyId?._id || account.agencyId;
  const clientId = account.clientId?._id || account.clientId;
  if (!agencyId || !clientId) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  return { agencyId, clientId };
};

const getClientAll = async (req) => {
  const { agencyId, clientId } = getClientAccountContext(req);
  const list = await Model.EvvEnrollmentModel.find({ agencyId, clientId })
    .populate('clientId')
    .populate('carePlanId')
    .sort({ createdAt: -1 });
  return list.map((doc) => formatEvvEnrollment(doc, { client: doc.clientId, carePlan: doc.carePlanId }));
};

const getClientById = async (req, id) => {
  const { agencyId, clientId } = getClientAccountContext(req);
  const doc = await Model.EvvEnrollmentModel.findOne({ _id: id, agencyId, clientId })
    .populate('clientId')
    .populate('carePlanId');
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);
  return formatEvvEnrollment(doc, { client: doc.clientId, carePlan: doc.carePlanId });
};

const signClient = async (req, id, payload = {}) => {
  const { agencyId, clientId } = getClientAccountContext(req);
  const doc = await Model.EvvEnrollmentModel.findOne({ _id: id, agencyId, clientId });
  if (!doc) throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_FOUND);
  if (['Verified'].includes(doc.status)) {
    throw new Error(constants.MESSAGE.EVV_ENROLLMENT.NOT_PENDING);
  }

  const existingSig = doc.formData?.authorization?.clientSignature;
  if (existingSig && String(existingSig).startsWith('data:image')) {
    throw new Error(constants.MESSAGE.EVV_ENROLLMENT.ALREADY_SIGNED);
  }

  const signature = String(payload.signature || '').trim();
  if (!signature.startsWith('data:image')) {
    throw new Error(constants.MESSAGE.EVV_ENROLLMENT.SIGNATURE_REQUIRED);
  }

  const today = new Date().toISOString().slice(0, 10);
  const date = String(payload.date || today).trim() || today;

  doc.formData = {
    ...(doc.formData || {}),
    authorization: {
      ...(doc.formData?.authorization || {}),
      clientSignature: signature,
      clientDate: date,
    },
  };
  doc.markModified('formData');
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
  getClientAll,
  getClientById,
  signClient,
};
