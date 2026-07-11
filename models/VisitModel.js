const mongoose = require('mongoose');
const { VISIT_STATUSES, VISIT_APPROVAL_STATUSES } = require('../common/visitScheduleConstants');

const VisitSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    visitCode: { type: String, required: true },
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'VisitSchedule', required: true, index: true },
    carePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', required: true, index: true },
    serviceArea: { type: String, default: '' },
    clientName: { type: String, default: '' },
    caregiverName: { type: String, default: '' },
    address: { type: String, default: '' },
    scheduledDate: { type: String, required: true, index: true }, // YYYY-MM-DD
    scheduledStartAt: { type: Date, required: true, index: true },
    scheduledEndAt: { type: Date, required: true },
    earliestCheckInAt: { type: Date, required: true },
    latestCheckInAt: { type: Date, required: true },
    /** Absolute last moment to clock in (grace end + late extra hour). */
    lateCheckInUntil: { type: Date, default: null },
    graceMinutes: { type: Number, default: 15 },
    status: { type: String, enum: VISIT_STATUSES, default: 'Scheduled', index: true },
    checkInAt: { type: Date, default: null },
    checkOutAt: { type: Date, default: null },
    checkInMethod: { type: String, default: '' },
    checkOutMethod: { type: String, default: '' },
    checkInLat: { type: Number, default: null },
    checkInLng: { type: Number, default: null },
    checkOutLat: { type: Number, default: null },
    checkOutLng: { type: Number, default: null },
    lateCheckIn: { type: Boolean, default: false },
    exceptionReason: { type: String, default: '' },
    notes: { type: String, default: '' },
    approvalStatus: {
      type: String,
      enum: VISIT_APPROVAL_STATUSES,
      default: 'None',
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
    approvedByName: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    approvalNotes: { type: String, default: '' },
  },
  { timestamps: true },
);

VisitSchema.index({ agencyId: 1, visitCode: 1 }, { unique: true });
VisitSchema.index(
  { scheduleId: 1, scheduledDate: 1 },
  { unique: true },
);
VisitSchema.index({ agencyId: 1, caregiverAccountId: 1, scheduledDate: 1 });

module.exports = mongoose.model('Visit', VisitSchema);
