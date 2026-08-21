const mongoose = require('mongoose');
const { LEAVE_REQUEST_STATUSES } = require('../common/leaveConstants');

const LeaveRequestSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', required: true, index: true },
    caregiverName: { type: String, default: '' },
    typeKey: { type: String, required: true },
    typeName: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    dates: { type: [String], default: [] },
    days: { type: Number, required: true, min: 0 },
    reason: { type: String, default: '' },
    status: { type: String, enum: LEAVE_REQUEST_STATUSES, default: 'Pending', index: true },
    reviewedByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
    reviewedByName: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: '' },
  },
  { timestamps: true },
);

LeaveRequestSchema.index({ agencyId: 1, caregiverAccountId: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('LeaveRequest', LeaveRequestSchema);
