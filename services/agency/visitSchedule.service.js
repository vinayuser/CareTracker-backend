const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const {
  RECURRENCE_TYPES,
  GRACE_MINUTES,
  LATE_CHECK_IN_EXTRA_MINUTES,
  WEEK_DAYS,
  SCHEDULE_STATUSES,
  VISIT_STATUSES,
  VISIT_APPROVAL_STATUSES,
} = require('../../common/visitScheduleConstants');

const DEFAULT_HORIZON_DAYS = 42;
const LATE_EXTRA_MS = LATE_CHECK_IN_EXTRA_MINUTES * 60 * 1000;

const resolveLateCheckInUntil = (visit) => {
  if (visit.lateCheckInUntil) return new Date(visit.lateCheckInUntil);
  if (visit.latestCheckInAt) {
    return new Date(new Date(visit.latestCheckInAt).getTime() + LATE_EXTRA_MS);
  }
  return null;
};

const getAgencyAccount = (req) => req.agency_owner || req.hr;
const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};
const getAccountId = (req) => {
  const account = getAgencyAccount(req);
  return account?._id || account?.id || null;
};
const getCaregiverAccount = (req) => {
  const account = req.caregiver;
  if (!account) throw new Error('Caregiver account not found');
  return account;
};
const getCaregiverAgencyId = (req) => {
  const account = getCaregiverAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const pad2 = (n) => String(n).padStart(2, '0');

const toDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const parseTimeOnDate = (dateKey, hhmm) => {
  const [h, m] = String(hhmm || '00:00').split(':').map((x) => Number(x) || 0);
  const [y, mo, d] = dateKey.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
};

const formatAddress = (client) => {
  if (!client) return '';
  return [client.streetAddress, client.aptSuite, client.city, client.state, client.zipCode]
    .filter(Boolean)
    .join(', ');
};

const generateScheduleCode = async (agencyId) => {
  const count = await Model.VisitScheduleModel.countDocuments({ agencyId });
  return `SCH-${String(10001 + count).padStart(5, '0')}`;
};

const generateVisitCode = async (agencyId) => {
  const count = await Model.VisitModel.countDocuments({ agencyId });
  return `VST-${String(10001 + count).padStart(5, '0')}`;
};

const getOptions = () => ({
  recurrence_types: RECURRENCE_TYPES,
  grace_minutes: GRACE_MINUTES,
  week_days: WEEK_DAYS,
  schedule_statuses: SCHEDULE_STATUSES,
  visit_statuses: VISIT_STATUSES,
  approval_statuses: VISIT_APPROVAL_STATUSES,
  late_check_in_extra_minutes: LATE_CHECK_IN_EXTRA_MINUTES,
});

const formatSchedule = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.carePlanId = String(doc.carePlanId?._id || doc.carePlanId || '');
  item.clientId = String(doc.clientId?._id || doc.clientId || '');
  item.caregiverAccountId = String(doc.caregiverAccountId?._id || doc.caregiverAccountId || '');
  return item;
};

const formatVisit = (doc) => {
  const item = functions.toClientDoc(doc);
  if (!item) return null;
  item.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  item.scheduleId = String(doc.scheduleId?._id || doc.scheduleId || '');
  item.carePlanId = String(doc.carePlanId?._id || doc.carePlanId || '');
  item.clientId = String(doc.clientId?._id || doc.clientId || '');
  item.caregiverAccountId = String(doc.caregiverAccountId?._id || doc.caregiverAccountId || '');
  if (!item.lateCheckInUntil && item.latestCheckInAt) {
    item.lateCheckInUntil = new Date(new Date(item.latestCheckInAt).getTime() + LATE_EXTRA_MS);
  }
  item.ended = Boolean(item.checkOutAt);
  item.canCheckIn = !item.checkInAt && ['Scheduled', 'Late', 'Missed'].includes(item.status);
  item.canCheckOut = Boolean(item.checkInAt) && !item.checkOutAt && ['InProgress', 'Exception'].includes(item.status);
  if (item.checkOutAt && (!item.approvalStatus || item.approvalStatus === 'None')) {
    item.approvalStatus = 'Pending';
  }
  item.canApprove = Boolean(item.checkOutAt) && item.approvalStatus === 'Pending';
  item.approvedBy = item.approvedBy ? String(item.approvedBy) : null;
  return item;
};

const occursOnDate = (schedule, date) => {
  const key = toDateKey(date);
  if (key < schedule.effectiveFrom) return false;
  if (schedule.effectiveTo && key > schedule.effectiveTo) return false;

  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];

  if (schedule.recurrenceType === 'Daily') return true;
  if (schedule.recurrenceType === 'Weekly') {
    const days = schedule.daysOfWeek?.length ? schedule.daysOfWeek : [];
    return days.includes(dow);
  }
  if (schedule.recurrenceType === 'Monthly') {
    const day = schedule.dayOfMonth || Number(schedule.effectiveFrom.slice(8, 10));
    return date.getDate() === day;
  }
  return false;
};

