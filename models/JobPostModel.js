const mongoose = require('mongoose');

const JobPostSchema = new mongoose.Schema(
  {
    agencyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agency', required: true, index: true },
    jobTitle: { type: String, required: true },
    jobCode: { type: String, required: true },
    jobWorkplace: { type: String, enum: ['onsite', 'hybrid', 'remote'], required: true },
    jobLocation: { type: String, required: true },
    description: { type: String, default: '' },
    requirements: { type: String, default: '' },
    benefits: { type: String, default: '' },
    jobDepartment: { type: String, default: '' },
    jobFunction: { type: String, default: '' },
    employmentType: { type: String, default: '' },
    experience: { type: String, default: '' },
    education: { type: String, default: '' },
    keywords: { type: String, default: '' },
    fromSalary: { type: Number, default: 0 },
    toSalary: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
    showOnCareerPage: { type: Boolean, default: true },
    stageIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AgencyStage' }],
    status: { type: String, enum: ['Active', 'Closed', 'Draft'], default: 'Active' },
    hiringStatus: { type: String, enum: ['Open', 'Complete'], default: 'Open' },
    hiredBindings: [{
      applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'CandidateApplication' },
      candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate' },
      caregiverAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
      boundAt: { type: Date, default: Date.now },
    }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AgencyAccount' },
  },
  { timestamps: true },
);

JobPostSchema.index({ agencyId: 1, jobCode: 1 }, { unique: true });

module.exports = mongoose.model('JobPost', JobPostSchema);
