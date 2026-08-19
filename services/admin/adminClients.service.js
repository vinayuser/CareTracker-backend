const mongoose = require('mongoose');
const Model = require('../../models/index');
const functions = require('../../common/functions');
const { buildUploadUrl } = require('../../common/candidateHelpers');
const insuranceConstants = require('../../common/insuranceIntakeConstants');
const { DOC_KEYS } = require('../../middleware/insuranceIntakeUpload');

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
  .join('') || 'CL';

const fullName = (client) => `${client.firstName || ''} ${client.lastName || ''}`.trim();

const agencyFilter = (agencyId) => {
  const oid = toOid(agencyId);
  return oid ? { agencyId: oid } : {};
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
  const status = visit.status === 'InProgress' ? 'In Progress' : (visit.status === 'Scheduled' ? 'Upcoming' : visit.status);
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
    caregiverName: visit.caregiverName || '—',
    status,
    rawStatus: visit.status,
  };
};

const getStats = async (agencyId) => {
  const filter = agencyFilter(agencyId);
  const now = new Date();
  const today = todayKey(now);

  const [total, active, upcomingSchedules, overdueInvoices] = await Promise.all([
    Model.ClientModel.countDocuments(filter),
    Model.ClientModel.countDocuments({ ...filter, status: 'Active' }),
    Model.VisitModel.countDocuments({
      ...filter,
      scheduledDate: { $gte: today },
      status: { $in: ['Scheduled', 'InProgress', 'Late'] },
    }),
    Model.ClientInvoiceModel.countDocuments({
      ...filter,
      status: 'Sent',
      periodTo: { $lt: today },
    }),
  ]);

  return { total, active, upcomingSchedules, overdueInvoices };
};

