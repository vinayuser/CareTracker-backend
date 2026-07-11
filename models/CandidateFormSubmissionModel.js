const mongoose = require('mongoose');

const CandidateFormSubmissionSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CandidateApplication', required: true, index: true },
    stageId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyStage', required: true },
    stageAccessId: { type: mongoose.Schema.Types.ObjectId, ref: 'CandidateStageAccess' },
    documentCode: { type: String, required: true },
    documentName: { type: String, required: true },
    status: {
      type: String,
      enum: ['NotStarted', 'Draft', 'Submitted'],
      default: 'NotStarted',
    },
    formData: { type: mongoose.Schema.Types.Mixed, default: {} },
    filledPdfPath: { type: String, default: '' },
    submittedAt: { type: Date },
  },
  { timestamps: true },
);

CandidateFormSubmissionSchema.index(
  { applicationId: 1, stageId: 1, documentCode: 1 },
  { unique: true },
);

module.exports = mongoose.model('CandidateFormSubmission', CandidateFormSubmissionSchema);
