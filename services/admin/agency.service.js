const Model = require('../../models/index');
const functions = require('../../common/functions');
const { buildUploadUrl } = require('../../common/candidateHelpers');

const formatPlan = (plan) => {
  if (!plan) return null;
  const client = functions.toClientDoc(plan);
  if (client && plan.subscriptionPlanId) {
    client.subscriptionPlanId = String(plan.subscriptionPlanId);
  }
  if (client && client.subscriptionPlanId && typeof client.subscriptionPlanId === 'object') {
    client.subscriptionPlanId = String(client.subscriptionPlanId);
  }
  return client;
};

const formatAgency = (agency) => {
  const client = functions.toClientDoc(agency);
  if (client?.subscriptionPlanId) {
    client.subscriptionPlanId = String(client.subscriptionPlanId);
  }
  return client;
};

const toIsoDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value);
    return raw.length >= 10 ? raw.slice(0, 10) : null;
  }
  return d.toISOString().slice(0, 10);
};

const parseSkills = (skills) => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.map((s) => String(s).trim()).filter(Boolean);
  return String(skills)
    .split(/[,|;/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const caregiverCode = (account) => {
  if (account.employeeId) return String(account.employeeId);
  const digits = String(account._id).replace(/\D/g, '').slice(-5).padStart(5, '0');
  return `CG-${digits}`;
};

const buildTimeline = (agency, plan) => {
  const events = [];
  const registered = toIsoDate(agency.registeredAt || agency.createdAt);
  if (registered) {
    events.push({
      id: 'registered',
      title: 'Agency Registered',
      detail: `${agency.name || 'Agency'} joined the platform`,
      date: registered,
      tone: 'done',
    });
  }

  if (plan?.name) {
    const cycle = plan.billingCycle ? ` · ${plan.billingCycle}` : '';
    events.push({
      id: 'plan',
      title: 'Current Plan',
      detail: `${plan.name}${cycle}`,
      date: registered || toIsoDate(agency.updatedAt),
      tone: 'done',
    });
  }

  return events.filter((e) => e.date);
};

const getLiveUsage = async (agencyId, agency) => {
  const [clients, caregivers, employees] = await Promise.all([
    Model.ClientModel.countDocuments({ agencyId }),
    Model.AgencyAccountModel.countDocuments({ agencyId, role: 'CAREGIVER' }),
    Model.AgencyAccountModel.countDocuments({
      agencyId,
      role: { $in: ['AGENCY_OWNER', 'HR', 'CAREGIVER'] },
    }),
  ]);

  const serviceAreaCount = Array.isArray(agency.serviceAreas) ? agency.serviceAreas.length : 0;

  return {
    clients,
    caregivers,
    users: employees,
    branches: serviceAreaCount || agency.usage?.branches || 0,
  };
};

const getTopCaregivers = async (agencyId) => {
  const rows = await Model.AgencyAccountModel.find({ agencyId, role: 'CAREGIVER' })
    .select('fullName email phone status createdAt employeeId')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    code: caregiverCode(row),
    name: row.fullName || '',
    email: row.email || '',
    phone: row.phone || '',
    status: row.status || 'Active',
    joinedOn: toIsoDate(row.createdAt),
  }));
};

const monthBounds = (offset = 0) => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { start, end };
};