const buildVisitPayload = (schedule, dateKey, visitCode) => {
  const startAt = parseTimeOnDate(dateKey, schedule.startTime);
  const endAt = parseTimeOnDate(dateKey, schedule.endTime);
  if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);
  const graceMs = (schedule.graceMinutes || 15) * 60 * 1000;
  const latestCheckInAt = new Date(startAt.getTime() + graceMs);
  return {
    agencyId: schedule.agencyId,
    visitCode,
    scheduleId: schedule._id,
    carePlanId: schedule.carePlanId,
    clientId: schedule.clientId,
    caregiverAccountId: schedule.caregiverAccountId,
    serviceArea: schedule.serviceArea || '',
    clientName: schedule.clientName || '',
    caregiverName: schedule.caregiverName || '',
    address: schedule.address || '',
    scheduledDate: dateKey,
    scheduledStartAt: startAt,
    scheduledEndAt: endAt,
    earliestCheckInAt: new Date(startAt.getTime() - graceMs),
    latestCheckInAt,
    lateCheckInUntil: new Date(latestCheckInAt.getTime() + LATE_EXTRA_MS),
    graceMinutes: schedule.graceMinutes || 15,
    status: 'Scheduled',
  };
};

const generateVisitsForSchedule = async (schedule, { fromDate, days = DEFAULT_HORIZON_DAYS } = {}) => {
  if (!schedule || schedule.status !== 'Active') return { created: 0, visits: [] };

  const start = fromDate ? new Date(fromDate) : new Date();
  start.setHours(0, 0, 0, 0);
  const created = [];

  for (let i = 0; i < days; i += 1) {
    const cursor = new Date(start);
    cursor.setDate(start.getDate() + i);
    if (!occursOnDate(schedule, cursor)) continue;

    const dateKey = toDateKey(cursor);
    const existing = await Model.VisitModel.findOne({
      scheduleId: schedule._id,
      scheduledDate: dateKey,
    });
    if (existing) continue;

    const visitCode = await generateVisitCode(schedule.agencyId);
    const visit = await Model.VisitModel.create(buildVisitPayload(schedule, dateKey, visitCode));
    created.push(visit);
  }

  return { created: created.length, visits: created.map(formatVisit) };
};

const markMissedVisits = async (agencyId) => {
  const now = new Date();
  const candidates = await Model.VisitModel.find({
    agencyId,
    status: { $in: ['Scheduled', 'Late'] },
    checkInAt: null,
    latestCheckInAt: { $lt: now },
  });

  const ops = [];
  for (const visit of candidates) {
    const until = resolveLateCheckInUntil(visit);
    if (until && until < now) {
      ops.push({
        updateOne: {
          filter: { _id: visit._id },
          update: { $set: { status: 'Missed' } },
        },
      });
    }
  }
  if (ops.length) await Model.VisitModel.bulkWrite(ops);
};

const assertVerifiedEnrollment = async (agencyId, caregiverAccountId, carePlanId) => {
  const enrollment = await Model.EvvEnrollmentModel.findOne({
    agencyId,
    caregiverAccountId,
    carePlanId,
    status: 'Verified',
  });
  if (!enrollment) {
    throw new Error(constants.MESSAGE.VISIT.EVV_NOT_VERIFIED);
  }
  return enrollment;
};

const createSchedule = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const carePlan = await Model.CarePlanModel.findOne({ _id: payload.care_plan_id, agencyId });
  if (!carePlan) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  const clientId = payload.client_id || carePlan.clientId;
  const client = await Model.ClientModel.findOne({ _id: clientId, agencyId });
  if (!client) throw new Error(constants.MESSAGE.CLIENT.NOT_FOUND);

  const caregiver = await Model.AgencyAccountModel.findOne({
    _id: payload.caregiver_account_id,
    agencyId,
    role: 'CAREGIVER',
  });
  if (!caregiver) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);

  const recurrenceType = payload.recurrence_type;
  if (!RECURRENCE_TYPES.includes(recurrenceType)) {
    throw new Error(constants.MESSAGE.VISIT.INVALID_RECURRENCE);
  }

  const graceMinutes = Number(payload.grace_minutes) === 30 ? 30 : 15;
  const daysOfWeek = recurrenceType === 'Weekly'
    ? (payload.days_of_week || []).filter((d) => WEEK_DAYS.includes(d))
    : [];
  if (recurrenceType === 'Weekly' && daysOfWeek.length === 0) {
    throw new Error(constants.MESSAGE.VISIT.DAYS_REQUIRED);
  }

  const schedule = await Model.VisitScheduleModel.create({
    agencyId,
    scheduleCode: await generateScheduleCode(agencyId),
    carePlanId: carePlan._id,
    clientId: client._id,
    caregiverAccountId: caregiver._id,
    serviceArea: payload.service_area || '',
    careNeedAreaKey: payload.care_need_area_key || '',
    clientName: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
    caregiverName: caregiver.fullName || '',
    planCode: carePlan.planCode || '',
    recurrenceType,
    daysOfWeek,
    dayOfMonth: recurrenceType === 'Monthly'
      ? Number(payload.day_of_month) || Number(String(payload.effective_from).slice(8, 10)) || 1
      : null,
    startTime: payload.start_time,
    endTime: payload.end_time,
    graceMinutes,
    timezone: payload.timezone || 'America/New_York',
    effectiveFrom: payload.effective_from,
    effectiveTo: payload.effective_to || '',
    status: payload.status || 'Active',
    notes: payload.notes || '',
    address: payload.address || formatAddress(client),
    createdByAccountId: getAccountId(req),
  });

  const generated = await generateVisitsForSchedule(schedule);
  return {
    schedule: formatSchedule(schedule),
    generated_visits: generated.created,
  };
};

