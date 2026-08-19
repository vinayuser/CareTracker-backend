const mongoose = require('mongoose');
const Model = require('../../models/index');
const functions = require('../../common/functions');
const { buildUploadUrl } = require('../../common/candidateHelpers');
const { CARE_OVERVIEW_CATEGORIES } = require('../../common/carePlanConstants');

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
};

const pad2 = (n) => String(n).padStart(2, '0');

const todayKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

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

const formatLongDate = (value) => {
  if (!value) return '';
  const raw = String(value);
  const d = raw.includes('T') ? new Date(raw) : new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const weekdayShort = (value) => {
  const raw = String(value);
  const d = raw.includes('T') ? new Date(raw) : new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
};

const monthShort = (value) => {
  const raw = String(value);
  const d = raw.includes('T') ? new Date(raw) : new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
};

const dayNum = (value) => {
  const raw = String(value);
  const d = raw.includes('T') ? new Date(raw) : new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getDate());
};

const initials = (name = '') => String(name)
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((p) => p[0]?.toUpperCase() || '')
  .join('') || 'CG';

const serviceLabel = (key) =>
  CARE_OVERVIEW_CATEGORIES.find((item) => item.key === key)?.label || key || 'Visit';

const clientFullName = (client) => `${client.firstName || ''} ${client.lastName || ''}`.trim();

const agencyFilter = (agencyId) => {
  const oid = toOid(agencyId);
  return oid ? { agencyId: oid } : {};
};

const caregiverCode = (account) => {
  if (account.employeeId) return String(account.employeeId);
  const digits = String(account._id).replace(/\D/g, '').slice(-5).padStart(5, '0');
  return `CG-${digits}`;
};

const mapInvoiceStatus = (invoice) => {
  if (invoice.status === 'Paid') return 'Paid';
  if (invoice.status === 'Void') return 'Void';
  if (invoice.status === 'Draft') return 'Upcoming';
  const due = String(invoice.periodTo || '').slice(0, 10);
  if (due && due < todayKey() && invoice.status === 'Sent') return 'Overdue';
  return 'Pending';
};

const formatVisit = (visit) => {
  const tz = visit.timezone || 'America/New_York';
  const status = visit.status === 'InProgress'
    ? 'In Progress'
    : (visit.status === 'Scheduled' ? 'Upcoming' : visit.status);
  return {
    id: String(visit._id),
    date: visit.scheduledDate,
    dateLabel: formatLongDate(visit.scheduledDate),
    month: monthShort(visit.scheduledDate),
    day: dayNum(visit.scheduledDate),
    weekday: weekdayShort(visit.scheduledDate),
    startTime: formatClock(visit.scheduledStartAt, tz),
    endTime: formatClock(visit.scheduledEndAt, tz),
    service: visit.serviceArea || 'Visit',
    clientName: visit.clientName || '—',
    caregiverName: visit.caregiverName || '—',
    address: visit.address || '',
    status,
    rawStatus: visit.status,
  };
};

const caregiverBase = (agencyId) => ({
  role: 'CAREGIVER',
  ...agencyFilter(agencyId),
});

const getStats = async (agencyId) => {
  const filter = caregiverBase(agencyId);
  const visitFilter = agencyFilter(agencyId);
  const today = todayKey();

  const [total, active, upcomingSchedules, invoiceIds] = await Promise.all([
    Model.AgencyAccountModel.countDocuments(filter),
    Model.AgencyAccountModel.countDocuments({ ...filter, status: 'Active' }),
    Model.VisitModel.countDocuments({
      ...visitFilter,
      scheduledDate: { $gte: today },
      status: { $in: ['Scheduled', 'InProgress', 'Late'] },
    }),
    Model.VisitModel.distinct('invoiceId', {
      ...visitFilter,
      invoiceId: { $ne: null },
    }),
  ]);

  const billedIds = (invoiceIds || []).filter(Boolean);
  const overdueInvoices = billedIds.length
    ? await Model.ClientInvoiceModel.countDocuments({
      _id: { $in: billedIds },
      status: 'Sent',
      periodTo: { $lt: today },
    })
    : 0;

  return { total, active, upcomingSchedules, overdueInvoices };
};

