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
  // Holidays do not put caregivers on leave or block clock-in.
  // They only affect leave-day counting. Clear any leftover holiday Leave flags.
  return unmarkVisitsLeave({
    agencyId: holiday.agencyId,
    dateKeys: [holiday.date],
    source: 'holiday',
    holidayId: holiday._id,
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

const RESTORE_SCHEDULED = {
  status: 'Scheduled',
  leaveSource: '',
  holidayId: null,
  leaveRequestId: null,
  leaveLabel: '',
};

const isApprovedLeaveOnDate = (request, dateKey) => {
  if (!request || request.status !== 'Approved' || !dateKey) return false;
  if (Array.isArray(request.dates) && request.dates.length) {
    return request.dates.includes(dateKey);
  }
  return dateKey >= request.startDate && dateKey <= request.endDate;
};

const visitCaregiverId = (visit) => String(visit.caregiverAccountId?._id || visit.caregiverAccountId || '');

const getApprovedLeaveRequestMap = async (agencyId, caregiverAccountId, from, to) => {
  const map = new Map();
  if (!agencyId || !caregiverAccountId || !from || !to) return map;
  const rows = await Model.LeaveRequestModel.find({
    agencyId,
    caregiverAccountId,
    status: 'Approved',
    startDate: { $lte: to },
    endDate: { $gte: from },
  }).lean();
  rows.forEach((request) => {
    const keys = Array.isArray(request.dates) && request.dates.length
      ? request.dates
      : dateKeysBetween(request.startDate, request.endDate);
    keys.forEach((key) => {
      if (key >= from && key <= to && !map.has(key)) map.set(key, request);
    });
  });
  return map;
};

const visitHasApprovedLeave = (visit, requestById, approvedByCaregiverDate) => {
  if (visit.checkInAt) return true;
  const dateKey = visit.scheduledDate;
  const caregiverId = visitCaregiverId(visit);
  if (approvedByCaregiverDate.has(`${caregiverId}:${dateKey}`)) return true;
  if (visit.leaveSource === 'request' || visit.leaveRequestId) {
    const request = visit.leaveRequestId ? requestById.get(String(visit.leaveRequestId)) : null;
    if (!request) return false;
    if (caregiverId && String(request.caregiverAccountId) !== caregiverId) return false;
    return isApprovedLeaveOnDate(request, dateKey);
  }
  return false;
};

const reconcileLeaveVisits = async (visits) => {
  if (!Array.isArray(visits) || !visits.length) return visits;
  const leaveVisits = visits.filter((visit) => visit.status === 'Leave');
  if (!leaveVisits.length) return visits;

  const agencyId = leaveVisits[0].agencyId?._id || leaveVisits[0].agencyId;
  const dates = leaveVisits.map((visit) => visit.scheduledDate).filter(Boolean).sort();
  const requestIds = leaveVisits.map((visit) => visit.leaveRequestId).filter(Boolean);
  const caregiverIds = [...new Set(leaveVisits.map(visitCaregiverId).filter(Boolean))];

  const [requests, approvedRows] = await Promise.all([
    requestIds.length ? Model.LeaveRequestModel.find({ _id: { $in: requestIds } }).lean() : [],
    (agencyId && caregiverIds.length && dates.length)
      ? Model.LeaveRequestModel.find({
        agencyId,
        caregiverAccountId: { $in: caregiverIds },
        status: 'Approved',
        startDate: { $lte: dates[dates.length - 1] },
        endDate: { $gte: dates[0] },
      }).lean()
      : [],
  ]);
  const requestById = new Map(requests.map((row) => [String(row._id), row]));
  const approvedByCaregiverDate = new Set();
  approvedRows.forEach((request) => {
    const caregiverId = String(request.caregiverAccountId);
    const keys = Array.isArray(request.dates) && request.dates.length
      ? request.dates
      : dateKeysBetween(request.startDate, request.endDate);
    keys.forEach((key) => approvedByCaregiverDate.add(`${caregiverId}:${key}`));
  });

  const staleIds = leaveVisits
    .filter((visit) => !visitHasApprovedLeave(visit, requestById, approvedByCaregiverDate))
    .map((visit) => visit._id);
  if (!staleIds.length) return visits;

  await Model.VisitModel.updateMany(
    { _id: { $in: staleIds }, status: 'Leave', checkInAt: null },
    { $set: RESTORE_SCHEDULED },
  );

  const stale = new Set(staleIds.map(String));
  visits.forEach((visit) => {
    if (!stale.has(String(visit._id))) return;
    visit.status = 'Scheduled';
    visit.leaveSource = '';
    visit.holidayId = null;
    visit.leaveRequestId = null;
    visit.leaveLabel = '';
  });
  return visits;
};

const leaveFieldsForDate = (leaveByDate, dateKey) => {
  const request = leaveByDate?.get?.(dateKey);
  if (!request) return null;
  return {
    status: 'Leave',
    leaveSource: 'request',
    holidayId: null,
    leaveRequestId: request._id,
    leaveLabel: request.typeName || 'Leave',
    notes: request.typeName || 'Leave',
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
  reconcileLeaveVisits,
  getApprovedLeaveRequestMap,
};
