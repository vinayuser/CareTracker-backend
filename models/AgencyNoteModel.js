const mongoose = require('mongoose');

const AgencyNoteSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    category: {
      type: String,
      enum: ['Onboarding', 'Billing', 'Operations', 'Compliance', 'Review', 'Other'],
      default: 'Other',
      index: true,
    },
    tags: [{ type: String }],
    isFavorite: { type: Boolean, default: false },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true },
);

AgencyNoteSchema.index({ agencyId: 1, createdAt: -1 });

module.exports = mongoose.model('AgencyNote', AgencyNoteSchema);
