const mongoose = require('mongoose');

const CandidateStageAccessSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CandidateApplication', required: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    jobPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPost', required: true },
    stageId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyStage', required: true },
    token: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ['Active', 'Expired', 'Completed'],
      default: 'Active',
    },
    emailSentAt: { type: Date },
    lastOpenedAt: { type: Date },
    expiresAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

CandidateStageAccessSchema.index({ applicationId: 1, stageId: 1 });

module.exports = mongoose.model('CandidateStageAccess', CandidateStageAccessSchema);
