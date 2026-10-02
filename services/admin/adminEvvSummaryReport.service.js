const mongoose = require('mongoose');
const Model = require('../../models/index');
const { notArchivedFilter } = require('../../common/agencyVisibility');

const STATUS_META = [
  { key: 'caregiver_only', label: 'Create Caregiver Only', summaryKey: 'caregiverOnly' },
  { key: 'no_schedule', label: 'No Schedule', summaryKey: 'noSchedule' },
  { key: 'schedule_no_evv', label: 'Caregiver + Schedule (No EVV Form)', summaryKey: 'scheduleNoEvv' },
  { key: 'evv_client_pending', label: 'Caregiver + Schedule + EVV (Client Pending)', summaryKey: 'evvClientPending' },
  { key: 'evv_agency_pending', label: 'Caregiver + Schedule + EVV (Client Approved / Agency Pending)', summaryKey: 'evvAgencyPending' },
  { key: 'evv_approved', label: 'Caregiver + Schedule + EVV (Approved)', summaryKey: 'evvApproved' },
];

const STATUS_KEYS = new Set(STATUS_META.map((item) => item.key));

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
};

const parseDateKey = (value) => {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
};

const startOfDay = (key) => new Date(`${key}T00:00:00.000Z`);
const endOfDay = (key) => new Date(`${key}T23:59:59.999Z`);

const pageParams = (query = {}) => ({
  page: Math.max(1, Number(query.page) || 1),
  limit: Math.min(100, Math.max(1, Number(query.limit) || 5)),
});

const loadAgencyScope = async (query = {}) => {
  const requested = String(query.agencyIds || query.agencyId || '')
    .split(',')
    .map((id) => toOid(id.trim()))
    .filter(Boolean);
  const agencies = await Model.AgencyModel.find(notArchivedFilter()).select('_id name').sort({ name: 1 }).lean();
  const allowed = new Set(agencies.map((agency) => String(agency._id)));
  const selected = requested.filter((id) => allowed.has(String(id)));
  const scoped = selected.length
    ? agencies.filter((agency) => selected.some((id) => String(id) === String(agency._id)))
    : agencies;
  return { agencies, scoped };
};

const sourceProject = (extra) => ({
  agencyId: 1,
  clientId: { $ifNull: ['$clientId', null] },
  caregiverAccountId: 1,
  scheduleCount: { $literal: 0 },
  evvCount: { $literal: 0 },
  clientSigned: { $literal: 0 },
  agencyApproved: { $literal: 0 },
  agencyPending: { $literal: 0 },
  agencyRejected: { $literal: 0 },
  at: '$createdAt',
  ...extra,
});

