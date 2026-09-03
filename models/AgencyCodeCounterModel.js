const mongoose = require('mongoose');

/**
 * Persistent per-agency sequence so business codes (LD-*, ASM-*, …) never
 * reuse a number after the related document is deleted.
 */
const AgencyCodeCounterSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true },
    key: { type: String, required: true },
    lastNumber: { type: Number, required: true, default: 10000 },
  },
  { timestamps: true },
);

AgencyCodeCounterSchema.index({ agencyId: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('AgencyCodeCounter', AgencyCodeCounterSchema);