const updateSchedule = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const schedule = await Model.VisitScheduleModel.findOne({ _id: id, agencyId });
  if (!schedule) throw new Error(constants.MESSAGE.VISIT.SCHEDULE_NOT_FOUND);

  if (payload.caregiver_account_id) {
    const caregiver = await Model.AgencyAccountModel.findOne({
      _id: payload.caregiver_account_id,
      agencyId,
      role: 'CAREGIVER',
    });
    if (!caregiver) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);
    schedule.caregiverAccountId = caregiver._id;
    schedule.caregiverName = caregiver.fullName || '';
  }

  if (payload.recurrence_type) {
    if (!RECURRENCE_TYPES.includes(payload.recurrence_type)) {
      throw new Error(constants.MESSAGE.VISIT.INVALID_RECURRENCE);
    }
    schedule.recurrenceType = payload.recurrence_type;
  }
  if (payload.days_of_week) {
    schedule.daysOfWeek = payload.days_of_week.filter((d) => WEEK_DAYS.includes(d));
  }
  if (payload.day_of_month != null) schedule.dayOfMonth = Number(payload.day_of_month) || null;
  if (payload.start_time) schedule.startTime = payload.start_time;
  if (payload.end_time) schedule.endTime = payload.end_time;
  if (payload.grace_minutes != null) {
    schedule.graceMinutes = Number(payload.grace_minutes) === 30 ? 30 : 15;
  }
  if (payload.effective_from) schedule.effectiveFrom = payload.effective_from;
  if (payload.effective_to !== undefined) schedule.effectiveTo = payload.effective_to || '';
  if (payload.service_area !== undefined) schedule.serviceArea = payload.service_area || '';
  if (payload.notes !== undefined) schedule.notes = payload.notes || '';
  if (payload.address !== undefined) schedule.address = payload.address || '';
  if (payload.status && SCHEDULE_STATUSES.includes(payload.status)) {
    schedule.status = payload.status;
  }

  await schedule.save();

  let generated = { created: 0 };
  if (schedule.status === 'Active') {
    generated = await generateVisitsForSchedule(schedule);
  }

  return {
    schedule: formatSchedule(schedule),
    generated_visits: generated.created,
  };
};

const getScheduleStats = async (req) => {
  const agencyId = getAgencyId(req);
  await markMissedVisits(agencyId);
  const [schedules, visits] = await Promise.all([
    Model.VisitScheduleModel.find({ agencyId }),
    Model.VisitModel.find({ agencyId }),
  ]);
  return {
    schedules_total: schedules.length,
    schedules_active: schedules.filter((s) => s.status === 'Active').length,
    visits_today: visits.filter((v) => v.scheduledDate === toDateKey(new Date())).length,
    visits_scheduled: visits.filter((v) => v.status === 'Scheduled').length,
    visits_in_progress: visits.filter((v) => v.status === 'InProgress').length,
    visits_completed: visits.filter((v) => v.status === 'Completed').length,
    visits_missed: visits.filter((v) => v.status === 'Missed').length,
  };
};

const getSchedules = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };
  if (query.status && query.status !== 'All') filter.status = query.status;
  if (query.caregiver_id) filter.caregiverAccountId = query.caregiver_id;
  if (query.client_id) filter.clientId = query.client_id;
  if (query.care_plan_id) filter.carePlanId = query.care_plan_id;

  const list = await Model.VisitScheduleModel.find(filter).sort({ createdAt: -1 });
  return list.map(formatSchedule);
};

const getScheduleById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const schedule = await Model.VisitScheduleModel.findOne({ _id: id, agencyId });
  if (!schedule) throw new Error(constants.MESSAGE.VISIT.SCHEDULE_NOT_FOUND);
  return formatSchedule(schedule);
};

const removeSchedule = async (req, id) => {
  const agencyId = getAgencyId(req);
  const schedule = await Model.VisitScheduleModel.findOne({ _id: id, agencyId });
  if (!schedule) throw new Error(constants.MESSAGE.VISIT.SCHEDULE_NOT_FOUND);

  await Model.VisitModel.deleteMany({
    scheduleId: schedule._id,
    status: { $in: ['Scheduled', 'Missed'] },
  });
  await Model.VisitScheduleModel.deleteOne({ _id: schedule._id });
  return { id: String(id) };
};

const getVisits = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  await markMissedVisits(agencyId);
  const filter = { agencyId };
  if (query.status && query.status !== 'All') filter.status = query.status;
  if (query.caregiver_id) filter.caregiverAccountId = query.caregiver_id;
  if (query.client_id) filter.clientId = query.client_id;
  if (query.schedule_id) filter.scheduleId = query.schedule_id;
  if (query.date) filter.scheduledDate = query.date;
  if (query.from || query.to) {
    filter.scheduledDate = {};
    if (query.from) filter.scheduledDate.$gte = query.from;
    if (query.to) filter.scheduledDate.$lte = query.to;
  }

  const list = await Model.VisitModel.find(filter).sort({ scheduledStartAt: 1 });
  return list.map(formatVisit);
};

