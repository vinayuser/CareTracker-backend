const mongoose = require('mongoose');
const { VISIT_STATUSES, VISIT_APPROVAL_STATUSES } = require('../common/visitScheduleConstants');

const ClockLogSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['clock-in', 'clock-out'], required: true },
    at: { type: Date, required: true },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const ExceptionAuditSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    byAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
    byName: { type: String, default: '' },
    action: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false },
);

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
    /** Optional home coords for geofence (copied from client when available). */
    addressLat: { type: Number, default: null },
    addressLng: { type: Number, default: null },
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

    // Server-authoritative timer (ShiftNPay-style)
    isTimerRunning: { type: Boolean, default: false, index: true },
    lastSegmentStartAt: { type: Date, default: null },
    elapsedSeconds: { type: Number, default: 0 },
    billableSeconds: { type: Number, default: 0 },
    billableMinutes: { type: Number, default: 0 },
    clockLogs: { type: [ClockLogSchema], default: [] },

    // Billing snapshots
    hourlyRateSnapshot: { type: Number, default: null },
    amountSnapshot: { type: Number, default: null },
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientInvoice', default: null, index: true },
    invoiced: { type: Boolean, default: false, index: true },

    // Geo audit
    geoDistanceMeters: { type: Number, default: null },
    geoWithinFence: { type: Boolean, default: null },
    geoWarning: { type: String, default: '' },

    // Exception resolution audit
    exceptionResolved: { type: Boolean, default: false },
    exceptionResolutionNote: { type: String, default: '' },
    exceptionAudit: { type: [ExceptionAuditSchema], default: [] },

    // Medicaid / export-friendly identifiers (optional)
    medicaidId: { type: String, default: '' },
    serviceCode: { type: String, default: '' },

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
VisitSchema.index({ agencyId: 1, caregiverAccountId: 1, isTimerRunning: 1 });

module.exports = mongoose.model('Visit', VisitSchema);