const getCaregivers = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 5));
  const search = String(query.search || '').trim();
  const status = String(query.status || 'All');
  const filter = caregiverBase(query.agencyId);

  if (status && status !== 'All') filter.status = status;
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
      .select('fullName email phone status agencyId profilePicPath employeeId candidateId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const caregiverIds = rows.map((row) => row._id);
  const agencyIds = [...new Set(rows.map((row) => String(row.agencyId)).filter(Boolean))];
  const candidateIds = rows.map((row) => row.candidateId).filter(Boolean);
  const now = new Date();

  const [agencies, candidates, nextVisits, associated] = await Promise.all([
    agencyIds.length
      ? Model.AgencyModel.find({ _id: { $in: agencyIds } }).select('name').lean()
      : [],
    candidateIds.length
      ? Model.CandidateModel.find({ _id: { $in: candidateIds } }).select('phone profilePicPath').lean()
      : [],
    caregiverIds.length
      ? Model.VisitModel.aggregate([
        {
          $match: {
            caregiverAccountId: { $in: caregiverIds },
            scheduledStartAt: { $gte: now },
            status: { $in: ['Scheduled', 'InProgress', 'Late'] },
          },
        },
        { $sort: { scheduledStartAt: 1 } },
        { $group: { _id: '$caregiverAccountId', visit: { $first: '$$ROOT' } } },
      ])
      : [],
    caregiverIds.length
      ? Model.VisitScheduleModel.aggregate([
        { $match: { caregiverAccountId: { $in: caregiverIds }, status: 'Active' } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { caregiverAccountId: '$caregiverAccountId', clientId: '$clientId' },
            clientName: { $first: '$clientName' },
          },
        },
        {
          $group: {
            _id: '$_id.caregiverAccountId',
            clients: { $push: { id: '$_id.clientId', name: '$clientName' } },
          },
        },
      ])
      : [],
  ]);

  const agencyMap = new Map(agencies.map((a) => [String(a._id), a.name]));
  const candidateMap = new Map(candidates.map((c) => [String(c._id), c]));
  const nextMap = new Map(nextVisits.map((row) => [String(row._id), row.visit]));
  const clientsMap = new Map(associated.map((row) => [String(row._id), row.clients || []]));

  const list = rows.map((row) => {
    const candidate = row.candidateId ? candidateMap.get(String(row.candidateId)) : null;
    const name = row.fullName || '';
    const next = nextMap.get(String(row._id));
    const clients = (clientsMap.get(String(row._id)) || [])
      .map((c) => ({ id: String(c.id || ''), name: c.name || '—' }))
      .filter((c) => c.id);
    const profilePic = row.profilePicPath
      ? buildUploadUrl(row.profilePicPath)
      : (candidate?.profilePicPath ? buildUploadUrl(candidate.profilePicPath) : '');

    return {
      id: String(row._id),
      name,
      initials: initials(name),
      caregiverCode: caregiverCode(row),
      agencyId: String(row.agencyId || ''),
      agencyName: agencyMap.get(String(row.agencyId)) || '—',
      phone: row.phone || candidate?.phone || '',
      email: row.email || '',
      status: row.status || 'Pending',
      profilePic,
      associatedClients: clients,
      nextSchedule: next
        ? {
          date: formatLongDate(next.scheduledDate),
          time: formatClock(next.scheduledStartAt, next.timezone),
          service: next.serviceArea || 'Visit',
          clientName: next.clientName || '—',
        }
        : null,
    };
  });

  return {
    list,
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

const getCaregiverDocuments = async (account, req) => {
  const appFilter = [{ caregiverAccountId: account._id }];
  if (account.candidateId) appFilter.push({ candidateId: account.candidateId });

  const applications = await Model.CandidateApplicationModel.find({ $or: appFilter }).select('_id').lean();
  const appIds = applications.map((a) => a._id);

  const [submissions, evvEnrollments, candidate] = await Promise.all([
    appIds.length
      ? Model.CandidateFormSubmissionModel.find({ applicationId: { $in: appIds } })
        .sort({ updatedAt: -1 })
        .lean()
      : [],
    Model.EvvEnrollmentModel.find({ caregiverAccountId: account._id }).sort({ updatedAt: -1 }).lean(),
    account.candidateId ? Model.CandidateModel.findById(account.candidateId).select('resumePath updatedAt').lean() : null,
  ]);

  const seen = new Set();
  const documents = [];

  submissions.forEach((row) => {
    const key = String(row.documentCode || row._id);
    if (seen.has(key)) return;
    seen.add(key);
    const submitted = row.status === 'Submitted';
    documents.push({
      key,
      name: row.documentName || row.documentCode || 'Document',
      uploadedOn: submitted ? formatLongDate(row.submittedAt || row.updatedAt) : '',
      status: submitted ? 'Verified' : 'Pending',
      url: row.filledPdfPath ? functions.buildUploadUrl(row.filledPdfPath, req) : '',
    });
  });

  if (candidate?.resumePath) {
    documents.unshift({
      key: 'resume',
      name: 'Resume',
      uploadedOn: formatLongDate(candidate.updatedAt || account.updatedAt),
      status: 'Verified',
      url: functions.buildUploadUrl(candidate.resumePath, req),
    });
  }

  evvEnrollments.forEach((row, idx) => {
    documents.push({
      key: `evv-${row._id || idx}`,
      name: row.serviceAreaKey ? `EVV Enrollment — ${serviceLabel(row.serviceAreaKey)}` : 'EVV Enrollment',
      uploadedOn: formatLongDate(row.verifiedAt || row.submittedAt || row.updatedAt),
      status: row.status === 'Verified' || row.verifiedAt ? 'Verified' : (row.status === 'Submitted' ? 'Verified' : 'Pending'),
      url: '',
    });
  });

  return documents;
};

const formatClientAddress = (client) => {
  if (!client) return '';
  return [client.streetAddress, client.aptSuite, client.city, client.state, client.zipCode]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
};

const getOverview = async (id, req) => {
  const account = await Model.AgencyAccountModel.findOne({ _id: id, role: 'CAREGIVER' }).lean();
  if (!account) throw new Error('Caregiver Not Found');

  const now = new Date();
  const agency = await Model.AgencyModel.findById(account.agencyId).select('name').lean();

  const [documents, upcomingRows, nextRow, scheduleRows] = await Promise.all([
    getCaregiverDocuments(account, req),
    Model.VisitModel.find({
      caregiverAccountId: account._id,
      scheduledStartAt: { $gte: now },
      status: { $in: ['Scheduled', 'InProgress', 'Late'] },
    }).sort({ scheduledStartAt: 1 }).limit(20).lean(),
    Model.VisitModel.findOne({
      caregiverAccountId: account._id,
      scheduledStartAt: { $gte: now },
      status: { $in: ['Scheduled', 'InProgress', 'Late'] },
    }).sort({ scheduledStartAt: 1 }).lean(),
    Model.VisitScheduleModel.find({
      caregiverAccountId: account._id,
      status: 'Active',
    }).sort({ createdAt: -1 }).lean(),
  ]);

  const clientIds = [...new Set(scheduleRows.map((row) => String(row.clientId)).filter(Boolean))];
  const clientOids = clientIds.map((value) => toOid(value)).filter(Boolean);

  const [clients, nextByClient, billedVisitIds] = await Promise.all([
    clientOids.length
      ? Model.ClientModel.find({ _id: { $in: clientOids } })
        .select('firstName lastName clientCode status streetAddress aptSuite city state zipCode')
        .lean()
      : [],
    clientOids.length
      ? Model.VisitModel.aggregate([
        {
          $match: {
            caregiverAccountId: account._id,
            clientId: { $in: clientOids },
            scheduledStartAt: { $gte: now },
            status: { $in: ['Scheduled', 'InProgress', 'Late'] },
          },
        },
        { $sort: { scheduledStartAt: 1 } },
        { $group: { _id: '$clientId', visit: { $first: '$$ROOT' } } },
      ])
      : [],
    Model.VisitModel.distinct('invoiceId', {
      caregiverAccountId: account._id,
      invoiceId: { $ne: null },
    }),
  ]);

  const clientMap = new Map(clients.map((c) => [String(c._id), c]));
  const nextClientMap = new Map(nextByClient.map((row) => [String(row._id), row.visit]));
  const seenClients = new Set();
  const associatedClients = [];

  scheduleRows.forEach((row) => {
    const key = String(row.clientId || '');
    if (!key || seenClients.has(key)) return;
    seenClients.add(key);
    const client = clientMap.get(key);
    const name = client ? clientFullName(client) : (row.clientName || '—');
    const next = nextClientMap.get(key);
    associatedClients.push({
      id: key,
      name,
      initials: initials(name),
      clientCode: client?.clientCode || '',
      status: client?.status || 'Active',
      nextVisit: next
        ? {
          date: formatLongDate(next.scheduledDate),
          time: formatClock(next.scheduledStartAt, next.timezone),
          service: next.serviceArea || 'Visit',
        }
        : null,
    });
  });

  const invoiceIds = (billedVisitIds || []).filter(Boolean);
  let invoices = [];
  if (invoiceIds.length) {
    invoices = await Model.ClientInvoiceModel.find({
      _id: { $in: invoiceIds },
      status: { $ne: 'Void' },
    }).sort({ createdAt: -1 }).limit(20).lean();
  } else if (account.fullName) {
    invoices = await Model.ClientInvoiceModel.find({
      agencyId: account.agencyId,
      status: { $ne: 'Void' },
      'lines.caregiverName': account.fullName,
    }).sort({ createdAt: -1 }).limit(20).lean();
  }

  const next = nextRow ? formatVisit(nextRow) : null;
  if (next && !next.address) {
    const client = nextRow?.clientId ? clientMap.get(String(nextRow.clientId)) : null;
    if (!client && nextRow?.clientId) {
      const fetched = await Model.ClientModel.findById(nextRow.clientId)
        .select('streetAddress aptSuite city state zipCode')
        .lean();
      next.address = formatClientAddress(fetched);
    } else {
      next.address = formatClientAddress(client);
    }
  }
  if (next && next.rawStatus === 'Scheduled') next.status = 'Confirmed';

  return {
    caregiver: {
      id: String(account._id),
      name: account.fullName || '',
      caregiverCode: caregiverCode(account),
      agencyName: agency?.name || '—',
      status: account.status || 'Pending',
    },
    clients: associatedClients,
    documents,
    upcoming: upcomingRows.map(formatVisit),
    next,
    invoices: invoices.map((inv) => ({
      id: String(inv._id),
      invoiceCode: inv.invoiceCode,
      date: formatLongDate(inv.periodTo || inv.createdAt),
      amount: Number(inv.total || 0),
      status: mapInvoiceStatus(inv),
    })),
  };
};

module.exports = {
  getStats,
  getCaregivers,
  getOverview,
};
