const mongoose = require('mongoose');
const {
  RECURRENCE_TYPES,
  GRACE_MINUTES,
  WEEK_DAYS,
  SCHEDULE_STATUSES,
} = require('../common/visitScheduleConstants');

const VisitScheduleSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    scheduleCode: { type: String, required: true },
    carePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', required: true, index: true },
    serviceArea: { type: String, default: '' },
    careNeedAreaKey: { type: String, default: '' },
    clientName: { type: String, default: '' },
    caregiverName: { type: String, default: '' },
    planCode: { type: String, default: '' },
    recurrenceType: { type: String, enum: RECURRENCE_TYPES, required: true },
    daysOfWeek: [{ type: String, enum: WEEK_DAYS }],
    dayOfMonth: { type: Number, min: 1, max: 31, default: null },
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true },
    graceMinutes: { type: Number, enum: GRACE_MINUTES, default: 15 },
    timezone: { type: String, default: 'America/New_York' },
    effectiveFrom: { type: String, required: true }, // YYYY-MM-DD
    effectiveTo: { type: String, default: '' },
    status: { type: String, enum: SCHEDULE_STATUSES, default: 'Active' },
    notes: { type: String, default: '' },
    address: { type: String, default: '' },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

VisitScheduleSchema.index({ agencyId: 1, scheduleCode: 1 }, { unique: true });
VisitScheduleSchema.index({ agencyId: 1, caregiverAccountId: 1, status: 1 });

module.exports = mongoose.model('VisitSchedule', VisitScheduleSchema);
