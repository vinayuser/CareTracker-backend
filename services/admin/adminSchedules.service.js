const mongoose = require('mongoose');
const Model = require('../../models/index');
const { buildUploadUrl } = require('../../common/candidateHelpers');
const { notArchivedFilter } = require('../../common/agencyVisibility');
const { CARE_OVERVIEW_CATEGORIES } = require('../../common/carePlanConstants');

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) return new mongoose.Types.ObjectId(String(value));
  return null;
};

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

const serviceLabel = (key) =>
  CARE_OVERVIEW_CATEGORIES.find((item) => item.key === key)?.label || key || 'Visit';

const minutesFromMidnight = (value, timeZone = 'America/New_York') => {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return (hour === 24 ? 0 : hour) * 60 + minute;
};

/**
 * Visits for one caregiver in a date range — powers admin Schedules calendar.
 */
const getCaregiverSchedule = async (query = {}, req = null) => {
  const agencyOid = toOid(query.agencyId);
  const caregiverOid = toOid(query.caregiverId || query.caregiver_id);
  if (!agencyOid) throw new Error('Agency is required');
  if (!caregiverOid) throw new Error('Caregiver is required');

  const agency = await Model.AgencyModel.findOne({
    _id: agencyOid,
    ...notArchivedFilter(),
  }).select('name').lean();
  if (!agency) throw new Error('Agency not found');

  const caregiver = await Model.AgencyAccountModel.findOne({
    _id: caregiverOid,
    agencyId: agencyOid,
    role: 'CAREGIVER',
  }).select('fullName email phone status profilePicPath employeeId').lean();
  if (!caregiver) throw new Error('Caregiver not found');

  const from = String(query.from || '').slice(0, 10);
  const to = String(query.to || '').slice(0, 10);
  if (!from || !to) throw new Error('from and to dates are required (YYYY-MM-DD)');

  const visits = await Model.VisitModel.find({
    agencyId: agencyOid,
    caregiverAccountId: caregiverOid,
    scheduledDate: { $gte: from, $lte: to },
    status: { $nin: ['Cancelled'] },
  })
    .sort({ scheduledStartAt: 1 })
    .lean();

  const profilePic = caregiver.profilePicPath
    ? buildUploadUrl(caregiver.profilePicPath, req)
    : '';

  return {
    caregiver: {
      id: String(caregiver._id),
      name: caregiver.fullName || 'Caregiver',
      email: caregiver.email || '',
      phone: caregiver.phone || '',
      status: caregiver.status || 'Active',
      profilePic,
      agencyId: String(agencyOid),
      agencyName: agency.name || '',
    },
    range: { from, to },
    visits: visits.map((visit) => {
      const tz = visit.timezone || 'America/New_York';
      return {
        id: String(visit._id),
        visitCode: visit.visitCode || '',
        clientId: visit.clientId ? String(visit.clientId) : '',
        clientName: visit.clientName || 'Client',
        service: serviceLabel(visit.serviceArea) || visit.serviceArea || 'Visit',
        scheduledDate: visit.scheduledDate,
        scheduledStartAt: visit.scheduledStartAt,
        scheduledEndAt: visit.scheduledEndAt,
        startTime: formatClock(visit.scheduledStartAt, tz),
        endTime: formatClock(visit.scheduledEndAt, tz),
        startMinutes: minutesFromMidnight(visit.scheduledStartAt, tz),
        endMinutes: minutesFromMidnight(visit.scheduledEndAt, tz),
        status: visit.status,
        address: visit.address || '',
        timezone: tz,
      };
    }),
  };
};

module.exports = {
  getCaregiverSchedule,
};
