const Model = require('../../models/index');
const constants = require('../../common/constants');
const CarePlanService = require('./carePlan.service');
const functions = require('../../common/functions');

const resolveClient = async (req) => {
  const account = req.client;
  if (!account) throw new Error(constants.MESSAGE.AUTH.UNAUTHORIZED);
  const agencyId = account.agencyId?._id || account.agencyId;
  const clientId = account.clientId?._id || account.clientId;
  if (!agencyId || !clientId) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  const client = await Model.ClientModel.findOne({ _id: clientId, agencyId });
  if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);
  return { agencyId, client, account };
};

const toDateKey = (d) => {
  const x = new Date(d);
  const m = `${x.getMonth() + 1}`.padStart(2, '0');
  const day = `${x.getDate()}`.padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
};

const startOfWeekMonday = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
};

const fmtTime = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const fmtDuration = (mins) => {
  const total = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
};

const visitMinutes = (v) => {
  if (v.billableMinutes) return Number(v.billableMinutes) || 0;
  if (!v.checkInAt || !v.checkOutAt) return 0;
  return Math.max(0, (new Date(v.checkOutAt) - new Date(v.checkInAt)) / 60000);
};

const visitStatus = (v) => {
  if (v.status === 'Completed' || (v.checkOutAt && v.status === 'Exception')) return 'COMPLETED';
  if (['InProgress', 'Exception'].includes(v.status) && v.checkInAt && !v.checkOutAt) return 'IN PROGRESS';
  if (v.status === 'Missed') return 'MISSED';
  return 'UPCOMING';
};

const selectedInterventions = (need = {}) => {
  const ints = need.interventions || {};
  return Object.entries(ints).filter(([k, val]) => k !== 'otherText' && val === true);
};