const getCaregiverStats = async (agencyId) => {
  const base = { agencyId, role: 'CAREGIVER' };
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);

  const [total, active, inactive, pending, newThisMonth, newLastMonth] = await Promise.all([
    Model.AgencyAccountModel.countDocuments(base),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Active' }),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Inactive' }),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Pending' }),
    Model.AgencyAccountModel.countDocuments({
      ...base,
      createdAt: { $gte: thisMonth.start, $lt: thisMonth.end },
    }),
    Model.AgencyAccountModel.countDocuments({
      ...base,
      createdAt: { $gte: lastMonth.start, $lt: lastMonth.end },
    }),
  ]);

  let trendPct = null;
  if (newLastMonth > 0) {
    trendPct = Number((((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1));
  } else if (newThisMonth > 0) {
    trendPct = 100;
  } else {
    trendPct = 0;
  }

  return {
    total,
    active,
    inactive,
    pending,
    onLeave: pending,
    newThisMonth,
    newLastMonth,
    trendPct,
  };
};

const formatAdminCaregiver = (account, candidateMap) => {
  const candidate = account.candidateId
    ? candidateMap.get(String(account.candidateId))
    : null;
  const skills = parseSkills(candidate?.skills);
  const profilePic = account.profilePicPath
    ? buildUploadUrl(account.profilePicPath)
    : (candidate?.profilePicPath ? buildUploadUrl(candidate.profilePicPath) : '');

  return {
    id: String(account._id),
    code: caregiverCode(account),
    name: account.fullName || '',
    email: account.email || '',
    phone: account.phone || candidate?.phone || '',
    status: account.status || 'Active',
    joinedOn: toIsoDate(account.createdAt),
    skills,
    experience: candidate?.experience || '',
    profilePic,
    employeeId: account.employeeId || '',
  };
};

const getCaregivers = async (agencyId, query = {}) => {
  const agency = await Model.AgencyModel.findById(agencyId).select('_id');
  if (!agency) throw new Error('Agency Not Found');

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const search = String(query.search || '').trim();
  const status = String(query.status || 'All');

  const filter = { agencyId: agency._id, role: 'CAREGIVER' };
  if (status && status !== 'All') {
    filter.status = status;
  }
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { fullName: regex },
      { email: regex },
      { phone: regex },
      { employeeId: regex },
      { userId: regex },
    ];
  }

  const [stats, total, rows] = await Promise.all([
    getCaregiverStats(agency._id),
    Model.AgencyAccountModel.countDocuments(filter),
    Model.AgencyAccountModel.find(filter)
      .select('fullName email phone status createdAt employeeId candidateId profilePicPath')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const candidateIds = rows.map((r) => r.candidateId).filter(Boolean);
  const candidates = candidateIds.length
    ? await Model.CandidateModel.find({ _id: { $in: candidateIds } })
      .select('skills experience phone profilePicPath')
      .lean()
    : [];
  const candidateMap = new Map(candidates.map((c) => [String(c._id), c]));

  const list = rows.map((row) => formatAdminCaregiver(row, candidateMap));
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
    stats,
    list,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      from: total === 0 ? 0 : (page - 1) * limit + 1,
      to: Math.min(page * limit, total),
    },
  };
};

const getAll = async () => {
  const agencies = await Model.AgencyModel.find().sort({ createdAt: -1 });
  return functions.toClientList(agencies).map(formatAgency);
};

/** Lightweight dropdown list — id + name (+ status for badges). */
const getOptions = async () => {
  const agencies = await Model.AgencyModel.find()
    .select('name status')
    .sort({ name: 1 })
    .lean();
  return agencies.map((agency) => ({
    id: String(agency._id),
    name: agency.name || '',
    status: agency.status || 'Active',
  }));
};

const getById = async (id) => {
  const agency = await Model.AgencyModel.findById(id);
  if (!agency) throw new Error('Agency Not Found');

  const agencyOid = agency._id;
  const [usage, caregivers, planDoc] = await Promise.all([
    getLiveUsage(agencyOid, agency),
    getTopCaregivers(agencyOid),
    agency.subscriptionPlanId
      ? Model.SubscriptionPlanModel.findById(agency.subscriptionPlanId)
      : Promise.resolve(null),
  ]);

  const plan = formatPlan(planDoc);
  const formatted = formatAgency(agency);
  formatted.usage = usage;
  formatted.caregivers = caregivers;
  formatted.caregiverTotal = usage.caregivers;
  formatted.plan = plan;
  formatted.timeline = buildTimeline(agency, plan);
  return formatted;
};

const create = async (payload) => {
  const agency = await Model.AgencyModel.create(payload);
  return formatAgency(agency);
};

const update = async (id, payload) => {
  const agency = await Model.AgencyModel.findByIdAndUpdate(id, payload, { new: true });
  if (!agency) throw new Error('Agency Not Found');
  return getById(id);
};

const remove = async (id) => {
  const agency = await Model.AgencyModel.findByIdAndDelete(id);
  if (!agency) throw new Error('Agency Not Found');
  return true;
};

module.exports = {
  getAll,
  getOptions,
  getById,
  getCaregivers,
  create,
  update,
  remove,
  formatAgency,
};
