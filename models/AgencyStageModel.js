const mongoose = require('mongoose');

const StageDocumentSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    code: { type: String, required: true },
    name: { type: String, required: true },
    isRequired: { type: Boolean, default: true },
    order: { type: Number, required: true },
  },
  { _id: false },
);

const AgencyStageSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['hiring', 'onboarding', 'custom'],
      default: 'hiring',
    },
    stageOrder: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    documents: { type: [StageDocumentSchema], default: [] },
  },
  { timestamps: true },
);

AgencyStageSchema.index({ agencyId: 1, stageOrder: 1 });

module.exports = mongoose.model('AgencyStage', AgencyStageSchema);
