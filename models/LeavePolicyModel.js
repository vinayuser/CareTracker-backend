const mongoose = require('mongoose');

const LeaveTypeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true },
    days: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false },
);

const LeavePolicySchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, unique: true },
    types: { type: [LeaveTypeSchema], default: [] },
    updatedByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('LeavePolicy', LeavePolicySchema);