const getCarePlanScheduleSources = async (req, carePlanId) => {
  const agencyId = getAgencyId(req);
  const plan = await Model.CarePlanModel.findOne({ _id: carePlanId, agencyId })
    .populate('clientId');
  if (!plan) throw new Error(constants.MESSAGE.CARE_PLAN.NOT_FOUND);

  const client = plan.clientId;
  const needs = (plan.formData?.careNeeds || []).filter((n) => n.responsibleStaffId);
  const caregiverIds = [...new Set(needs.map((n) => String(n.responsibleStaffId)))];
  const caregivers = await Model.AgencyAccountModel.find({
    _id: { $in: caregiverIds },
    agencyId,
    role: 'CAREGIVER',
  });
  const byId = {};
  caregivers.forEach((c) => { byId[String(c._id)] = c; });

  return {
    care_plan: {
      id: String(plan._id),
      plan_code: plan.planCode,
      status: plan.status,
    },
    client: client
      ? {
          id: String(client._id),
          name: `${client.firstName || ''} ${client.lastName || ''}`.trim(),
          address: formatAddress(client),
          preferred_days: client.preferredDays || [],
          preferred_times: client.preferredTimes || [],
          care_frequency: client.careFrequency || '',
        }
      : null,
    care_needs: needs.map((need) => ({
      area_key: need.areaKey || '',
      area_label: need.areaLabel || '',
      frequency: need.frequency || '',
      caregiver_account_id: String(need.responsibleStaffId),
      caregiver_name: byId[String(need.responsibleStaffId)]?.fullName
        || need.responsibleStaff
        || '',
      schedule_days: need.scheduleDays || [],
      start_time: need.startTime || '',
      end_time: need.endTime || '',
      grace_minutes: need.graceMinutes || 15,
    })),
  };
};

const getCaregiverVisits = async (req, query = {}) => {
  const caregiver = getCaregiverAccount(req);
  const agencyId = getCaregiverAgencyId(req);
  await markMissedVisits(agencyId);

  const filter = {
    agencyId,
    caregiverAccountId: caregiver._id || caregiver.id,
  };
  if (query.status && query.status !== 'All') filter.status = query.status;
  if (query.date) filter.scheduledDate = query.date;
  if (query.from || query.to) {
    filter.scheduledDate = {};
    if (query.from) filter.scheduledDate.$gte = query.from;
    if (query.to) filter.scheduledDate.$lte = query.to;
  } else if (!query.date) {
    const today = toDateKey(new Date());
    const end = new Date();
    end.setDate(end.getDate() + 14);
    filter.scheduledDate = { $gte: today, $lte: toDateKey(end) };
  }

  const list = await Model.VisitModel.find(filter).sort({ scheduledStartAt: 1 });
  return list.map(formatVisit);
};

const checkInVisit = async (req, visitId, payload = {}) => {
  const caregiver = getCaregiverAccount(req);
  const agencyId = getCaregiverAgencyId(req);
  const visit = await Model.VisitModel.findOne({
    _id: visitId,
    agencyId,
    caregiverAccountId: caregiver._id || caregiver.id,
  });
  if (!visit) throw new Error(constants.MESSAGE.VISIT.NOT_FOUND);
  if (visit.checkInAt) {
    throw new Error(constants.MESSAGE.VISIT.INVALID_CHECK_IN);
  }
  if (!['Scheduled', 'Late', 'Missed'].includes(visit.status)) {
    throw new Error(constants.MESSAGE.VISIT.INVALID_CHECK_IN);
  }

  await assertVerifiedEnrollment(agencyId, visit.caregiverAccountId, visit.carePlanId);

  const now = new Date();
  if (now < visit.earliestCheckInAt) {
    throw new Error(constants.MESSAGE.VISIT.TOO_EARLY);
  }

  const lateUntil = resolveLateCheckInUntil(visit);
  if (!visit.lateCheckInUntil && lateUntil) {
    visit.lateCheckInUntil = lateUntil;
  }
  if (lateUntil && now > lateUntil) {
    visit.status = 'Missed';
    await visit.save();
    throw new Error(constants.MESSAGE.VISIT.TOO_LATE);
  }

  const late = now > visit.latestCheckInAt;
  visit.checkInAt = now;
  visit.checkInMethod = payload.method || 'Mobile App';
  visit.checkInLat = payload.lat ?? null;
  visit.checkInLng = payload.lng ?? null;
  visit.lateCheckIn = late;
  visit.status = late ? 'Exception' : 'InProgress';
  if (late) {
    visit.exceptionReason = payload.exception_reason
      || `Checked in after ${visit.graceMinutes || 15}-minute grace window`;
  }
  await visit.save();
  return formatVisit(visit);
};

