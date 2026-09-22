const Model = require('../../models/index');
const functions = require('../../common/functions');
const { buildUploadUrl } = require('../../common/candidateHelpers');

const STAFF_ROLES = ['AGENCY_OWNER', 'HR', 'CAREGIVER'];
const OFFICE_ROLES = ['AGENCY_OWNER', 'HR'];

const ROLE_LABELS = {
  CAREGIVER: 'Caregiver',
  HR: 'Office Staff',
  AGENCY_OWNER: 'Agency Owner',
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

const pad2 = (n) => String(n).padStart(2, '0');

const addDaysKey = (dateKey, days) => {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + Number(days || 0)));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
};

const startOfWeekMonday = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
};

const monthBounds = (offset = 0) => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { start, end };
};

const formatClock = (value, timeZone = 'America/New_York') => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
};

const hoursBetween = (start, end) => {
  if (!start || !end) return null;
  const a = start instanceof Date ? start : new Date(start);
  const b = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return null;
  return Number(((b.getTime() - a.getTime()) / 3600000).toFixed(2));
};

const mapRoleLabel = (role) => ROLE_LABELS[role] || role || 'User';

const resolveRolesFilter = (roleQuery) => {
  const role = String(roleQuery || 'All').trim();
  if (!role || role === 'All' || role === 'All Roles') return STAFF_ROLES;
  if (role === 'Caregiver' || role === 'CAREGIVER') return ['CAREGIVER'];
  if (role === 'Office Staff' || role === 'HR') return OFFICE_ROLES;
  if (role === 'Agency Owner' || role === 'AGENCY_OWNER') return ['AGENCY_OWNER'];
  if (STAFF_ROLES.includes(role)) return [role];
  return STAFF_ROLES;
};

const assertAgency = async (agencyId) => {
  const agency = await Model.AgencyModel.findById(agencyId).select('name city state');
  if (!agency) throw new Error('Agency Not Found');
  return agency;
};

const formatUser = (account, extras = {}) => ({
  id: String(account._id),
  name: account.fullName || '',
  fullName: account.fullName || '',
  email: account.email || '',
  phone: account.phone || '',
  userId: account.userId || '',
  role: account.role,
  roleLabel: mapRoleLabel(account.role),
  status: account.status || 'Active',
  joinedOn: toIsoDate(account.createdAt),
  createdAt: account.createdAt || null,
  dateOfBirth: account.dateOfBirth || '',
  profilePic: account.profilePicPath ? buildUploadUrl(account.profilePicPath) : '',
  employeeId: account.employeeId || '',
  agencyId: String(account.agencyId || extras.agencyId || ''),
  agencyName: extras.agencyName || '',
});

const countCreatedInRange = (agencyId, roles, status, start, end) => {
  const filter = {
    agencyId,
    role: { $in: roles },
    createdAt: { $gte: start, $lt: end },
  };
  if (status) filter.status = status;
  return Model.AgencyAccountModel.countDocuments(filter);
};

const getStats = async (agencyId) => {
  await assertAgency(agencyId);
  const base = { agencyId, role: { $in: STAFF_ROLES } };
  const thisMonth = monthBounds(0);
  const lastMonth = monthBounds(-1);

  const [
    total,
    caregivers,
    officeStaff,
    active,
    pending,
    inactive,
    totalThisMonth,
    caregiversThisMonth,
    officeThisMonth,
    pendingThisMonth,
    inactiveThisMonth,
    totalLastMonth,
    pendingLastMonth,
    inactiveLastMonth,
  ] = await Promise.all([
    Model.AgencyAccountModel.countDocuments(base),
    Model.AgencyAccountModel.countDocuments({ agencyId, role: 'CAREGIVER' }),
    Model.AgencyAccountModel.countDocuments({ agencyId, role: { $in: OFFICE_ROLES } }),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Active' }),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Pending' }),
    Model.AgencyAccountModel.countDocuments({ ...base, status: 'Inactive' }),
    countCreatedInRange(agencyId, STAFF_ROLES, null, thisMonth.start, thisMonth.end),
    countCreatedInRange(agencyId, ['CAREGIVER'], null, thisMonth.start, thisMonth.end),
    countCreatedInRange(agencyId, OFFICE_ROLES, null, thisMonth.start, thisMonth.end),
    countCreatedInRange(agencyId, STAFF_ROLES, 'Pending', thisMonth.start, thisMonth.end),
    countCreatedInRange(agencyId, STAFF_ROLES, 'Inactive', thisMonth.start, thisMonth.end),
    countCreatedInRange(agencyId, STAFF_ROLES, null, lastMonth.start, lastMonth.end),
    countCreatedInRange(agencyId, STAFF_ROLES, 'Pending', lastMonth.start, lastMonth.end),
    countCreatedInRange(agencyId, STAFF_ROLES, 'Inactive', lastMonth.start, lastMonth.end),
  ]);

  const activePct = total > 0 ? Number(((active / total) * 100).toFixed(1)) : 0;

  return {
    total,
    caregivers,
    officeStaff,
    active,
    pendingInvites: pending,
    inactive,
    activePct,
    deltas: {
      total: totalThisMonth,
      caregivers: caregiversThisMonth,
      officeStaff: officeThisMonth,
      pendingInvites: pendingThisMonth - pendingLastMonth,
      inactive: inactiveThisMonth - inactiveLastMonth,
      totalLastMonth,
    },
  };
};

