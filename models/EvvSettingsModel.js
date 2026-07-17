const mongoose = require('mongoose');

const EvvSettingsSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      unique: true,
      index: true,
    },
    vendorName: { type: String, default: '' },
    complianceGoalPercent: { type: Number, default: 90 },
    defaultGraceMinutes: { type: Number, default: 15 },
    geoRadiusMeters: { type: Number, default: 500 },
    /** off | warn | block */
    geoEnforcement: {
      type: String,
      enum: ['off', 'warn', 'block'],
      default: 'warn',
    },
    allowedMethods: {
      type: [String],
      default: ['Mobile App (GPS)', 'Telephony (IVR)', 'Web Portal', 'Manual Entry'],
    },
    medicaidExportEnabled: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('EvvSettings', EvvSettingsSchema);
