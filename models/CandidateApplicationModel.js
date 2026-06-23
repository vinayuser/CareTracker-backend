const mongoose = require('mongoose');

const CandidateApplicationSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true },
    jobPostId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobPost', required: true },
    agencyStageId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyStage' },
    status: { type: String, enum: ['Active', 'Rejected', 'Hired'], default: 'Active' },
    appliedAt: { type: Date, default: Date.now },
    caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
    rejectedAt: { type: Date },
  },
  { timestamps: true },
);

CandidateApplicationSchema.index({ candidateId: 1, jobPostId: 1 }, { unique: true });

module.exports = mongoose.model('CandidateApplication', CandidateApplicationSchema);