const getClients = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 5));
  const search = String(query.search || '').trim();
  const status = String(query.status || 'All');
  const filter = agencyFilter(query.agencyId);

  if (status && status !== 'All') filter.status = status;
  if (search) {
    const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { firstName: regex },
      { lastName: regex },
      { preferredName: regex },
      { clientCode: regex },
      { phone: regex },
      { email: regex },
    ];
  }

  const [total, rows] = await Promise.all([
    Model.ClientModel.countDocuments(filter),
    Model.ClientModel.find(filter)
      .select('firstName lastName preferredName clientCode phone status agencyId profilePicPath')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const clientIds = rows.map((row) => row._id);
  const agencyIds = [...new Set(rows.map((row) => String(row.agencyId)).filter(Boolean))];
  const now = new Date();

  const [agencies, nextVisits, primaryCaregivers] = await Promise.all([
    agencyIds.length
      ? Model.AgencyModel.find({ _id: { $in: agencyIds } }).select('name').lean()
      : [],
    clientIds.length
      ? Model.VisitModel.aggregate([
        {
          $match: {
            clientId: { $in: clientIds },
            scheduledStartAt: { $gte: now },
            status: { $in: ['Scheduled', 'InProgress', 'Late'] },
          },
        },
        { $sort: { scheduledStartAt: 1 } },
        { $group: { _id: '$clientId', visit: { $first: '$$ROOT' } } },
      ])
      : [],
    clientIds.length
      ? Model.VisitScheduleModel.aggregate([
        { $match: { clientId: { $in: clientIds }, status: 'Active' } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$clientId',
            caregiverName: { $first: '$caregiverName' },
            caregiverAccountId: { $first: '$caregiverAccountId' },
          },
        },
      ])
      : [],
  ]);

  const agencyMap = new Map(agencies.map((a) => [String(a._id), a.name]));
  const nextMap = new Map(nextVisits.map((row) => [String(row._id), row.visit]));
  const caregiverMap = new Map(primaryCaregivers.map((row) => [String(row._id), row]));

  const list = rows.map((row) => {
    const name = fullName(row);
    const next = nextMap.get(String(row._id));
    const caregiver = caregiverMap.get(String(row._id));
    return {
      id: String(row._id),
      name,
      initials: initials(name),
      clientCode: row.clientCode || '',
      agencyId: String(row.agencyId || ''),
      agencyName: agencyMap.get(String(row.agencyId)) || '—',
      phone: row.phone || '',
      status: row.status || 'Pending',
      profilePic: row.profilePicPath ? buildUploadUrl(row.profilePicPath) : '',
      primaryCaregiver: caregiver?.caregiverName || '—',
      nextSchedule: next
        ? {
          date: formatLongDate(next.scheduledDate),
          time: formatClock(next.scheduledStartAt, next.timezone),
          service: next.serviceArea || 'Visit',
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

const getClientDocuments = async (client, req) => {
  const filter = { agencyId: client.agencyId, clientId: client._id };
  const [assessment, carePlan, insuranceIntake, evvEnrollment] = await Promise.all([
    Model.ClientAssessmentModel.findOne(filter).sort({ updatedAt: -1 }).lean(),
    Model.CarePlanModel.findOne(filter).sort({ updatedAt: -1 }).lean(),
    Model.ClientInsuranceIntakeModel.findOne(filter).sort({ updatedAt: -1 }).lean(),
    Model.EvvEnrollmentModel.findOne(filter).sort({ updatedAt: -1 }).lean(),
  ]);

  const uploaded = [];
  if (insuranceIntake?.formData?.requiredDocuments) {
    const docs = insuranceIntake.formData.requiredDocuments;
    DOC_KEYS.forEach((key) => {
      const entry = docs[key];
      const filePath = String(entry?.path || '').trim();
      if (!filePath) return;
      uploaded.push({
        key,
        name: insuranceConstants.REQUIRED_DOCUMENTS.find((d) => d.key === key)?.label || key,
        uploadedOn: functions.toClientDoc(insuranceIntake)?.updatedAt || insuranceIntake.updatedAt,
        status: 'Verified',
        url: functions.buildUploadUrl(filePath, req),
      });
    });
  }

  const derived = [
    {
      key: 'photoId',
      name: 'ID Proof',
      uploadedOn: uploaded.find((d) => d.key === 'photoId')?.uploadedOn || null,
      status: uploaded.some((d) => d.key === 'photoId') ? 'Verified' : 'Pending',
      url: uploaded.find((d) => d.key === 'photoId')?.url || '',
    },
    {
      key: 'insuranceCard',
      name: 'Insurance Card',
      uploadedOn: uploaded.find((d) => d.key === 'insuranceCard')?.uploadedOn || null,
      status: uploaded.some((d) => d.key === 'insuranceCard') ? 'Verified' : 'Pending',
      url: uploaded.find((d) => d.key === 'insuranceCard')?.url || '',
    },
    {
      key: 'physicianOrder',
      name: 'Physician Order',
      uploadedOn: assessment?.updatedAt || null,
      status: assessment ? 'Verified' : 'Pending',
      url: '',
    },
    {
      key: 'consent',
      name: 'Consent Form',
      uploadedOn: client.authorizationDate || client.updatedAt,
      status: client.authorizationSignature ? 'Verified' : 'Pending',
      url: '',
    },
    {
      key: 'carePlan',
      name: 'Care Plan',
      uploadedOn: carePlan?.updatedAt || null,
      status: carePlan ? 'Verified' : 'Pending',
      url: '',
    },
  ];

  if (evvEnrollment && !derived.some((d) => d.key === 'evv')) {
    derived.push({
      key: 'evv',
      name: 'EVV Enrollment',
      uploadedOn: evvEnrollment.updatedAt,
      status: 'Verified',
      url: '',
    });
  }

  return derived.slice(0, 5).map((doc) => ({
    ...doc,
    uploadedOn: doc.uploadedOn ? formatLongDate(doc.uploadedOn) : '',
  }));
};

const getOverview = async (id, req) => {
  const client = await Model.ClientModel.findById(id).lean();
  if (!client) throw new Error('Client Not Found');

  const now = new Date();
  const today = todayKey(now);
  const agency = await Model.AgencyModel.findById(client.agencyId).select('name').lean();

  const [documents, upcomingRows, currentRow, scheduleCaregivers, invoices] = await Promise.all([
    getClientDocuments(client, req),
    Model.VisitModel.find({
      clientId: client._id,
      scheduledStartAt: { $gte: now },
      status: { $in: ['Scheduled', 'InProgress', 'Late'] },
    }).sort({ scheduledStartAt: 1 }).limit(4).lean(),
    Model.VisitModel.findOne({
      clientId: client._id,
      scheduledDate: today,
      status: { $in: ['InProgress', 'Scheduled', 'Late'] },
    }).sort({ status: 1, scheduledStartAt: 1 }).lean(),
    Model.VisitScheduleModel.find({
      clientId: client._id,
      status: 'Active',
    }).sort({ createdAt: -1 }).lean(),
    Model.ClientInvoiceModel.find({
      clientId: client._id,
      status: { $ne: 'Void' },
    }).sort({ createdAt: -1 }).limit(4).lean(),
  ]);

  const caregiverIds = [...new Set(scheduleCaregivers.map((s) => String(s.caregiverAccountId)).filter(Boolean))];
  const accounts = caregiverIds.length
    ? await Model.AgencyAccountModel.find({ _id: { $in: caregiverIds } })
      .select('fullName email phone profilePicPath')
      .lean()
    : [];
  const accountMap = new Map(accounts.map((a) => [String(a._id), a]));
  const primaryId = scheduleCaregivers[0] ? String(scheduleCaregivers[0].caregiverAccountId) : '';

  const seen = new Set();
  const caregivers = [];
  scheduleCaregivers.forEach((row) => {
    const key = String(row.caregiverAccountId || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    const account = accountMap.get(key);
    const name = account?.fullName || row.caregiverName || '—';
    caregivers.push({
      id: key,
      name,
      initials: initials(name),
      phone: account?.phone || '',
      email: account?.email || '',
      profilePic: account?.profilePicPath ? buildUploadUrl(account.profilePicPath) : '',
      isPrimary: key === primaryId,
    });
  });

  const inProgress = await Model.VisitModel.findOne({
    clientId: client._id,
    status: 'InProgress',
  }).sort({ scheduledStartAt: -1 }).lean();

  const current = inProgress || currentRow;

  return {
    client: {
      id: String(client._id),
      name: fullName(client),
      clientCode: client.clientCode || '',
      agencyName: agency?.name || '—',
      status: client.status || 'Pending',
    },
    documents,
    upcoming: upcomingRows.map(formatVisit),
    current: current ? formatVisit(current) : null,
    caregivers: caregivers.slice(0, 4),
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
  getClients,
  getOverview,
};