const checkOutVisit = async (req, visitId, payload = {}) => {
  const caregiver = getCaregiverAccount(req);
  const agencyId = getCaregiverAgencyId(req);
  const visit = await Model.VisitModel.findOne({
    _id: visitId,
    agencyId,
    caregiverAccountId: caregiver._id || caregiver.id,
  });
  if (!visit) throw new Error(constants.MESSAGE.VISIT.NOT_FOUND);
  if (visit.checkOutAt) {
    throw new Error(constants.MESSAGE.VISIT.ALREADY_CHECKED_OUT);
  }
  if (!visit.checkInAt) {
    throw new Error(constants.MESSAGE.VISIT.INVALID_CHECK_OUT);
  }
  if (!['InProgress', 'Exception'].includes(visit.status)) {
    throw new Error(constants.MESSAGE.VISIT.INVALID_CHECK_OUT);
  }

  const now = new Date();
  if (now < visit.checkInAt) {
    throw new Error(constants.MESSAGE.VISIT.INVALID_CHECK_OUT);
  }

  visit.checkOutAt = now;
  visit.checkOutMethod = payload.method || 'Mobile App';
  visit.checkOutLat = payload.lat ?? null;
  visit.checkOutLng = payload.lng ?? null;
  visit.notes = payload.notes || visit.notes || '';
  // Late visits stay Exception (red for agency) but are fully ended via checkOutAt.
  visit.status = visit.lateCheckIn ? 'Exception' : 'Completed';
  visit.approvalStatus = 'Pending';
  visit.approvedBy = null;
  visit.approvedByName = '';
  visit.approvedAt = null;
  visit.rejectionReason = '';
  visit.approvalNotes = '';
  await visit.save();
  return formatVisit(visit);
};

const resolveReviewerName = (account) => {
  if (!account) return '';
  return account.name
    || `${account.firstName || ''} ${account.lastName || ''}`.trim()
    || account.email
    || 'Agency reviewer';
};

const assertPendingEndedVisit = (visit) => {
  if (!visit) throw new Error(constants.MESSAGE.VISIT.NOT_FOUND);
  if (!visit.checkOutAt) throw new Error(constants.MESSAGE.VISIT.INVALID_APPROVAL);
  const status = visit.approvalStatus || (visit.checkOutAt ? 'Pending' : 'None');
  if (status === 'Approved' || status === 'Rejected') {
    throw new Error(constants.MESSAGE.VISIT.ALREADY_REVIEWED);
  }
  if (status !== 'Pending' && status !== 'None') {
    throw new Error(constants.MESSAGE.VISIT.INVALID_APPROVAL);
  }
};

const approveVisit = async (req, visitId, payload = {}) => {
  const agencyId = getAgencyId(req);
  const reviewer = getAgencyAccount(req);
  const visit = await Model.VisitModel.findOne({ _id: visitId, agencyId });
  assertPendingEndedVisit(visit);

  visit.approvalStatus = 'Approved';
  visit.approvedBy = reviewer?._id || reviewer?.id || null;
  visit.approvedByName = resolveReviewerName(reviewer);
  visit.approvedAt = new Date();
  visit.rejectionReason = '';
  visit.approvalNotes = payload.notes || '';
  await visit.save();
  return formatVisit(visit);
};

const rejectVisit = async (req, visitId, payload = {}) => {
  const agencyId = getAgencyId(req);
  const reviewer = getAgencyAccount(req);
  const visit = await Model.VisitModel.findOne({ _id: visitId, agencyId });
  assertPendingEndedVisit(visit);

  visit.approvalStatus = 'Rejected';
  visit.approvedBy = reviewer?._id || reviewer?.id || null;
  visit.approvedByName = resolveReviewerName(reviewer);
  visit.approvedAt = new Date();
  visit.rejectionReason = payload.reason || 'Rejected by agency';
  visit.approvalNotes = payload.notes || '';
  await visit.save();
  return formatVisit(visit);
};

const regenerateScheduleVisits = async (req, id) => {
  const agencyId = getAgencyId(req);
  const schedule = await Model.VisitScheduleModel.findOne({ _id: id, agencyId });
  if (!schedule) throw new Error(constants.MESSAGE.VISIT.SCHEDULE_NOT_FOUND);
  const generated = await generateVisitsForSchedule(schedule);
  return { schedule: formatSchedule(schedule), generated_visits: generated.created };
};

