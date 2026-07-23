const mongoose = require('mongoose');
const { EVV_ENROLLMENT_STATUSES } = require('../common/evvEnrollmentConstants');

const EvvEnrollmentSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    enrollmentCode: { type: String, required: true },
    status: { type: String, enum: EVV_ENROLLMENT_STATUSES, default: 'Pending' },
    enrollmentDate: { type: String, default: '' },
    carePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', required: true, index: true },
    /** Care-need area key (e.g. personalCare) — one enrollment per service assignment */
    serviceAreaKey: { type: String, default: '', index: true },
    planCode: { type: String, default: '' },
    clientName: { type: String, default: '' },
    caregiverName: { type: String, default: '' },
    serviceAreas: [{ type: String }],
    formData: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    submittedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null },
    verifiedByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

EvvEnrollmentSchema.index({ agencyId: 1, enrollmentCode: 1 }, { unique: true });
EvvEnrollmentSchema.index(
  { agencyId: 1, carePlanId: 1, caregiverAccountId: 1, serviceAreaKey: 1 },
  { unique: true },
);

module.exports = mongoose.model('EvvEnrollment', EvvEnrollmentSchema);
