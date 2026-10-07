const mongoose = require('mongoose');
const Model = require('../../models/index');

const CATEGORIES = ['billing', 'compliance', 'hiring', 'clinical', 'schedule', 'system', 'message'];

const ROLE_LABELS = {
  AGENCY_OWNER: 'Agency Owner',
  HR: 'HR',
  CAREGIVER: 'Caregiver',
  CLIENT: 'Client',
};

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * One event is fanned out to several recipients (owner, HR, caregiver…), so copies with the
 * same type/entity/title/body created within the same minute are collapsed into one activity.
 */
const eventGroupStage = {
  $group: {
    _id: {
      type: '$type',
      entityId: '$entityId',
      title: '$title',
      body: '$body',
      minute: { $dateToString: { format: '%Y-%m-%dT%H:%M', date: '$createdAt' } },
    },
    createdAt: { $max: '$createdAt' },
    category: { $first: '$category' },
    tone: { $first: '$tone' },
    priority: { $first: '$priority' },
    entityType: { $first: '$entityType' },
    metadata: { $first: '$metadata' },
    recipientIds: { $addToSet: '$recipientId' },
  },
};

const getActivity = async (agencyId, query = {}) => {
  const agencyOid = toOid(agencyId);
  if (!agencyOid) throw new Error('Agency Not Found');
  const agency = await Model.AgencyModel.findById(agencyOid).select('_id').lean();
  if (!agency) throw new Error('Agency Not Found');

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

  const baseMatch = { agencyId: agencyOid };
  const listMatch = { ...baseMatch };
  if (query.category && CATEGORIES.includes(String(query.category))) {
    listMatch.category = String(query.category);
  }
  if (query.search && String(query.search).trim()) {
    const rx = new RegExp(escapeRegex(String(query.search).trim()), 'i');
    listMatch.$or = [{ title: rx }, { body: rx }];
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const [listResult, statsResult] = await Promise.all([
    Model.NotificationModel.aggregate([
      { $match: listMatch },
      eventGroupStage,
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]),
    Model.NotificationModel.aggregate([
      { $match: baseMatch },
      eventGroupStage,
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          today: { $sum: { $cond: [{ $gte: ['$createdAt', startOfToday] }, 1, 0] } },
          week: { $sum: { $cond: [{ $gte: ['$createdAt', weekAgo] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const rows = listResult[0]?.rows || [];
  const total = listResult[0]?.total?.[0]?.count || 0;

  const recipientIds = [...new Set(rows.flatMap((row) => row.recipientIds.map(String)))];
  const accounts = recipientIds.length
    ? await Model.AgencyAccountModel.find({ _id: { $in: recipientIds.map(toOid) } })
      .select('_id fullName role')
      .lean()
    : [];
  const accountById = new Map(accounts.map((a) => [String(a._id), a]));

  const list = rows.map((row) => {
    const recipients = row.recipientIds
      .map((id) => accountById.get(String(id)))
      .filter(Boolean)
      .map((account) => ({
        id: String(account._id),
        name: account.fullName || '',
        role: account.role,
        roleLabel: ROLE_LABELS[account.role] || account.role,
      }));
    return {
      id: `${row._id.type}:${row._id.entityId || ''}:${row._id.minute}:${row._id.title}`,
      type: row._id.type,
      title: row._id.title,
      body: row._id.body || '',
      category: row.category || 'system',
      tone: row.tone || 'info',
      priority: row.priority || 'normal',
      entityType: row.entityType || '',
      entityId: row._id.entityId ? String(row._id.entityId) : '',
      metadata: row.metadata || {},
      createdAt: row.createdAt,
      recipients,
    };
  });

  const byCategory = Object.fromEntries(CATEGORIES.map((key) => [key, 0]));
  let totalEvents = 0;
  let today = 0;
  let week = 0;
  for (const row of statsResult) {
    const key = row._id || 'system';
    byCategory[key] = (byCategory[key] || 0) + row.count;
    totalEvents += row.count;
    today += row.today;
    week += row.week;
  }

  return {
    stats: { total: totalEvents, today, week, byCategory },
    list,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: page * limit < total,
    },
  };
};

module.exports = { getActivity };