const buildPipeline = ({ agencyIds, clientId, from, to, status, skip, limit }) => {
  const agencyMatch = { agencyId: { $in: agencyIds } };
  const clientMatch = clientId ? { clientId } : {};

  const schedulePipeline = [
    { $match: { ...agencyMatch, ...clientMatch } },
    {
      $group: {
        _id: { agencyId: '$agencyId', clientId: '$clientId', caregiverAccountId: '$caregiverAccountId' },
        scheduleCount: { $sum: 1 },
        at: { $max: '$createdAt' },
      },
    },
    {
      $project: sourceProject({
        agencyId: '$_id.agencyId',
        clientId: '$_id.clientId',
        caregiverAccountId: '$_id.caregiverAccountId',
        scheduleCount: 1,
        at: 1,
      }),
    },
  ];

  const enrollmentPipeline = [
    { $match: { ...agencyMatch, ...clientMatch } },
    {
      $project: sourceProject({
        evvCount: { $literal: 1 },
        clientSigned: {
          $cond: [
            {
              $regexMatch: {
                input: { $ifNull: ['$formData.authorization.clientSignature', ''] },
                regex: '^(data:image|/|http)',
              },
            },
            1,
            0,
          ],
        },
        agencyApproved: { $cond: [{ $eq: ['$status', 'Verified'] }, 1, 0] },
        agencyPending: { $cond: [{ $in: ['$status', ['Pending', 'Submitted']] }, 1, 0] },
        agencyRejected: { $cond: [{ $eq: ['$status', 'Rejected'] }, 1, 0] },
        at: { $ifNull: ['$updatedAt', '$createdAt'] },
      }),
    },
  ];

  const carePlanPipeline = [
    { $match: { ...agencyMatch, ...(clientId ? { clientId } : { clientId: { $ne: null } }) } },
    { $unwind: '$formData.careNeeds' },
    { $match: { 'formData.careNeeds.responsibleStaffId': { $nin: [null, ''] } } },
    {
      $project: sourceProject({
        caregiverAccountId: {
          $convert: {
            input: '$formData.careNeeds.responsibleStaffId',
            to: 'objectId',
            onError: null,
            onNull: null,
          },
        },
        at: { $ifNull: ['$updatedAt', '$createdAt'] },
      }),
    },
    { $match: { caregiverAccountId: { $ne: null } } },
  ];

  const dateExpr = [];
  if (from) dateExpr.push({ $gte: ['$maxAt', startOfDay(from)] });
  if (to) dateExpr.push({ $lte: ['$minAt', endOfDay(to)] });

  const statusMatch = STATUS_KEYS.has(status) ? [{ $match: { status } }] : [];

  return [
    { $match: { role: 'CAREGIVER', ...agencyMatch } },
    {
      $project: sourceProject({
        clientId: { $literal: null },
        caregiverAccountId: '$_id',
      }),
    },
    { $unionWith: { coll: Model.VisitScheduleModel.collection.name, pipeline: schedulePipeline } },
    { $unionWith: { coll: Model.EvvEnrollmentModel.collection.name, pipeline: enrollmentPipeline } },
    { $unionWith: { coll: Model.CarePlanModel.collection.name, pipeline: carePlanPipeline } },
    { $match: { caregiverAccountId: { $ne: null } } },
    {
      $group: {
        _id: {
          agencyId: '$agencyId',
          clientId: '$clientId',
          caregiverAccountId: '$caregiverAccountId',
        },
        scheduleCount: { $sum: '$scheduleCount' },
        evvCount: { $sum: '$evvCount' },
        clientSigned: { $max: '$clientSigned' },
        agencyApproved: { $max: '$agencyApproved' },
        agencyPending: { $max: '$agencyPending' },
        agencyRejected: { $max: '$agencyRejected' },
        minAt: { $min: '$at' },
        maxAt: { $max: '$at' },
      },
    },
    { $addFields: { hasClient: { $cond: [{ $ifNull: ['$_id.clientId', false] }, 1, 0] } } },
    {
      $group: {
        _id: {
          agencyId: '$_id.agencyId',
          caregiverAccountId: '$_id.caregiverAccountId',
        },
        anyClient: { $max: '$hasClient' },
        docs: { $push: '$$ROOT' },
      },
    },
    { $unwind: '$docs' },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$docs.hasClient', 1] },
            { $eq: ['$anyClient', 0] },
          ],
        },
      },
    },
    { $replaceRoot: { newRoot: '$docs' } },
    ...(clientId ? [{ $match: { '_id.clientId': clientId } }] : []),
    ...(dateExpr.length ? [{ $match: { $expr: { $and: dateExpr } } }] : []),
    {
      $lookup: {
        from: Model.AgencyModel.collection.name,
        localField: '_id.agencyId',
        foreignField: '_id',
        as: 'agency',
      },
    },
    {
      $lookup: {
        from: Model.ClientModel.collection.name,
        localField: '_id.clientId',
        foreignField: '_id',
        as: 'client',
      },
    },
    {
      $lookup: {
        from: Model.AgencyAccountModel.collection.name,
        localField: '_id.caregiverAccountId',
        foreignField: '_id',
        as: 'caregiver',
      },
    },
    {
      $addFields: {
        agencyName: { $ifNull: [{ $arrayElemAt: ['$agency.name', 0] }, '—'] },
        clientName: {
          $let: {
            vars: {
              full: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: [{ $arrayElemAt: ['$client.firstName', 0] }, ''] },
                      ' ',
                      { $ifNull: [{ $arrayElemAt: ['$client.lastName', 0] }, ''] },
                    ],
                  },
                },
              },
            },
            in: { $cond: [{ $eq: ['$$full', ''] }, '—', '$$full'] },
          },
        },
        caregiverName: { $ifNull: [{ $arrayElemAt: ['$caregiver.fullName', 0] }, '—'] },
        caregiverCreated: { $gt: [{ $size: '$caregiver' }, 0] },
        hasSchedule: { $gt: ['$scheduleCount', 0] },
        hasEvv: { $gt: ['$evvCount', 0] },
      },
    },
    {
      $addFields: {
        status: {
          $switch: {
            branches: [
              { case: { $eq: ['$hasClient', 0] }, then: 'caregiver_only' },
              { case: { $and: ['$hasEvv', { $eq: ['$clientSigned', 0] }] }, then: 'evv_client_pending' },
              { case: { $and: ['$hasEvv', { $eq: ['$agencyApproved', 0] }] }, then: 'evv_agency_pending' },
              { case: '$hasEvv', then: 'evv_approved' },
              { case: { $eq: ['$hasSchedule', false] }, then: 'no_schedule' },
            ],
            default: 'schedule_no_evv',
          },
        },
      },
    },
    {
      $facet: {
        stats: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        meta: [...statusMatch, { $count: 'total' }],
        items: [
          ...statusMatch,
          { $sort: { agencyName: 1, clientName: 1, caregiverName: 1 } },
          { $skip: skip },
          { $limit: limit },
        ],
      },
    },
  ];
};

