const mongoose = require('mongoose');
const Model = require('../../models/index');
const { notArchivedFilter } = require('../../common/agencyVisibility');

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
};

const dateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDateKey = (value) => {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

const currentWeekRange = () => {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: dateKey(monday), to: dateKey(sunday) };
};

const eachDate = (from, to) => {
  const start = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const days = [];
  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 62) {
    const key = dateKey(cursor);
    days.push({
      key,
      weekday: cursor.toLocaleDateString('en-US', { weekday: 'long' }),
      dateLabel: cursor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    });
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return days;
};

const formatClock12 = (value, timeZone = 'America/New_York') => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
};

const formatClock24 = (value, timeZone = 'America/New_York') => {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone || 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
};

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const visitHours = (visit) => {
  const minutes = Number(visit.billableMinutes || 0);
  if (minutes > 0) return minutes / 60;
  const seconds = Number(visit.billableSeconds || 0);
  if (seconds > 0) return seconds / 3600;
  if (visit.checkInAt && visit.checkOutAt) {
    const ms = new Date(visit.checkOutAt).getTime() - new Date(visit.checkInAt).getTime();
    if (ms > 0) return ms / 3600000;
  }
  return 0;
};

const visitRate = (visit, rateMap = {}) => {
  const snapshot = Number(visit.hourlyRateSnapshot);
  if (snapshot > 0) return snapshot;
  return Number(rateMap[String(visit.carePlanId || '')] || 0);
};

const visitPay = (visit, hours, rateMap = {}) => {
  const snapshot = Number(visit.amountSnapshot);
  if (snapshot > 0) return snapshot;
  return hours * visitRate(visit, rateMap);
};

const caregiverCode = (account) => {
  if (account?.employeeId) return String(account.employeeId);
  const tail = String(account?._id || '').replace(/[^a-f0-9]/gi, '').slice(-4);
  const num = String(parseInt(tail || '0', 16) % 10000).padStart(4, '0');
  return `CG${num}`;
};

const locationLabel = (candidate, address) => {
  const place = [candidate?.location, candidate?.country].map((p) => String(p || '').trim()).filter(Boolean);
  if (place.length) return place.join(', ');
  const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3 && /^\d/.test(parts[parts.length - 1])) {
    return `${parts[parts.length - 3]}, ${parts[parts.length - 2]}`;
  }
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return parts[0] || '—';
};

const initials = (name = '') => String(name)
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase() || '')
  .join('') || 'CG';

const resolveRange = (query = {}) => {
  const fallback = currentWeekRange();
  let from = parseDateKey(query.from) || fallback.from;
  let to = parseDateKey(query.to) || fallback.to;
  if (from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  return { from, to };
};

const loadAgencies = async () => {
  const agencies = await Model.AgencyModel.find(notArchivedFilter()).select('_id name').sort({ name: 1 }).lean();
  return agencies.map((agency) => ({ id: String(agency._id), name: agency.name || 'Agency' }));
};

const visitScope = async (query) => {
  const { from, to } = resolveRange(query);
  const agencies = await loadAgencies();
  const agencyMap = Object.fromEntries(agencies.map((agency) => [agency.id, agency.name]));
  const selectedId = toOid(query.agencyId);
  let agencyIds = agencies.map((agency) => new mongoose.Types.ObjectId(agency.id));
  if (selectedId) {
    agencyIds = agencyMap[String(selectedId)] ? [selectedId] : [];
  }
  const caregiverId = toOid(query.caregiverAccountId);
  const match = agencyIds.length
    ? {
      agencyId: { $in: agencyIds },
      scheduledDate: { $gte: from, $lte: to },
      status: { $nin: ['Cancelled'] },
      ...(caregiverId ? { caregiverAccountId: caregiverId } : {}),
    }
    : null;
  return {
    from,
    to,
    days: eachDate(from, to),
    agencies,
    agencyName: selectedId ? (agencyMap[String(selectedId)] || 'Agency') : 'All Agencies',
    agencyMap,
    match,
  };
};

const VISIT_FIELDS = 'agencyId carePlanId caregiverAccountId caregiverName address timezone scheduledDate scheduledStartAt scheduledEndAt checkInAt checkOutAt billableMinutes billableSeconds hourlyRateSnapshot amountSnapshot status clientName visitCode serviceArea';

const loadVisits = async (query, extraMatch = {}) => {
  const scope = await visitScope(query);
  const visits = scope.match
    ? await Model.VisitModel.find({ ...scope.match, ...extraMatch }).select(VISIT_FIELDS).lean()
    : [];
  return { ...scope, visits };
};

const pageParams = (query = {}) => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 10)),
});