const formatDurationLabel = (totalMinutes) => {
  const mins = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}h ${pad2(m)}m`;
};

const parseRange = (query = {}, defaultDays = 7) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let to = query.to ? new Date(`${query.to}T12:00:00`) : new Date(today);
  let from = query.from ? new Date(`${query.from}T12:00:00`) : new Date(today);
  if (!query.from) {
    from.setDate(to.getDate() - (defaultDays - 1));
  }
  if (Number.isNaN(from.getTime())) from = new Date(today);
  if (Number.isNaN(to.getTime())) to = new Date(today);
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  return {
    fromKey: toDateKey(from),
    toKey: toDateKey(to),
    from,
    to,
  };
};

const previousRange = (from, to) => {
  const days = Math.round((to - from) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { fromKey: toDateKey(prevFrom), toKey: toDateKey(prevTo) };
};

const classifyVisit = (visit) => {
  if (visit.status === 'Cancelled') return 'cancelled';
  if (visit.status === 'Missed') return 'missed';
  if (visit.checkOutAt) {
    const approval = visit.approvalStatus || 'Pending';
    if (approval === 'Rejected') return 'rejected';
    if (approval === 'Approved') {
      return visit.lateCheckIn || visit.status === 'Exception' ? 'exception' : 'verified';
    }
    return 'pending_approval';
  }
  if (visit.lateCheckIn || visit.status === 'Exception') return 'exception';
  if (visit.status === 'Completed') return 'pending_approval';
  if (visit.status === 'InProgress') return 'in_progress';
  return 'unverified';
};

const trendLabel = (current, previous) => {
  if (!previous && !current) return 'No change vs prior period';
  if (!previous) return current > 0 ? '+100% vs prior period' : 'No prior data';
  const diff = ((current - previous) / previous) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(0)}% vs prior period`;
};

const avgDurationMinutes = (visits) => {
  const timed = visits.filter((v) => v.checkInAt && v.checkOutAt);
  if (!timed.length) return 0;
  const total = timed.reduce((sum, v) => {
    const ms = new Date(v.checkOutAt) - new Date(v.checkInAt);
    return sum + (ms > 0 ? ms / 60000 : 0);
  }, 0);
  return total / timed.length;
};

const summarizeVisits = (visits) => {
  const summary = {
    total: 0,
    verified: 0,
    exceptions: 0,
    missed: 0,
    unverified: 0,
    in_progress: 0,
    pending_approval: 0,
    rejected: 0,
    cancelled: 0,
  };
  visits.forEach((visit) => {
    const bucket = classifyVisit(visit);
    if (bucket === 'cancelled') {
      summary.cancelled += 1;
      return;
    }
    summary.total += 1;
    if (bucket === 'verified') summary.verified += 1;
    else if (bucket === 'exception') summary.exceptions += 1;
    else if (bucket === 'missed') summary.missed += 1;
    else if (bucket === 'pending_approval') {
      summary.pending_approval += 1;
      summary.unverified += 1;
    } else if (bucket === 'rejected') {
      summary.rejected += 1;
      summary.exceptions += 1;
    } else if (bucket === 'in_progress') {
      summary.in_progress += 1;
      summary.unverified += 1;
    } else summary.unverified += 1;
  });
  return summary;
};

