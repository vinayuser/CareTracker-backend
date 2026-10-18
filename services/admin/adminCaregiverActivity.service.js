const Model = require('../../models/index');

const dateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatRow = (doc) => ({
  id: String(doc._id),
  at: doc.at,
  dateKey: dateKey(doc.at),
  date: new Date(doc.at).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }),
  caregiver: doc.caregiverName || '',
  agency: doc.agencyName || '',
  activity: doc.activity || '',
  activityType: doc.activityType || '',
  related: doc.related || '',
  detail: doc.detail || '',
  status: doc.status || 'Recorded',
});

const getLogs = async (query = {}) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 7));
  const filter = {};

  if (query.agencyId) filter.agencyId = query.agencyId;
  else if (query.agency) filter.agencyName = query.agency;
  if (query.caregiverId) filter.caregiverAccountId = query.caregiverId;
  else if (query.caregiver) filter.caregiverName = query.caregiver;
  if (query.activity) filter.activityType = query.activity;
  if (query.from || query.to) {
    filter.at = {};
    if (query.from) filter.at.$gte = new Date(`${query.from}T00:00:00`);
    if (query.to) filter.at.$lte = new Date(`${query.to}T23:59:59.999`);
  }

  const [total, docs, agencies, caregivers, types] = await Promise.all([
    Model.CaregiverActivityModel.countDocuments(filter),
    Model.CaregiverActivityModel.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Model.CaregiverActivityModel.distinct('agencyName'),
    Model.CaregiverActivityModel.distinct('caregiverName'),
    Model.CaregiverActivityModel.distinct('activityType'),
  ]);

  const summaryFilter = { ...filter };
  const [activities, caregiverCount, carePlans, schedules, evv] = await Promise.all([
    Model.CaregiverActivityModel.countDocuments(summaryFilter),
    Model.CaregiverActivityModel.distinct('caregiverAccountId', summaryFilter),
    Model.CaregiverActivityModel.countDocuments({ ...summaryFilter, activityType: 'Care plan' }),
    Model.CaregiverActivityModel.countDocuments({ ...summaryFilter, activityType: 'Schedule' }),
    Model.CaregiverActivityModel.countDocuments({ ...summaryFilter, activityType: 'EVV' }),
  ]);

  return {
    list: docs.map(formatRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
      from: total === 0 ? 0 : (page - 1) * limit + 1,
      to: Math.min(page * limit, total),
    },
    options: {
      agencies: agencies.filter(Boolean).sort(),
      caregivers: caregivers.filter(Boolean).sort(),
      activityTypes: types.filter(Boolean).sort(),
    },
    summary: {
      total: activities,
      caregivers: caregiverCount.filter(Boolean).length,
      carePlans,
      schedules,
      evv,
    },
  };
};

module.exports = { getLogs };
