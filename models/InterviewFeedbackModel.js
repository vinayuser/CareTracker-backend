const mongoose = require('mongoose');

const InterviewFeedbackSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CandidateApplication', required: true },
    stageId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyStage', required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
    jobPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPost' },
    status: { type: String, enum: ['Draft', 'Submitted'], default: 'Draft' },
    formData: { type: mongoose.Schema.Types.Mixed, default: {} },
    authorAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
    submittedAt: { type: Date },
  },
  { timestamps: true },
);

InterviewFeedbackSchema.index({ applicationId: 1, stageId: 1 }, { unique: true });

module.exports = mongoose.model('InterviewFeedback', InterviewFeedbackSchema);