const getUsers = async (agencyId, query = {}) => {
  const agency = await assertAgency(agencyId);
  const agencyName = agency.name || '';

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10));
  const search = String(query.search || '').trim();
  const status = String(query.status || 'All').trim();
  const roles = resolveRolesFilter(query.role);

  const filter = {
    agencyId,
    role: { $in: roles },
  };

  if (status && status !== 'All' && status !== 'All Status') {
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

  const [total, rows] = await Promise.all([
    Model.AgencyAccountModel.countDocuments(filter),
    Model.AgencyAccountModel.find(filter)
      .select('fullName email phone role status createdAt profilePicPath employeeId userId dateOfBirth agencyId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const list = rows.map((row) => formatUser(row, { agencyId, agencyName }));
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return {
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

const getUserById = async (agencyId, userId) => {
  const agency = await assertAgency(agencyId);
  const account = await Model.AgencyAccountModel.findOne({
    _id: userId,
    agencyId,
    role: { $in: STAFF_ROLES },
  }).lean();
  if (!account) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  return formatUser(account, { agencyId, agencyName: agency.name || '' });
};

const updateStatus = async (agencyId, userId, status) => {
  await assertAgency(agencyId);
  const account = await Model.AgencyAccountModel.findOne({
    _id: userId,
    agencyId,
    role: { $in: STAFF_ROLES },
  });
  if (!account) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const next = String(status || '').trim();
  if (!['Active', 'Inactive', 'Pending'].includes(next)) {
    const err = new Error('Invalid status');
    err.statusCode = 400;
    throw err;
  }

  account.status = next;
  if (next === 'Inactive') {
    account.jti = functions.generateRandomStringAndNumbers(20);
  }
  await account.save();

  const agency = await Model.AgencyModel.findById(agencyId).select('name').lean();
  return formatUser(account.toObject ? account.toObject() : account, {
    agencyId,
    agencyName: agency?.name || '',
  });
};

const getSchedules = async (agencyId, query = {}) => {
  await assertAgency(agencyId);

  const weekStart = query.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(query.weekStart)
    ? query.weekStart
    : startOfWeekMonday(new Date());
  const weekEnd = addDaysKey(weekStart, 6);
  const userId = String(query.userId || '').trim();

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysKey(weekStart, i);
    const d = new Date(`${date}T12:00:00Z`);
    return {
      date,
      label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
      dayNum: Number(date.slice(-2)),
    };
  });

  const visitFilter = {
    agencyId,
    scheduledDate: { $gte: weekStart, $lte: weekEnd },
    status: { $ne: 'Cancelled' },
  };
  if (userId) visitFilter.caregiverAccountId = userId;

  const visits = await Model.VisitModel.find(visitFilter)
    .select('caregiverAccountId caregiverName scheduledDate scheduledStartAt scheduledEndAt timezone')
    .sort({ scheduledStartAt: 1 })
    .lean();

  const byUser = new Map();
  visits.forEach((visit) => {
    const id = String(visit.caregiverAccountId);
    if (!byUser.has(id)) {
      byUser.set(id, {
        userId: id,
        name: visit.caregiverName || 'Caregiver',
        profilePic: '',
        slots: {},
      });
    }
    const row = byUser.get(id);
    if (!row.slots[visit.scheduledDate]) row.slots[visit.scheduledDate] = [];
    row.slots[visit.scheduledDate].push({
      start: formatClock(visit.scheduledStartAt, visit.timezone),
      end: formatClock(visit.scheduledEndAt, visit.timezone),
      label: `${formatClock(visit.scheduledStartAt, visit.timezone)} - ${formatClock(visit.scheduledEndAt, visit.timezone)}`,
    });
  });

  const userIds = [...byUser.keys()];
  if (userIds.length) {
    const accounts = await Model.AgencyAccountModel.find({ _id: { $in: userIds } })
      .select('fullName profilePicPath')
      .lean();
    accounts.forEach((acc) => {
      const row = byUser.get(String(acc._id));
      if (!row) return;
      if (acc.fullName) row.name = acc.fullName;
      if (acc.profilePicPath) row.profilePic = buildUploadUrl(acc.profilePicPath);
    });
  }

  const rows = [...byUser.values()].map((row) => ({
    userId: row.userId,
    name: row.name,
    profilePic: row.profilePic,
    days: days.map((day) => ({
      date: day.date,
      slots: row.slots[day.date] || [],
    })),
  }));

  const caregivers = await Model.AgencyAccountModel.find({ agencyId, role: 'CAREGIVER' })
    .select('fullName')
    .sort({ fullName: 1 })
    .lean();

  return {
    weekStart,
    weekEnd,
    days,
    rows,
    users: caregivers.map((c) => ({ id: String(c._id), name: c.fullName || '' })),
  };
};

const formatAdminEvvEnrollment = (doc, account) => ({
  id: String(doc._id),
  enrollmentCode: doc.enrollmentCode || '',
  status: doc.status || 'Pending',
  userId: String(doc.caregiverAccountId || ''),
  userName: account?.fullName || doc.caregiverName || 'Caregiver',
  profilePic: account?.profilePicPath ? buildUploadUrl(account.profilePicPath) : '',
  date: doc.enrollmentDate || toIsoDate(doc.submittedAt || doc.createdAt) || '',
  clientName: doc.clientName || '—',
  planCode: doc.planCode || '',
  serviceAreas: Array.isArray(doc.serviceAreas) ? doc.serviceAreas : [],
  caregiverName: account?.fullName || doc.caregiverName || 'Caregiver',
  caregiverAccountId: String(doc.caregiverAccountId || ''),
  clientId: doc.clientId ? String(doc.clientId) : '',
  carePlanId: doc.carePlanId ? String(doc.carePlanId) : '',
  enrollmentDate: doc.enrollmentDate || '',
  formData: doc.formData || undefined,
  submittedAt: doc.submittedAt || null,
  verifiedAt: doc.verifiedAt || null,
});

const getEvvForms = async (agencyId, query = {}) => {
  await assertAgency(agencyId);

  // Enrollment forms are independent of the schedules week picker.
  const userId = String(query.userId || '').trim();
  const status = String(query.status || 'All').trim();
  const defaultLimit = userId ? 100 : 20;
  const limit = Math.min(200, Math.max(1, Number(query.limit) || defaultLimit));

  const filter = { agencyId };
  if (userId) filter.caregiverAccountId = userId;

  if (status && status !== 'All' && status !== 'All Status') {
    if (status === 'Verified') filter.status = 'Verified';
    else if (status === 'Pending') filter.status = { $in: ['Pending', 'Submitted'] };
    else if (status === 'Submitted') filter.status = 'Submitted';
    else if (status === 'Rejected') filter.status = 'Rejected';
  }

  const enrollments = await Model.EvvEnrollmentModel.find(filter)
    .select('enrollmentCode status clientName caregiverName caregiverAccountId planCode serviceAreas enrollmentDate submittedAt verifiedAt createdAt clientId carePlanId')
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  const userIds = [...new Set(enrollments.map((e) => String(e.caregiverAccountId)).filter(Boolean))];
  const accounts = userIds.length
    ? await Model.AgencyAccountModel.find({ _id: { $in: userIds } }).select('fullName profilePicPath').lean()
    : [];
  const accountMap = new Map(accounts.map((a) => [String(a._id), a]));

  const caregivers = await Model.AgencyAccountModel.find({ agencyId, role: 'CAREGIVER' })
    .select('fullName')
    .sort({ fullName: 1 })
    .lean();

  return {
    list: enrollments.map((doc) => formatAdminEvvEnrollment(doc, accountMap.get(String(doc.caregiverAccountId)))),
    users: caregivers.map((c) => ({ id: String(c._id), name: c.fullName || '' })),
  };
};

const getEvvFormDetail = async (agencyId, enrollmentId) => {
  await assertAgency(agencyId);
  const doc = await Model.EvvEnrollmentModel.findOne({ _id: enrollmentId, agencyId }).lean();
  if (!doc) {
    const err = new Error('EVV form not found');
    err.statusCode = 404;
    throw err;
  }
  const account = await Model.AgencyAccountModel.findById(doc.caregiverAccountId)
    .select('fullName profilePicPath')
    .lean();
  return formatAdminEvvEnrollment(doc, account);
};

module.exports = {
  getStats,
  getUsers,
  getUserById,
  updateStatus,
  getSchedules,
  getEvvForms,
  getEvvFormDetail,
  ROLE_LABELS,
  startOfWeekMonday,
};