const yesNo = (value) => (value ? 'Yes' : 'No');

const mapItem = (doc) => {
  const status = STATUS_META.find((item) => item.key === doc.status) || STATUS_META[0];
  const hasEvv = Boolean(doc.hasEvv);
  const clientSigned = Number(doc.clientSigned) > 0;
  let clientEvvStatus = '—';
  let agencyEvvStatus = '—';
  if (hasEvv && !clientSigned) clientEvvStatus = 'Client Pending';
  if (hasEvv && clientSigned) {
    clientEvvStatus = 'Approved';
    if (Number(doc.agencyApproved) > 0) agencyEvvStatus = 'Approved';
    else if (Number(doc.agencyRejected) > 0 && Number(doc.agencyPending) === 0) agencyEvvStatus = 'Rejected';
    else agencyEvvStatus = 'Pending';
  }
  const agencyId = String(doc._id?.agencyId || '');
  const clientId = doc._id?.clientId ? String(doc._id.clientId) : '';
  const caregiverId = String(doc._id?.caregiverAccountId || '');
  return {
    id: `${agencyId}:${clientId || 'none'}:${caregiverId}`,
    agencyId,
    agencyName: doc.agencyName || '—',
    clientId,
    clientName: doc.clientName || '—',
    caregiverId,
    caregiverName: doc.caregiverName || '—',
    createCaregiver: yesNo(doc.caregiverCreated),
    scheduleCreated: yesNo(doc.hasSchedule),
    evvForm: yesNo(hasEvv),
    clientEvvStatus,
    agencyEvvStatus,
    status: doc.status,
    statusLabel: status.label,
    scheduleCount: Number(doc.scheduleCount || 0),
    evvCount: Number(doc.evvCount || 0),
  };
};

const emptySummary = () => Object.fromEntries(STATUS_META.map((item) => [item.summaryKey, 0]));

