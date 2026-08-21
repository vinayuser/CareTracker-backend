const Model = require('../../models/index');
const { addDaysToDateKey } = require('../../common/timezone');
const { typeBlocksByDefault } = require('../../common/leaveConstants');

const OPENABLE_STATUSES = ['Scheduled', 'Late', 'Missed'];

const weekdayFromDateKey = (dateKey) => {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long' });
};

const formatMdY = (dateKey) => {
  if (!dateKey) return '';
  const d = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
};

const dateKeysBetween = (start, end) => {
  const keys = [];
  let cursor = String(start).slice(0, 10);
  const last = String(end).slice(0, 10);
  if (!cursor || !last || cursor > last) return keys;
  while (cursor <= last) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }
  return keys;
};

const holidayBlocksWork = (holiday) => {
  if (!holiday || holiday.status !== 'Active') return false;
  if (holiday.type === 'National') return true;
  if (holiday.blocksWork != null) return Boolean(holiday.blocksWork);
  return typeBlocksByDefault(holiday.type);
};

const getActiveHolidays = async (agencyId, from, to) => {
  const filter = { agencyId, status: 'Active' };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }
  return Model.HolidayModel.find(filter).lean();
};

const getBlockingHolidayMap = async (agencyId, from, to) => {
  const rows = await getActiveHolidays(agencyId, from, to);
  const map = new Map();
  rows.forEach((holiday) => {
    if (!holidayBlocksWork(holiday)) return;
    map.set(holiday.date, holiday);
  });
  return map;
};

const markVisitsLeave = async ({
  agencyId,
  dateKeys,
  caregiverAccountId = null,
  source,
  holidayId = null,
  leaveRequestId = null,
  label = 'Leave',
}) => {
  const dates = [...new Set((dateKeys || []).filter(Boolean))];
  if (!dates.length) return 0;

  const filter = {
    agencyId,
    scheduledDate: { $in: dates },
    status: { $in: OPENABLE_STATUSES },
    checkInAt: null,
  };
  if (caregiverAccountId) filter.caregiverAccountId = caregiverAccountId;

  const result = await Model.VisitModel.updateMany(filter, {
    $set: {
      status: 'Leave',
      leaveSource: source,
      holidayId,
      leaveRequestId,
      leaveLabel: label,
      notes: label,
    },
  });
  return result.modifiedCount || 0;
};

const unmarkVisitsLeave = async ({
  agencyId,
  dateKeys,
  caregiverAccountId = null,
  source,
  holidayId = null,
  leaveRequestId = null,
}) => {
  const dates = [...new Set((dateKeys || []).filter(Boolean))];
  if (!dates.length) return 0;

  const filter = {
    agencyId,
    scheduledDate: { $in: dates },
    status: 'Leave',
    leaveSource: source,
    checkInAt: null,
  };
  if (caregiverAccountId) filter.caregiverAccountId = caregiverAccountId;
  if (holidayId) filter.holidayId = holidayId;
  if (leaveRequestId) filter.leaveRequestId = leaveRequestId;

  const result = await Model.VisitModel.updateMany(filter, {
    $set: {
      status: 'Scheduled',
      leaveSource: '',
      holidayId: null,
      leaveRequestId: null,
      leaveLabel: '',
    },
  });
  return result.modifiedCount || 0;
};

const applyHolidayToVisits = async (holiday) => {
  if (!holidayBlocksWork(holiday)) {
    return unmarkVisitsLeave({
      agencyId: holiday.agencyId,
      dateKeys: [holiday.date],
      source: 'holiday',
      holidayId: holiday._id,
    });
  }
  return markVisitsLeave({
    agencyId: holiday.agencyId,
    dateKeys: [holiday.date],
    source: 'holiday',
    holidayId: holiday._id,
    label: `${holiday.type} Holiday: ${holiday.name}`,
  });
};

const applyLeaveRequestToVisits = async (request) => {
  return markVisitsLeave({
    agencyId: request.agencyId,
    dateKeys: request.dates,
    caregiverAccountId: request.caregiverAccountId,
    source: 'request',
    leaveRequestId: request._id,
    label: request.typeName || 'Leave',
  });
};

const clearLeaveRequestFromVisits = async (request) => {
  return unmarkVisitsLeave({
    agencyId: request.agencyId,
    dateKeys: request.dates,
    caregiverAccountId: request.caregiverAccountId,
    source: 'request',
    leaveRequestId: request._id,
  });
};

const leaveFieldsForDate = (holidayMap, dateKey) => {
  const holiday = holidayMap.get(dateKey);
  if (!holiday) return null;
  return {
    status: 'Leave',
    leaveSource: 'holiday',
    holidayId: holiday._id,
    leaveRequestId: null,
    leaveLabel: `${holiday.type} Holiday: ${holiday.name}`,
    notes: `${holiday.type} Holiday: ${holiday.name}`,
  };
};

module.exports = {
  weekdayFromDateKey,
  formatMdY,
  dateKeysBetween,
  holidayBlocksWork,
  getActiveHolidays,
  getBlockingHolidayMap,
  markVisitsLeave,
  unmarkVisitsLeave,
  applyHolidayToVisits,
  applyLeaveRequestToVisits,
  clearLeaveRequestFromVisits,
  leaveFieldsForDate,
};