const getEvvDashboard = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  await markMissedVisits(agencyId);

  const { fromKey, toKey, from, to } = parseRange(query, 7);
  const prev = previousRange(from, to);

  const [visits, prevVisits, enrollments] = await Promise.all([
    Model.VisitModel.find({
      agencyId,
      scheduledDate: { $gte: fromKey, $lte: toKey },
    }),
    Model.VisitModel.find({
      agencyId,
      scheduledDate: { $gte: prev.fromKey, $lte: prev.toKey },
    }),
    Model.EvvEnrollmentModel.find({ agencyId }),
  ]);

  const current = summarizeVisits(visits);
  const previous = summarizeVisits(prevVisits);
  const avgMins = avgDurationMinutes(visits);
  const prevAvgMins = avgDurationMinutes(prevVisits);
  const verifiedPct = current.total ? Number(((current.verified / current.total) * 100).toFixed(1)) : 0;
  const complianceDenom = current.verified + current.exceptions + current.missed;
  const compliancePct = complianceDenom
    ? Number(((current.verified / complianceDenom) * 100).toFixed(1))
    : 100;

  const statusCounts = {
    Verified: current.verified,
    'Pending Approval': current.pending_approval,
    Exceptions: current.exceptions,
    Unverified: Math.max(0, current.unverified - current.pending_approval),
    Missed: current.missed,
  };
  const statusColors = {
    Verified: '#22c55e',
    'Pending Approval': '#f59e0b',
    Exceptions: '#ef4444',
    Unverified: '#ec4899',
    Missed: '#f97316',
  };
  const verification_status = Object.entries(statusCounts).map(([label, count]) => ({
    label,
    count,
    pct: current.total ? Number(((count / current.total) * 100).toFixed(1)) : 0,
    color: statusColors[label],
  }));

  const methodMap = {};
  visits.forEach((visit) => {
    if (!visit.checkInAt && !visit.checkOutAt) return;
    const method = visit.checkInMethod || visit.checkOutMethod || 'Mobile App';
    methodMap[method] = (methodMap[method] || 0) + 1;
  });
  const methodTotal = Object.values(methodMap).reduce((a, b) => a + b, 0) || 1;
  const methodColors = ['#3b82f6', '#8b5cf6', '#14b8a6', '#64748b', '#f59e0b'];
  const verification_methods = Object.entries(methodMap).map(([label, count], idx) => ({
    label,
    count,
    pct: Number(((count / methodTotal) * 100).toFixed(1)),
    color: methodColors[idx % methodColors.length],
  }));

  const enrollment = {
    total: enrollments.length,
    pending: enrollments.filter((e) => e.status === 'Pending').length,
    submitted: enrollments.filter((e) => e.status === 'Submitted').length,
    verified: enrollments.filter((e) => e.status === 'Verified').length,
    rejected: enrollments.filter((e) => e.status === 'Rejected').length,
  };

  const rangeLabel = `${from.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${to.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return {
    range: { from: fromKey, to: toKey, label: rangeLabel },
    overview: {
      total_visits: current.total,
      verified_visits: current.verified,
      exceptions: current.exceptions,
      missed: current.missed,
      unverified_visits: current.unverified,
      pending_approval: current.pending_approval,
      rejected: current.rejected,
      avg_duration: formatDurationLabel(avgMins),
      avg_duration_minutes: Math.round(avgMins),
      verified_pct: verifiedPct,
      trends: {
        total_visits: trendLabel(current.total, previous.total),
        total_visits_up: current.total >= previous.total,
        exceptions: trendLabel(current.exceptions, previous.exceptions),
        exceptions_up: current.exceptions <= previous.exceptions,
        unverified: trendLabel(current.unverified, previous.unverified),
        unverified_up: current.unverified <= previous.unverified,
        avg_duration: trendLabel(Math.round(avgMins), Math.round(prevAvgMins)),
        avg_duration_up: avgMins >= prevAvgMins,
      },
    },
    verification_status,
    verification_methods,
    compliance: {
      percent: compliancePct,
      goal: 90,
    },
    enrollment,
    recent_visits: visits.map(formatVisit),
  };
};

const startOfWeekMonday = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const visitMinutes = (visit) => {
  if (visit.checkInAt && visit.checkOutAt) {
    const ms = new Date(visit.checkOutAt) - new Date(visit.checkInAt);
    return ms > 0 ? ms / 60000 : 0;
  }
  if (visit.scheduledStartAt && visit.scheduledEndAt) {
    const ms = new Date(visit.scheduledEndAt) - new Date(visit.scheduledStartAt);
    return ms > 0 ? ms / 60000 : 0;
  }
  return 0;
};

const displayVisitStatus = (visit) => {
  if (visit.checkOutAt) {
    const approval = visit.approvalStatus || 'Pending';
    if (approval === 'Approved') return visit.lateCheckIn ? 'Approved (Late)' : 'Verified';
    if (approval === 'Rejected') return 'Rejected';
    return visit.lateCheckIn ? 'Pending (Late)' : 'Pending Approval';
  }
  if (visit.status === 'InProgress') return 'In Progress';
  if (visit.lateCheckIn && visit.checkInAt) return 'Late / In Progress';
  return visit.status;
};

const getCaregiverDashboard = async (req) => {
  const caregiver = getCaregiverAccount(req);
  const agencyId = getCaregiverAgencyId(req);
  const caregiverId = caregiver._id || caregiver.id;
  await markMissedVisits(agencyId);

  const todayKey = toDateKey(new Date());
  const weekStart = startOfWeekMonday(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekFrom = toDateKey(weekStart);
  const weekTo = toDateKey(weekEnd);

  const [todayVisits, weekVisits, enrollments] = await Promise.all([
    Model.VisitModel.find({
      agencyId,
      caregiverAccountId: caregiverId,
      scheduledDate: todayKey,
    }).sort({ scheduledStartAt: 1 }),
    Model.VisitModel.find({
      agencyId,
      caregiverAccountId: caregiverId,
      scheduledDate: { $gte: weekFrom, $lte: weekTo },
    }).sort({ scheduledStartAt: 1 }),
    Model.EvvEnrollmentModel.find({
      agencyId,
      caregiverAccountId: caregiverId,
    }),
  ]);

  const todayCompleted = todayVisits.filter((v) => v.status === 'Completed' || (v.status === 'Exception' && v.checkOutAt)).length;
  const todayInProgress = todayVisits.filter((v) => ['InProgress', 'Exception'].includes(v.status) && v.checkInAt && !v.checkOutAt);
  const todayUpcoming = todayVisits.filter((v) => ['Scheduled', 'Late', 'Missed'].includes(v.status) && !v.checkInAt).length;

  const weekMinutesWorked = weekVisits.reduce((sum, v) => {
    if (v.checkInAt && v.checkOutAt) return sum + visitMinutes(v);
    if (['InProgress', 'Exception'].includes(v.status) && v.checkInAt && !v.checkOutAt) {
      const ms = Date.now() - new Date(v.checkInAt).getTime();
      return sum + (ms > 0 ? ms / 60000 : 0);
    }
    return sum;
  }, 0);

  const goalHours = 40;
  const hoursCurrent = weekMinutesWorked / 60;
  const hoursPercent = Math.min(100, Math.round((hoursCurrent / goalHours) * 100));

  const weekClassified = summarizeVisits(weekVisits);
  const complianceDenom = weekClassified.verified + weekClassified.exceptions + weekClassified.missed;
  const compliancePct = complianceDenom
    ? Number(((weekClassified.verified / complianceDenom) * 100).toFixed(1))
    : (weekVisits.length ? 100 : 100);

  const hourlyRate = Number(caregiver.hourlyRate) || 25;
  const estimatedPay = (weekMinutesWorked / 60) * hourlyRate;

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyHours = dayLabels.map((day, idx) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + idx);
    const key = toDateKey(d);
    const mins = weekVisits
      .filter((v) => v.scheduledDate === key)
      .reduce((sum, v) => sum + (v.checkInAt && v.checkOutAt ? visitMinutes(v) : 0), 0);
    return { day, hours: Number((mins / 60).toFixed(2)), date: key };
  });

  const active = todayInProgress[0] || weekVisits.find((v) => ['InProgress', 'Exception'].includes(v.status) && v.checkInAt && !v.checkOutAt) || null;
  let activeClock = null;
  if (active) {
    const sinceMs = Date.now() - new Date(active.checkInAt).getTime();
    activeClock = {
      clocked_in: true,
      visit_id: String(active._id),
      client: active.clientName || '',
      since: new Date(active.checkInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      service: active.serviceArea || '',
      duration: formatDurationLabel(sinceMs / 60000),
      late: Boolean(active.lateCheckIn),
    };
  }

  const today_schedule = todayVisits.map((v) => ({
    id: String(v._id),
    time: `${new Date(v.scheduledStartAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${new Date(v.scheduledEndAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    client: v.clientName || '',
    service: v.serviceArea || '',
    address: v.address || '',
    status: displayVisitStatus(v),
    late_check_in: Boolean(v.lateCheckIn),
    check_out_at: v.checkOutAt || null,
  }));

  const alerts = [];
  todayVisits.filter((v) => v.status === 'Missed').forEach((v) => {
    alerts.push({
      id: `missed-${v._id}`,
      type: 'Missed Visit',
      text: `${v.clientName || 'Client'} visit was missed (past grace + 1 hour).`,
      time: 'Today',
      tone: 'warning',
    });
  });
  todayVisits.filter((v) => v.lateCheckIn).forEach((v) => {
    alerts.push({
      id: `late-${v._id}`,
      type: 'Late Check-in',
      text: `${v.clientName || 'Client'} was clocked in after the grace window.`,
      time: v.checkInAt
        ? new Date(v.checkInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
        : 'Today',
      tone: 'warning',
    });
  });
  const pendingEnroll = enrollments.filter((e) => ['Pending', 'Submitted', 'Rejected'].includes(e.status));
  pendingEnroll.slice(0, 2).forEach((e) => {
    alerts.push({
      id: `enroll-${e._id}`,
      type: 'EVV Enrollment',
      text: `Enrollment is ${e.status}. Complete verification to clock in.`,
      time: 'Action needed',
      tone: e.status === 'Rejected' ? 'warning' : 'info',
    });
  });

  const nextUpcoming = todayVisits.find((v) => ['Scheduled', 'Late'].includes(v.status) && !v.checkInAt);
  if (nextUpcoming) {
    alerts.unshift({
      id: `upcoming-${nextUpcoming._id}`,
      type: 'Upcoming Visit',
      text: `${nextUpcoming.clientName || 'Client'} at ${new Date(nextUpcoming.scheduledStartAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
      time: 'Today',
      tone: 'info',
    });
  }

  return {
    caregiver_name: caregiver.name || `${caregiver.firstName || ''} ${caregiver.lastName || ''}`.trim() || 'Caregiver',
    kpis: {
      today_visits: {
        total: todayVisits.length,
        completed: todayCompleted,
        upcoming: todayUpcoming,
        in_progress: todayInProgress.length,
      },
      hours_this_week: {
        current: formatDurationLabel(weekMinutesWorked),
        current_hours: Number(hoursCurrent.toFixed(2)),
        goal: `${goalHours}h`,
        goal_hours: goalHours,
        percent: hoursPercent,
      },
      upcoming_pay: {
        amount: `$${estimatedPay.toFixed(2)}`,
        pay_date: 'Est. from hours',
        note: `Based on ${formatDurationLabel(weekMinutesWorked)} @ $${hourlyRate}/hr`,
      },
      evv_compliance: {
        percent: compliancePct,
        period: 'This Week',
      },
    },
    today_schedule,
    active_clock: activeClock || { clocked_in: false },
    alerts: alerts.slice(0, 6),
    weekly_hours: weeklyHours,
    weekly_summary: {
      total_hours: formatDurationLabel(weekMinutesWorked),
      total_visits: weekVisits.length,
      completed_visits: weekVisits.filter((v) => v.status === 'Completed' || (v.checkOutAt && v.status === 'Exception')).length,
    },
    enrollment: {
      total: enrollments.length,
      pending: enrollments.filter((e) => e.status === 'Pending').length,
      submitted: enrollments.filter((e) => e.status === 'Submitted').length,
      verified: enrollments.filter((e) => e.status === 'Verified').length,
      rejected: enrollments.filter((e) => e.status === 'Rejected').length,
    },
  };
};

module.exports = {
  getOptions,
  getScheduleStats,
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  removeSchedule,
  getVisits,
  getCarePlanScheduleSources,
  getCaregiverVisits,
  checkInVisit,
  checkOutVisit,
  approveVisit,
  rejectVisit,
  regenerateScheduleVisits,
  generateVisitsForSchedule,
  getEvvDashboard,
  getCaregiverDashboard,
};
