const mongoose = require('mongoose');
const Model = require('../../models/index');
const { buildUploadUrl } = require('../../common/candidateHelpers');
const { notArchivedFilter } = require('../../common/agencyVisibility');

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
};

const hasInkSignature = (value) => Boolean(value && String(value).startsWith('data:image'));

const lastEvvDate = (doc) => doc.verifiedAt || doc.submittedAt || doc.updatedAt || doc.createdAt || null;

const formatLastEvv = (value) => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
};

const initials = (name = '') =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'EM';

const isClientPending = (doc) =>
  !hasInkSignature(doc?.formData?.authorization?.clientSignature);

const isOwnerPending = (doc) => doc?.status === 'Submitted';

const mapFinalStatus = (docs) => {
  if (!docs.length) return 'Un Verified';
  if (docs.every((d) => d.status === 'Verified')) return 'Verified';
  if (docs.some((d) => d.status === 'Rejected')) return 'Un Verified';
  if (docs.some((d) => d.status === 'Pending' || d.status === 'Submitted')) return 'Pending';
  return 'Un Verified';
};

const agencyScope = async (agencyId) => {
  const oid = toOid(agencyId);
  if (oid) {
    const agency = await Model.AgencyModel.findOne({ _id: oid, ...notArchivedFilter() }).select('_id').lean();
    if (!agency) return { agencyId: { $in: [] } };
    return { agencyId: oid };
  }
  const visibleIds = await Model.AgencyModel.find(notArchivedFilter()).distinct('_id');
  return { agencyId: { $in: visibleIds } };
};

const buildDateFilter = (from, to) => {
  const fromStr = String(from || '').slice(0, 10);
  const toStr = String(to || '').slice(0, 10);
  if (!fromStr && !toStr) return null;

  const range = {};
  if (fromStr) {
    const start = new Date(`${fromStr}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) range.$gte = start;
  }
  if (toStr) {
    const end = new Date(`${toStr}T23:59:59.999Z`);
    if (!Number.isNaN(end.getTime())) range.$lte = end;
  }
  if (!Object.keys(range).length) return null;

  return {
    $or: [
      { verifiedAt: range },
      { submittedAt: range },
      { updatedAt: range },
    ],
  };
};

const loadEnrollments = async (query = {}) => {
  const filter = {
    ...(await agencyScope(query.agencyId)),
  };

  const clauses = [];
  const dateFilter = buildDateFilter(query.from, query.to);
  if (dateFilter) clauses.push(dateFilter);

  if (query.search) {
    const regex = new RegExp(String(query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    clauses.push({
      $or: [
        { caregiverName: regex },
        { clientName: regex },
        { enrollmentCode: regex },
        { planCode: regex },
      ],
    });
  }

  if (clauses.length === 1) Object.assign(filter, clauses[0]);
  else if (clauses.length > 1) filter.$and = clauses;

  return Model.EvvEnrollmentModel.find(filter).sort({ updatedAt: -1 }).lean();
};

const buildEmployeeRows = async (enrollments, req = null) => {
  const byCaregiver = new Map();
  enrollments.forEach((doc) => {
    const key = String(doc.caregiverAccountId || '');
    if (!key) return;
    if (!byCaregiver.has(key)) byCaregiver.set(key, []);
    byCaregiver.get(key).push(doc);
  });

  const caregiverIds = [...byCaregiver.keys()].map((id) => toOid(id)).filter(Boolean);
  const agencyIds = [...new Set(enrollments.map((e) => String(e.agencyId)).filter(Boolean))];

  const [accounts, agencies] = await Promise.all([
    caregiverIds.length
      ? Model.AgencyAccountModel.find({ _id: { $in: caregiverIds } })
        .select('fullName profilePicPath agencyId status email')
        .lean()
      : [],
    agencyIds.length
      ? Model.AgencyModel.find({ _id: { $in: agencyIds } }).select('name').lean()
      : [],
  ]);

  const accountMap = new Map(accounts.map((a) => [String(a._id), a]));
  const agencyMap = new Map(agencies.map((a) => [String(a._id), a.name || '—']));

  const rows = [];
  byCaregiver.forEach((docs, caregiverId) => {
    const account = accountMap.get(caregiverId);
    const primary = docs[0];
    const name = account?.fullName || primary.caregiverName || 'Caregiver';
    const agencyId = String(account?.agencyId || primary.agencyId || '');
    const clientPending = docs.some(isClientPending);
    const ownerPending = docs.some(isOwnerPending);
    const finalStatus = mapFinalStatus(docs);
    const lastAt = docs
      .map(lastEvvDate)
      .filter(Boolean)
      .sort((a, b) => new Date(b) - new Date(a))[0] || null;

    rows.push({
      id: caregiverId,
      employeeName: name,
      initials: initials(name),
      profilePic: account?.profilePicPath ? buildUploadUrl(account.profilePicPath, req) : '',
      agencyId,
      agencyName: agencyMap.get(agencyId) || '—',
      clientSidePending: clientPending,
      ownerSidePending: ownerPending,
      finalStatus,
      lastEvvAt: lastAt,
      lastEvvLabel: formatLastEvv(lastAt),
      enrollmentCount: docs.length,
      enrollments: docs.map((d) => ({
        id: String(d._id),
        enrollmentCode: d.enrollmentCode || '',
        clientName: d.clientName || '',
        status: d.status,
        clientSidePending: isClientPending(d),
        ownerSidePending: isOwnerPending(d),
        lastEvvLabel: formatLastEvv(lastEvvDate(d)),
        serviceAreas: Array.isArray(d.serviceAreas) ? d.serviceAreas : [],
      })),
    });
  });

  rows.sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName)));
  return rows;
};

const getStats = async (query = {}) => {
  const enrollments = await loadEnrollments(query);
  const rows = await buildEmployeeRows(enrollments);

  return {
    totalEmployees: rows.length,
    clientSidePending: rows.filter((r) => r.clientSidePending).length,
    ownerSidePending: rows.filter((r) => r.ownerSidePending).length,
    verified: rows.filter((r) => r.finalStatus === 'Verified').length,
    unVerified: rows.filter((r) => r.finalStatus === 'Un Verified').length,
  };
};

const getEmployees = async (query = {}, req = null) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const enrollments = await loadEnrollments(query);
  let rows = await buildEmployeeRows(enrollments, req);

  if (query.finalStatus && query.finalStatus !== 'All') {
    rows = rows.filter((r) => r.finalStatus === query.finalStatus);
  }

  const total = rows.length;
  const start = (page - 1) * limit;
  const list = rows.slice(start, start + limit);

  return {
    list,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      from: total === 0 ? 0 : start + 1,
      to: Math.min(start + limit, total),
    },
  };
};

const getEmployeeDetail = async (caregiverId, query = {}, req = null) => {
  const oid = toOid(caregiverId);
  if (!oid) throw new Error('Caregiver not found');

  const filter = {
    caregiverAccountId: oid,
    ...(await agencyScope(query.agencyId)),
  };
  const dateFilter = buildDateFilter(query.from, query.to);
  if (dateFilter) Object.assign(filter, dateFilter);

  const enrollments = await Model.EvvEnrollmentModel.find(filter).sort({ updatedAt: -1 }).lean();
  const rows = await buildEmployeeRows(enrollments, req);
  const row = rows[0];
  if (!row) throw new Error('No EVV records found for this employee');
  return row;
};

module.exports = {
  getStats,
  getEmployees,
  getEmployeeDetail,
};
