const mongoose = require('mongoose');

const BalanceItemSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    allocated: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
  },
  { _id: false },
);

const CaregiverLeaveBalanceSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', required: true, index: true },
    year: { type: Number, required: true, index: true },
    items: { type: [BalanceItemSchema], default: [] },
  },
  { timestamps: true },
);

CaregiverLeaveBalanceSchema.index({ agencyId: 1, caregiverAccountId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('CaregiverLeaveBalance', CaregiverLeaveBalanceSchema);
