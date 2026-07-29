const mongoose = require('mongoose');

const CarePlanHistorySchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    carePlanId: { type: mongoose.Schema.Types.ObjectId, ref: 'CarePlan', required: true, index: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
    version: { type: String, required: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    createdByAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

CarePlanHistorySchema.index({ carePlanId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model('CarePlanHistory', CarePlanHistorySchema);