const caregiverPage = async (match, page, limit) => {
  const skip = (page - 1) * limit;
  const [facet] = await Model.VisitModel.aggregate([
    { $match: match },
    { $group: { _id: '$caregiverAccountId', caregiverName: { $first: '$caregiverName' } } },
    {
      $lookup: {
        from: Model.AgencyAccountModel.collection.name,
        localField: '_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    {
      $addFields: {
        sortName: {
          $toLower: {
            $ifNull: [
              { $arrayElemAt: ['$account.fullName', 0] },
              { $ifNull: ['$caregiverName', ''] },
            ],
          },
        },
      },
    },
    { $sort: { sortName: 1, _id: 1 } },
    {
      $facet: {
        meta: [{ $count: 'total' }],
        page: [
          { $skip: skip },
          { $limit: limit },
          { $project: { _id: 1 } },
        ],
      },
    },
  ]);
  const total = facet?.meta?.[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = total ? Math.min(page, totalPages) : 1;
  if (!total || safePage === page) {
    return { total, totalPages, page: safePage, ids: (facet?.page || []).map((row) => row._id) };
  }
  return caregiverPage(match, safePage, limit);
};

const summaryTotals = async (match, agencyName) => {
  const empty = { totalCaregivers: 0, totalHours: 0, totalPay: 0, agencyName };
  if (!match) return empty;
  const clockHours = {
    $cond: [
      { $and: [{ $ne: ['$checkInAt', null] }, { $ne: ['$checkOutAt', null] }] },
      { $max: [0, { $divide: [{ $subtract: ['$checkOutAt', '$checkInAt'] }, 3600000] }] },
      0,
    ],
  };
  const hoursExpr = {
    $cond: [
      { $gt: [{ $ifNull: ['$billableMinutes', 0] }, 0] },
      { $divide: ['$billableMinutes', 60] },
      {
        $cond: [
          { $gt: [{ $ifNull: ['$billableSeconds', 0] }, 0] },
          { $divide: ['$billableSeconds', 3600] },
          clockHours,
        ],
      },
    ],
  };
  const [totals] = await Model.VisitModel.aggregate([
    { $match: match },
    {
      $lookup: {
        from: Model.CarePlanModel.collection.name,
        localField: 'carePlanId',
        foreignField: '_id',
        as: 'plan',
      },
    },
    {
      $addFields: {
        hours: hoursExpr,
        rate: {
          $cond: [
            { $gt: [{ $ifNull: ['$hourlyRateSnapshot', 0] }, 0] },
            '$hourlyRateSnapshot',
            { $ifNull: [{ $arrayElemAt: ['$plan.hourlyRate', 0] }, 0] },
          ],
        },
      },
    },
    {
      $addFields: {
        pay: {
          $cond: [
            { $gt: [{ $ifNull: ['$amountSnapshot', 0] }, 0] },
            '$amountSnapshot',
            { $multiply: ['$hours', '$rate'] },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        caregivers: { $addToSet: '$caregiverAccountId' },
        totalHours: { $sum: '$hours' },
        totalPay: { $sum: '$pay' },
      },
    },
  ]);
  return {
    totalCaregivers: totals?.caregivers?.length || 0,
    totalHours: round2(totals?.totalHours || 0),
    totalPay: round2(totals?.totalPay || 0),
    agencyName,
  };
};

const loadRateMap = async (visits) => {
  const planIds = [...new Set(visits.map((visit) => String(visit.carePlanId || '')).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  if (!planIds.length) return {};
  const plans = await Model.CarePlanModel.find({ _id: { $in: planIds } }).select('hourlyRate').lean();
  return Object.fromEntries(plans.map((plan) => [String(plan._id), Number(plan.hourlyRate || 0)]));
};

const buildRows = async (loaded) => {
  const { visits, days, agencyMap } = loaded;
  const rateMap = await loadRateMap(visits);
  const byCaregiver = new Map();
  visits.forEach((visit) => {
    const id = String(visit.caregiverAccountId || '');
    if (!id) return;
    if (!byCaregiver.has(id)) byCaregiver.set(id, []);
    byCaregiver.get(id).push(visit);
  });

  const accountIds = [...byCaregiver.keys()].filter((id) => mongoose.Types.ObjectId.isValid(id));
  const accounts = accountIds.length
    ? await Model.AgencyAccountModel.find({ _id: { $in: accountIds } })
      .select('fullName employeeId candidateId agencyId')
      .lean()
    : [];
  const accountMap = Object.fromEntries(accounts.map((account) => [String(account._id), account]));
  const candidateIds = accounts.map((account) => account.candidateId).filter(Boolean);
  const candidates = candidateIds.length
    ? await Model.CandidateModel.find({ _id: { $in: candidateIds } }).select('location country').lean()
    : [];
  const candidateMap = Object.fromEntries(candidates.map((candidate) => [String(candidate._id), candidate]));

  const dayKeys = days.map((day) => day.key);
  const rows = [...byCaregiver.entries()].map(([id, caregiverVisits]) => {
    const account = accountMap[id] || {};
    const candidate = candidateMap[String(account.candidateId || '')] || null;
    const name = account.fullName || caregiverVisits[0]?.caregiverName || 'Caregiver';
    const address = caregiverVisits.find((visit) => visit.address)?.address || '';
    const dayMap = Object.fromEntries(dayKeys.map((key) => [key, { in: '', out: '', hours: 0, amount: 0 }]));
    const shiftCounts = new Map();
    let totalHours = 0;
    let totalAmount = 0;
    let firstIn = null;
    let lastOut = null;

    caregiverVisits.forEach((visit) => {
      const tz = visit.timezone || 'America/New_York';
      const hours = visitHours(visit);
      const amount = visitPay(visit, hours, rateMap);
      totalHours += hours;
      totalAmount += amount;
      const start = formatClock12(visit.scheduledStartAt, tz);
      const end = formatClock12(visit.scheduledEndAt, tz);
      if (start && end) {
        const label = `${start}|${end}`;
        shiftCounts.set(label, (shiftCounts.get(label) || 0) + 1);
      }
      if (visit.checkInAt && (!firstIn || new Date(visit.checkInAt) < new Date(firstIn.at))) {
        firstIn = { at: visit.checkInAt, tz };
      }
      if (visit.checkOutAt && (!lastOut || new Date(visit.checkOutAt) > new Date(lastOut.at))) {
        lastOut = { at: visit.checkOutAt, tz };
      }
      const slot = dayMap[visit.scheduledDate];
      if (!slot) return;
      const clockIn = formatClock24(visit.checkInAt, tz);
      const clockOut = formatClock24(visit.checkOutAt, tz);
      if (clockIn && (!slot.in || clockIn < slot.in)) slot.in = clockIn;
      if (clockOut && (!slot.out || clockOut > slot.out)) slot.out = clockOut;
      slot.hours = round2(slot.hours + hours);
      slot.amount = round2(slot.amount + amount);
    });

    let shiftIn = '';
    let shiftOut = '';
    let best = 0;
    shiftCounts.forEach((count, label) => {
      if (count > best) {
        best = count;
        [shiftIn, shiftOut] = label.split('|');
      }
    });
    if (!shiftIn && firstIn) shiftIn = formatClock12(firstIn.at, firstIn.tz);
    if (!shiftOut && lastOut) shiftOut = formatClock12(lastOut.at, lastOut.tz);

    const agencyId = String(account.agencyId || caregiverVisits[0]?.agencyId || '');
    return {
      id,
      caregiverName: name,
      caregiverCode: caregiverCode(account._id ? account : { _id: id, employeeId: '' }),
      initials: initials(name),
      location: locationLabel(candidate, address),
      agencyId,
      agencyName: agencyMap[agencyId] || '',
      shiftIn,
      shiftOut,
      days: dayMap,
      totalHours: round2(totalHours),
      totalAmount: round2(totalAmount),
      visitCount: caregiverVisits.length,
    };
  });

  rows.sort((a, b) => a.caregiverName.localeCompare(b.caregiverName));
  return rows;
};

const getOptions = async () => ({ agencies: await loadAgencies() });

const getList = async (query = {}) => {
  const scope = await visitScope(query);
  const { page, limit } = pageParams(query);
  if (!scope.match) {
    return {
      from: scope.from,
      to: scope.to,
      days: scope.days,
      agencies: scope.agencies,
      summary: { totalCaregivers: 0, totalHours: 0, totalPay: 0, agencyName: scope.agencyName },
      items: [],
      pagination: { page: 1, limit, total: 0, totalPages: 1, from: 0, to: 0 },
    };
  }

  const [paged, summary] = await Promise.all([
    caregiverPage(scope.match, page, limit),
    summaryTotals(scope.match, scope.agencyName),
  ]);
  const visits = paged.ids.length
    ? await Model.VisitModel.find({
      ...scope.match,
      caregiverAccountId: { $in: paged.ids },
    }).select(VISIT_FIELDS).lean()
    : [];
  const rows = await buildRows({ ...scope, visits });
  const order = new Map(paged.ids.map((id, index) => [String(id), index]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  const start = paged.total ? ((paged.page - 1) * limit) + 1 : 0;

  return {
    from: scope.from,
    to: scope.to,
    days: scope.days,
    agencies: scope.agencies,
    summary: { ...summary, totalCaregivers: paged.total },
    items: rows,
    pagination: {
      page: paged.page,
      limit,
      total: paged.total,
      totalPages: paged.totalPages,
      from: start,
      to: paged.total ? start + rows.length - 1 : 0,
    },
  };
};

const getDetail = async (caregiverId, query = {}) => {
  const id = toOid(caregiverId);
  if (!id) {
    const error = new Error('Caregiver not found');
    error.statusCode = 404;
    throw error;
  }
  const loaded = await loadVisits({ ...query, caregiverAccountId: String(id) });
  const rows = await buildRows(loaded);
  const row = rows.find((item) => item.id === String(id));
  if (!row) {
    const error = new Error('No time card for this caregiver in the selected range');
    error.statusCode = 404;
    throw error;
  }
  const rateMap = await loadRateMap(loaded.visits);
  const visits = loaded.visits
    .filter((visit) => String(visit.caregiverAccountId) === String(id))
    .sort((a, b) => String(a.scheduledDate).localeCompare(String(b.scheduledDate))
      || new Date(a.scheduledStartAt) - new Date(b.scheduledStartAt))
    .map((visit) => {
      const tz = visit.timezone || 'America/New_York';
      const hours = round2(visitHours(visit));
      return {
        id: String(visit._id),
        visitCode: visit.visitCode || '',
        date: visit.scheduledDate,
        clientName: visit.clientName || '—',
        service: visit.serviceArea || 'Visit',
        status: visit.status || '',
        scheduledIn: formatClock12(visit.scheduledStartAt, tz),
        scheduledOut: formatClock12(visit.scheduledEndAt, tz),
        clockIn: formatClock12(visit.checkInAt, tz),
        clockOut: formatClock12(visit.checkOutAt, tz),
        hourlyRate: visitRate(visit, rateMap),
        hours,
        amount: round2(visitPay(visit, hours, rateMap)),
        address: visit.address || '',
      };
    });

  return { ...row, from: loaded.from, to: loaded.to, visits };
};

const csvCell = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const exportCsv = async (query = {}) => {
  const loaded = await loadVisits(query);
  const rows = await buildRows(loaded);
  const headers = [
    'Caregiver',
    'ID',
    'Location',
    'Agency',
    'In',
    'Out',
    ...loaded.days.flatMap((day) => [`${day.weekday} ${day.dateLabel} In`, `${day.weekday} ${day.dateLabel} Out`]),
    'Total Hours',
    'Total Amount',
  ];
  const lines = rows.map((row) => [
    row.caregiverName,
    row.caregiverCode,
    row.location,
    row.agencyName,
    row.shiftIn,
    row.shiftOut,
    ...loaded.days.flatMap((day) => {
      const slot = row.days[day.key] || {};
      return [slot.in || '', slot.out || ''];
    }),
    row.totalHours.toFixed(2),
    row.totalAmount.toFixed(2),
  ]);
  const csv = `\uFEFF${[headers, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')}`;
  return { filename: `time-card-${loaded.from}-to-${loaded.to}.csv`, csv };
};

module.exports = {
  getOptions,
  getList,
  getDetail,
  exportCsv,
};