const runReport = async (query = {}, { forExport = false } = {}) => {
  const { agencies, scoped } = await loadAgencyScope(query);
  const agencyIds = scoped.map((agency) => agency._id);
  const { page, limit } = pageParams(query);
  const from = parseDateKey(query.from);
  const to = parseDateKey(query.to);
  const clientId = toOid(query.clientId);
  const status = String(query.status || '');
  const safeFrom = from && to && from > to ? to : from;
  const safeTo = from && to && from > to ? from : to;

  if (!agencyIds.length) {
    return {
      agencies: (await loadAgencyScope(query)).agencies.map((agency) => ({ id: String(agency._id), name: agency.name || 'Agency' })),
      clients: [],
      statuses: STATUS_META,
      summary: emptySummary(),
      items: [],
      pagination: { page: 1, limit, total: 0, totalPages: 1, from: 0, to: 0 },
    };
  }

  const cappedLimit = forExport ? 10000 : limit;
  const pipeline = buildPipeline({
    agencyIds,
    clientId,
    from: safeFrom,
    to: safeTo,
    status,
    skip: forExport ? 0 : (page - 1) * limit,
    limit: cappedLimit,
  });
  const [facet] = await Model.AgencyAccountModel.aggregate(pipeline).allowDiskUse(true);
  const total = facet?.meta?.[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (!forExport && total && page > totalPages) {
    return runReport({ ...query, page: totalPages }, { forExport });
  }

  const summary = emptySummary();
  (facet?.stats || []).forEach((row) => {
    const meta = STATUS_META.find((item) => item.key === row._id);
    if (meta) summary[meta.summaryKey] = row.count;
  });

  const clientOptions = clientId
    ? await Model.ClientModel.find({ _id: clientId }).select('firstName lastName agencyId').lean()
    : await Model.ClientModel.find({ agencyId: { $in: agencyIds } })
      .select('firstName lastName agencyId')
      .sort({ firstName: 1, lastName: 1 })
      .limit(500)
      .lean();

  const start = total ? ((Math.min(page, totalPages) - 1) * limit) + 1 : 0;
  const items = (facet?.items || []).map(mapItem);

  return {
    agencies: agencies.map((agency) => ({ id: String(agency._id), name: agency.name || 'Agency' })),
    clients: clientOptions.map((client) => ({
      id: String(client._id),
      name: `${client.firstName || ''} ${client.lastName || ''}`.trim() || 'Client',
      agencyId: String(client.agencyId || ''),
    })),
    statuses: STATUS_META.map(({ key, label }) => ({ key, label })),
    summary,
    items,
    pagination: {
      page: total ? Math.min(page, totalPages) : 1,
      limit,
      total,
      totalPages,
      from: start,
      to: total ? start + items.length - 1 : 0,
    },
  };
};

const csvCell = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const exportCsv = async (query = {}) => {
  const report = await runReport(query, { forExport: true });
  const headers = [
    'Agency Name',
    'Client Name',
    'Caregiver Name',
    'Create Caregiver',
    'Schedule Created',
    'EVV Form',
    'Client EVV Status',
    'Agency EVV Status',
    'Status',
  ];
  const lines = report.items.map((row) => [
    row.agencyName,
    row.clientName,
    row.caregiverName,
    row.createCaregiver,
    row.scheduleCreated,
    row.evvForm,
    row.clientEvvStatus,
    row.agencyEvvStatus,
    row.statusLabel,
  ]);
  const csv = `\uFEFF${[headers, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')}`;
  return { filename: 'agency-caregiver-evv-summary.csv', csv };
};

const getOptions = async (query = {}) => {
  const report = await runReport({ ...query, page: 1, limit: 1 });
  return {
    agencies: report.agencies,
    clients: report.clients,
    statuses: report.statuses,
  };
};

module.exports = {
  STATUS_META,
  getOptions,
  getList: (query) => runReport(query),
  exportCsv,
};
