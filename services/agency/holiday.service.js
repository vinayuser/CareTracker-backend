const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { HOLIDAY_TYPES, typeBlocksByDefault } = require('../../common/leaveConstants');
const {
  weekdayFromDateKey,
  formatMdY,
  holidayBlocksWork,
  applyHolidayToVisits,
  unmarkVisitsLeave,
} = require('./holidayLeaveVisits.service');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const actor = (req) => {
  const account = getAgencyAccount(req);
  return {
    id: account?._id || account?.id || null,
    name: account?.fullName || account?.name || 'Admin User',
  };
};

const formatHoliday = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId);
  item.dateDisplay = formatMdY(item.date);
  item.day = weekdayFromDateKey(item.date);
  item.blocksWork = holidayBlocksWork(doc);
  item.createdBy = item.createdByName || 'Admin User';
  return item;
};

const listHolidays = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const search = String(query.search || query.name || '').trim();
  const status = String(query.status || 'All');
  const type = String(query.type || 'All');
  const from = String(query.from || '').slice(0, 10);
  const to = String(query.to || '').slice(0, 10);
  const sortDir = String(query.sort || 'asc') === 'desc' ? -1 : 1;

  const filter = { agencyId };
  if (status && status !== 'All') filter.status = status;
  if (type && type !== 'All' && HOLIDAY_TYPES.includes(type)) filter.type = type;
  if (search) {
    filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  const [total, rows] = await Promise.all([
    Model.HolidayModel.countDocuments(filter),
    Model.HolidayModel.find(filter)
      .sort({ date: sortDir, name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
  ]);

  return {
    list: rows.map(formatHoliday),
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

const createHoliday = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const { name } = payload;
  const date = String(payload.date || '').slice(0, 10);
  const type = HOLIDAY_TYPES.includes(payload.type) ? payload.type : 'National';
  const status = payload.status === 'Inactive' ? 'Inactive' : 'Active';
  const blocksWork = type === 'National' ? true : (payload.blocksWork != null ? Boolean(payload.blocksWork) : typeBlocksByDefault(type));
  const who = actor(req);

  const existing = await Model.HolidayModel.findOne({ agencyId, date, name: String(name).trim() });
  if (existing) throw new Error(constants.MESSAGE.HOLIDAY.DUPLICATE);

  const holiday = await Model.HolidayModel.create({
    agencyId,
    name: String(name).trim(),
    date,
    type,
    status,
    blocksWork,
    notes: payload.notes || '',
    applicableTo: 'All Caregivers',
    createdByAccountId: who.id,
    createdByName: who.name,
  });

  if (status === 'Active') await applyHolidayToVisits(holiday);
  return formatHoliday(holiday);
};

const updateHoliday = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const holiday = await Model.HolidayModel.findOne({ _id: id, agencyId });
  if (!holiday) throw new Error(constants.MESSAGE.HOLIDAY.NOT_FOUND);

  const previousDate = holiday.date;
  if (payload.name != null) holiday.name = String(payload.name).trim();
  if (payload.date) holiday.date = String(payload.date).slice(0, 10);
  if (payload.type && HOLIDAY_TYPES.includes(payload.type)) holiday.type = payload.type;
  if (payload.status === 'Active' || payload.status === 'Inactive') holiday.status = payload.status;
  if (payload.notes != null) holiday.notes = payload.notes;
  if (holiday.type === 'National') holiday.blocksWork = true;
  else if (payload.blocksWork != null) holiday.blocksWork = Boolean(payload.blocksWork);

  try {
    await holiday.save();
  } catch (err) {
    if (err?.code === 11000) throw new Error(constants.MESSAGE.HOLIDAY.DUPLICATE);
    throw err;
  }

  if (previousDate !== holiday.date) {
    await unmarkVisitsLeave({
      agencyId,
      dateKeys: [previousDate],
      source: 'holiday',
      holidayId: holiday._id,
    });
  }

  if (holiday.status === 'Active') {
    await applyHolidayToVisits(holiday);
  } else {
    await unmarkVisitsLeave({
      agencyId,
      dateKeys: [holiday.date],
      source: 'holiday',
      holidayId: holiday._id,
    });
  }

  return formatHoliday(holiday);
};

const removeHoliday = async (req, id) => {
  const agencyId = getAgencyId(req);
  const holiday = await Model.HolidayModel.findOne({ _id: id, agencyId });
  if (!holiday) throw new Error(constants.MESSAGE.HOLIDAY.NOT_FOUND);

  await unmarkVisitsLeave({
    agencyId,
    dateKeys: [holiday.date],
    source: 'holiday',
    holidayId: holiday._id,
  });
  await holiday.deleteOne();
  return { id: String(id) };
};

module.exports = {
  listHolidays,
  createHoliday,
  updateHoliday,
  removeHoliday,
  formatHoliday,
};