const getDashboard = async (req) => {
  const { agencyId, client } = await resolveClient(req);
  const agency = await Model.AgencyModel.findById(agencyId).select('name phone email');

  const todayKey = toDateKey(new Date());
  const weekStart = startOfWeekMonday(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekFrom = toDateKey(weekStart);
  const weekTo = toDateKey(weekEnd);

  const [activePlanDoc, draftPlanDoc, todayVisits, weekVisits, recentVisit, openInvoices, lastPaid] = await Promise.all([
    Model.CarePlanModel.findOne({ agencyId, clientId: client._id, status: 'Active' }).sort({ updatedAt: -1 }),
    Model.CarePlanModel.findOne({ agencyId, clientId: client._id }).sort({ updatedAt: -1 }),
    Model.VisitModel.find({ agencyId, clientId: client._id, scheduledDate: todayKey }).sort({ scheduledStartAt: 1 }),
    Model.VisitModel.find({
      agencyId,
      clientId: client._id,
      scheduledDate: { $gte: weekFrom, $lte: weekTo },
    }).sort({ scheduledStartAt: 1 }),
    Model.VisitModel.findOne({
      agencyId,
      clientId: client._id,
      checkOutAt: { $ne: null },
    }).sort({ checkOutAt: -1 }),
    Model.ClientInvoiceModel.find({
      agencyId,
      clientId: client._id,
      status: { $in: ['Sent', 'Draft'] },
    }).sort({ createdAt: -1 }),
    Model.ClientInvoiceModel.findOne({
      agencyId,
      clientId: client._id,
      status: 'Paid',
    }).sort({ paidAt: -1, updatedAt: -1 }),
  ]);

  const activePlan = activePlanDoc || draftPlanDoc;

  const todayUpcoming = todayVisits.filter((v) => ['UPCOMING', 'IN PROGRESS'].includes(visitStatus(v))).length;
  const weekUpcoming = weekVisits.filter((v) => ['UPCOMING', 'IN PROGRESS'].includes(visitStatus(v))).length;

  const weekMins = weekVisits.reduce((sum, v) => sum + visitMinutes(v), 0);
  const goalHours = Number(activePlan?.weeklyHours || activePlan?.formData?.carePlanSummary?.recommendedWeeklyHours || 20);
  const hoursCurrent = weekMins / 60;
  const hoursPercent = goalHours > 0 ? Math.min(100, Math.round((hoursCurrent / goalHours) * 100)) : 0;

  const completedWeek = weekVisits.filter((v) => visitStatus(v) === 'COMPLETED');
  const complianceDenom = weekVisits.filter((v) => ['COMPLETED', 'MISSED'].includes(visitStatus(v)) || v.status === 'Exception').length;
  const compliancePct = complianceDenom
    ? Math.round((completedWeek.length / complianceDenom) * 100)
    : (weekVisits.length ? 100 : 100);

  // Caregivers from visits + care plan staff
  const caregiverMap = new Map();
  weekVisits.forEach((v) => {
    if (!v.caregiverAccountId) return;
    const id = String(v.caregiverAccountId);
    if (!caregiverMap.has(id)) {
      caregiverMap.set(id, { id, name: v.caregiverName || 'Caregiver', primary: false });
    }
  });
  const needs = activePlan?.formData?.careNeeds || [];
  needs.forEach((n) => {
    if (n.responsibleStaffId) {
      const id = String(n.responsibleStaffId);
      const existing = caregiverMap.get(id);
      if (existing) existing.primary = existing.primary || Boolean(n.responsibleStaff);
      else caregiverMap.set(id, { id, name: n.responsibleStaff || 'Caregiver', primary: true });
    }
  });
  const caregivers = [...caregiverMap.values()];
  const primaryCaregiver = caregivers.find((c) => c.primary) || caregivers[0] || null;

  // Care plan task progress from selected interventions + completed visits by area
  const carePlanProgress = needs
    .map((need) => {
      const selected = selectedInterventions(need);
      if (!selected.length) return null;
      const areaDone = completedWeek.filter((v) => v.careNeedAreaKey === need.areaKey).length;
      const total = selected.length;
      const completed = Math.min(total, areaDone);
      return {
        key: need.areaKey,
        label: need.areaLabel || need.areaKey,
        completed,
        total,
        percent: total ? Math.round((completed / total) * 100) : 0,
      };
    })
    .filter(Boolean);

  const tasksTotal = carePlanProgress.reduce((s, a) => s + a.total, 0);
  const tasksCompleted = carePlanProgress.reduce((s, a) => s + a.completed, 0);

  const balance = openInvoices
    .filter((inv) => inv.status === 'Sent')
    .reduce((s, inv) => s + (Number(inv.total) || 0), 0);

  const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'CL';

  return {
    client: {
      id: String(client._id),
      fullName,
      preferredName: client.preferredName || '',
      initials,
      clientCode: client.clientCode || '',
      status: client.status || '',
      email: client.email || '',
      phone: client.phone || client.phoneHome || '',
      profilePic: client.profilePicPath ? functions.buildUploadUrl(client.profilePicPath, req) : '',
    },
    agency: {
      name: agency?.name || '',
      phone: agency?.phone || '',
      email: agency?.email || '',
    },
    kpis: {
      upcomingVisits: {
        total: weekUpcoming,
        today: todayUpcoming,
        thisWeek: Math.max(0, weekUpcoming - todayUpcoming),
      },
      hoursThisWeek: {
        label: fmtDuration(weekMins),
        hours: Number(hoursCurrent.toFixed(2)),
        goalHours,
        percent: hoursPercent,
      },
      caregivers: {
        total: caregivers.length,
        primaryName: primaryCaregiver?.name || '',
      },
      carePlanTasks: {
        total: tasksTotal,
        completed: tasksCompleted,
        pending: Math.max(0, tasksTotal - tasksCompleted),
      },
      evvCompliance: {
        percent: compliancePct,
        period: 'This Week',
      },
    },
    todaySchedule: todayVisits.map((v) => ({
      id: String(v._id),
      time: `${fmtTime(v.scheduledStartAt)} – ${fmtTime(v.scheduledEndAt)}`,
      caregiverName: v.caregiverName || 'Caregiver',
      caregiverInitials: String(v.caregiverName || 'CG')
        .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join(''),
      service: v.serviceArea || '',
      address: v.address || '',
      status: visitStatus(v),
    })),
    recentVisit: recentVisit
      ? {
        id: String(recentVisit._id),
        date: recentVisit.scheduledDate || '',
        time: `${fmtTime(recentVisit.scheduledStartAt)} – ${fmtTime(recentVisit.scheduledEndAt)}`,
        caregiverName: recentVisit.caregiverName || 'Caregiver',
        caregiverInitials: String(recentVisit.caregiverName || 'CG')
          .split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join(''),
        service: recentVisit.serviceArea || '',
        status: visitStatus(recentVisit),
        duration: fmtDuration(visitMinutes(recentVisit)),
        checkIn: fmtTime(recentVisit.checkInAt),
        checkOut: fmtTime(recentVisit.checkOutAt),
        method: recentVisit.checkInMethod || recentVisit.checkOutMethod || 'Mobile App (GPS)',
      }
      : null,
    carePlan: activePlan
      ? {
        id: String(activePlan._id),
        planCode: activePlan.planCode || '',
        status: activePlan.status || '',
        version: activePlan.version || '',
        progress: carePlanProgress,
      }
      : null,
    messages: [],
    unreadMessages: 0,
    unreadAlerts: todayVisits.filter((v) => v.status === 'Missed' || v.lateCheckIn).length,
    invoices: {
      balance,
      paidUp: balance <= 0,
      lastPayment: lastPaid
        ? {
          date: lastPaid.paidAt || lastPaid.updatedAt,
          amount: Number(lastPaid.total) || 0,
          invoiceCode: lastPaid.invoiceCode || '',
        }
        : null,
    },
    caregivers,
  };
};

const getCarePlans = async (req) => {
  const { agencyId, client } = await resolveClient(req);
  // Client portal shows only the latest care plan (prefer Active).
  let doc = await Model.CarePlanModel.findOne({ agencyId, clientId: client._id, status: 'Active' })
    .sort({ updatedAt: -1 })
    .populate('clientId');
  if (!doc) {
    doc = await Model.CarePlanModel.findOne({ agencyId, clientId: client._id })
      .sort({ updatedAt: -1 })
      .populate('clientId');
  }
  if (!doc) return [];
  return [CarePlanService.formatCarePlan(doc, doc.clientId, req)];
};

const getCarePlanById = async (req, id) => {
  const { agencyId, client } = await resolveClient(req);
  const doc = await Model.CarePlanModel.findOne({
    _id: id,
    agencyId,
    clientId: client._id,
  }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);
  return CarePlanService.formatCarePlan(doc, doc.clientId, req);
};

const hasClientSignature = (formData = {}) => {
  const sig = formData?.signatures?.clientRep?.signature;
  return Boolean(sig && String(sig).startsWith('data:image'));
};

const signCarePlan = async (req, id) => {
  const { agencyId, client } = await resolveClient(req);
  const doc = await Model.CarePlanModel.findOne({
    _id: id,
    agencyId,
    clientId: client._id,
  }).populate('clientId');
  if (!doc) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  const formData = doc.formData && typeof doc.formData === 'object' ? { ...doc.formData } : {};
  if (hasClientSignature(formData)) {
    throw new Error(constants.MESSAGE.CARE_PLAN.ALREADY_SIGNED);
  }

  const signature = String(req.body?.signature || '').trim();
  if (!signature.startsWith('data:image')) {
    throw new Error(constants.MESSAGE.CARE_PLAN.SIGNATURE_REQUIRED);
  }

  const existing = formData.signatures?.clientRep || {};
  const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
  const today = new Date().toISOString().slice(0, 10);
  const name = String(req.body?.name || existing.name || fullName || '').trim();
  const date = String(req.body?.date || today).trim() || today;

  formData.signatures = {
    ...(formData.signatures || {}),
    clientRep: {
      ...existing,
      name,
      signature,
      date,
    },
  };

  doc.formData = formData;
  doc.markModified('formData');
  await doc.save();
  return CarePlanService.formatCarePlan(doc, doc.clientId, req);
};

const parseSkills = (skills) => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.map((s) => String(s).trim()).filter(Boolean);
  return String(skills)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const resolveAssignedCaregiverMeta = async (agencyId, clientId) => {
  const metaById = new Map();

  const ensure = (rawId, patch = {}) => {
    const id = String(rawId || '');
    if (!id || id === 'undefined' || id === 'null') return null;
    const existing = metaById.get(id) || {
      id,
      primary: false,
      serviceAreas: [],
    };
    if (patch.primary) existing.primary = true;
    if (patch.serviceArea) {
      const key = patch.serviceArea.areaKey || patch.serviceArea.areaLabel || '';
      const already = existing.serviceAreas.some(
        (a) => (a.areaKey || a.areaLabel) === key,
      );
      if (!already && (patch.serviceArea.areaLabel || patch.serviceArea.areaKey)) {
        existing.serviceAreas.push(patch.serviceArea);
      }
    }
    metaById.set(id, existing);
    return existing;
  };

  const [activePlan, anyPlan, schedules, recentVisits] = await Promise.all([
    Model.CarePlanModel.findOne({ agencyId, clientId, status: 'Active' }).sort({ updatedAt: -1 }),
    Model.CarePlanModel.findOne({ agencyId, clientId }).sort({ updatedAt: -1 }),
    Model.VisitScheduleModel.find({
      agencyId,
      clientId,
      caregiverAccountId: { $ne: null },
      status: { $ne: 'Inactive' },
    }).select('caregiverAccountId serviceArea careNeedAreaKey'),
    Model.VisitModel.find({
      agencyId,
      clientId,
      caregiverAccountId: { $ne: null },
    })
      .sort({ scheduledStartAt: -1 })
      .limit(100)
      .select('caregiverAccountId serviceArea careNeedAreaKey'),
  ]);

  const plan = activePlan || anyPlan;
  (plan?.formData?.careNeeds || []).forEach((need) => {
    if (!need?.responsibleStaffId) return;
    ensure(need.responsibleStaffId, {
      primary: true,
      serviceArea: {
        areaKey: need.areaKey || need.careNeedAreaKey || '',
        areaLabel: need.areaLabel || need.serviceArea || '',
        frequency: need.frequency || '',
      },
    });
  });

  schedules.forEach((s) => {
    ensure(s.caregiverAccountId, {
      serviceArea: {
        areaKey: s.careNeedAreaKey || '',
        areaLabel: s.serviceArea || '',
        frequency: '',
      },
    });
  });

  recentVisits.forEach((v) => {
    ensure(v.caregiverAccountId, {
      serviceArea: {
        areaKey: v.careNeedAreaKey || '',
        areaLabel: v.serviceArea || '',
        frequency: '',
      },
    });
  });

  return metaById;
};

const formatClientCaregiver = async (account, meta, req, { includeUpcoming = false, agencyId, clientId } = {}) => {
  if (!account) return null;
  const id = String(account._id);

  let candidate = null;
  if (account.candidateId) {
    candidate = await Model.CandidateModel.findById(account.candidateId)
      .select('skills experience designation summary profilePicPath phone');
  }

  let jobTitle = '';
  if (account.sourceJobPostId) {
    const job = await Model.JobPostModel.findById(account.sourceJobPostId).select('jobTitle');
    jobTitle = job?.jobTitle || '';
  }
  if (!jobTitle && candidate?.designation) jobTitle = candidate.designation;

  const accountPic = account.profilePicPath
    ? functions.buildUploadUrl(account.profilePicPath, req)
    : '';
  const candidatePic = candidate?.profilePicPath
    ? functions.buildUploadUrl(candidate.profilePicPath, req)
    : '';

  const initials = String(account.fullName || 'CG')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'CG';

  const todayKey = toDateKey(new Date());
  let nextVisit = null;
  let upcomingVisits = [];

  if (agencyId && clientId) {
    const upcomingFilter = {
      agencyId,
      clientId,
      caregiverAccountId: account._id,
      scheduledDate: { $gte: todayKey },
      status: { $nin: ['Cancelled'] },
    };
    if (includeUpcoming) {
      const list = await Model.VisitModel.find(upcomingFilter)
        .sort({ scheduledStartAt: 1 })
        .limit(5);
      upcomingVisits = list.map((v) => ({
        id: String(v._id),
        scheduledDate: v.scheduledDate || '',
        scheduledStartAt: v.scheduledStartAt || null,
        scheduledEndAt: v.scheduledEndAt || null,
        timezone: v.timezone || '',
        serviceArea: v.serviceArea || '',
        status: v.status || '',
        address: v.address || '',
      }));
      nextVisit = upcomingVisits[0] || null;
    } else {
      const visit = await Model.VisitModel.findOne(upcomingFilter).sort({ scheduledStartAt: 1 });
      if (visit) {
        nextVisit = {
          id: String(visit._id),
          scheduledDate: visit.scheduledDate || '',
          scheduledStartAt: visit.scheduledStartAt || null,
          scheduledEndAt: visit.scheduledEndAt || null,
          timezone: visit.timezone || '',
          serviceArea: visit.serviceArea || '',
          status: visit.status || '',
          address: visit.address || '',
        };
      }
    }
  }

  return {
    id,
    fullName: account.fullName || '',
    initials,
    phone: account.phone || candidate?.phone || '',
    email: account.email || '',
    profilePic: accountPic || candidatePic || '',
    jobTitle,
    experience: candidate?.experience != null && candidate.experience !== ''
      ? Number(candidate.experience) || candidate.experience
      : null,
    summary: candidate?.summary || '',
    skills: parseSkills(candidate?.skills),
    primary: Boolean(meta?.primary),
    serviceAreas: meta?.serviceAreas || [],
    nextVisit,
    ...(includeUpcoming ? { upcomingVisits } : {}),
  };
};

const getCaregivers = async (req) => {
  const { agencyId, client } = await resolveClient(req);
  const metaById = await resolveAssignedCaregiverMeta(agencyId, client._id);
  const ids = [...metaById.keys()];
  if (!ids.length) return [];

  const accounts = await Model.AgencyAccountModel.find({
    _id: { $in: ids },
    agencyId,
    role: 'CAREGIVER',
    status: { $ne: 'Inactive' },
  });

  const formatted = await Promise.all(
    accounts.map((account) => formatClientCaregiver(
      account,
      metaById.get(String(account._id)),
      req,
      { agencyId, clientId: client._id },
    )),
  );

  return formatted
    .filter(Boolean)
    .sort((a, b) => {
      if (a.primary !== b.primary) return a.primary ? -1 : 1;
      return (a.fullName || '').localeCompare(b.fullName || '');
    });
};

const getCaregiverById = async (req, id) => {
  const { agencyId, client } = await resolveClient(req);
  const metaById = await resolveAssignedCaregiverMeta(agencyId, client._id);
  const meta = metaById.get(String(id));
  if (!meta) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);

  const account = await Model.AgencyAccountModel.findOne({
    _id: id,
    agencyId,
    role: 'CAREGIVER',
  });
  if (!account) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);

  return formatClientCaregiver(account, meta, req, {
    includeUpcoming: true,
    agencyId,
    clientId: client._id,
  });
};

module.exports = {
  getDashboard,
  getCarePlans,
  getCarePlanById,
  signCarePlan,
  getCaregivers,
  getCaregiverById,
};
