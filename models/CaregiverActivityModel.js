const mongoose = require('mongoose');

const CaregiverActivitySchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now, index: true },
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', index: true },
    agencyName: { type: String, default: '' },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount', index: true },
    caregiverName: { type: String, default: '' },
    activityType: { type: String, default: '' },
    action: { type: String, default: '' },
    activity: { type: String, default: '' },
    related: { type: String, default: '' },
    detail: { type: String, default: '' },
    status: { type: String, default: 'Recorded' },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
  },
  { timestamps: true },
);

CaregiverActivitySchema.index({ agencyId: 1, at: -1 });

module.exports = mongoose.model('CaregiverActivity', CaregiverActivitySchema);
