const mongoose = require('mongoose');

const AgencyEmailMarketingSchema = new mongoose.Schema(
  {
    agencyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Agency',
      required: true,
      unique: true,
      index: true,
    },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    lists: { type: [mongoose.Schema.Types.Mixed], default: [] },
    tags: { type: [String], default: [] },
    segments: { type: [mongoose.Schema.Types.Mixed], default: [] },
    contacts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    templates: { type: [mongoose.Schema.Types.Mixed], default: [] },
    campaigns: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('AgencyEmailMarketing', AgencyEmailMarketingSchema);
