const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { getAgencyStagesForJob } = require('./jobPost.service');
const {
  INTERVIEW_SKILLS,
  FINAL_RECOMMENDATIONS,
  RATING_SCALE,
} = require('../../common/interviewFeedbackConstants');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const getAccountId = (req) => {
  const account = getAgencyAccount(req);
  return account?._id || account?.id || null;
};

const emptySkillRatings = () =>
  INTERVIEW_SKILLS.reduce((acc, skill) => {
    acc[skill] = { rating: null, remarks: '' };
    return acc;
  }, {});

const buildDefaultFormData = ({ candidate, job, stageName }) => ({
  candidateName: candidate
    ? `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim()
    : '',
  positionApplied: job?.jobTitle || 'Caregiver',
  interviewDate: '',
  experience: candidate?.experience != null ? String(candidate.experience) : '',
  recruiter: '',
  location: candidate?.location || '',
  currentCtc: candidate?.currentCtc != null ? String(candidate.currentCtc) : '',
  expectedCtc: candidate?.expectedCtc != null ? String(candidate.expectedCtc) : '',
  noticePeriod: '',
  joiningAvailability: '',
  stageName: stageName || '',
  skillRatings: emptySkillRatings(),
  stageRemarks: '',
  authorizedSignature: '',
  overallScore: '',
  finalRecommendation: '',
  recommendedClientType: '',
  shift: '',
  trainingRequired: '',
  expectedJoining: '',
  finalComments: '',
});

const formatFeedback = (doc) => {
  if (!doc) return null;
  const client = functions.toClientDoc(doc);
  return {
    ...client,
    applicationId: String(doc.applicationId),
    stageId: String(doc.stageId),
    candidateId: doc.candidateId ? String(doc.candidateId) : null,
    jobPostId: doc.jobPostId ? String(doc.jobPostId) : null,
    authorAccountId: doc.authorAccountId ? String(doc.authorAccountId) : null,
  };
};

const getOptions = () => ({
  skills: INTERVIEW_SKILLS,
  recommendations: FINAL_RECOMMENDATIONS,
  rating_scale: RATING_SCALE,
});

const buildPipelineRounds = async (applicationId, job) => {
  const stages = await getAgencyStagesForJob(job);
  const feedbackRows = await Model.InterviewFeedbackModel.find({ applicationId });
  const byStage = {};
  feedbackRows.forEach((row) => {
    byStage[String(row.stageId)] = row;
  });

  return stages.map((stage, index) => {
    const fb = byStage[String(stage._id)];
    const formData = fb?.formData || {};
    return {
      round: index + 1,
      stage_id: String(stage._id),
      stage_name: stage.name,
      status: fb?.status || null,
      remarks: formData.stageRemarks || '',
      signature: formData.authorizedSignature || '',
      submitted_at: fb?.submittedAt || null,
      updated_at: fb?.updatedAt || null,
    };
  });
};

const getForApplicationStage = async (req, applicationId, stageId) => {
  const agencyId = getAgencyId(req);

  const application = await Model.CandidateApplicationModel.findOne({
    _id: applicationId,
    agencyId,
  })
    .populate('candidateId')
    .populate('jobPostId')
    .populate('agencyStageId');

  if (!application) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  const job = application.jobPostId;
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);

  const stage = stageId
    ? await Model.AgencyStageModel.findOne({ _id: stageId, agencyId })
    : application.agencyStageId;

  if (!stage) throw new Error(constants.MESSAGE.CANDIDATE.INVALID_STAGE);

  const resolvedStageId = stage._id || stage;
  const feedback = await Model.InterviewFeedbackModel.findOne({
    applicationId,
    stageId: resolvedStageId,
    agencyId,
  });

  const candidate = application.candidateId;
  const stageName = stage.name || application.agencyStageId?.name || '';
  const pipelineRounds = await buildPipelineRounds(application._id, job);
  const agency = await Model.AgencyModel.findById(agencyId).select('name');

  const base = {
    options: getOptions(),
    pipeline_rounds: pipelineRounds,
    application: {
      id: String(application._id),
      status: application.status,
    },
    stage: { id: String(resolvedStageId), name: stageName },
    candidate: candidate
      ? {
          id: String(candidate._id),
          first_name: candidate.firstName,
          last_name: candidate.lastName,
          email: candidate.email,
        }
      : null,
    job: { id: String(job._id), job_title: job.jobTitle },
    agency_name: agency?.name || '',
  };

  if (!feedback) {
    return {
      ...base,
      feedback: null,
      prefill: buildDefaultFormData({ candidate, job, stageName }),
    };
  }

  return {
    ...base,
    feedback: formatFeedback(feedback),
    prefill: null,
  };
};

const saveFeedback = async (req, applicationId, stageId, payload) => {
  const agencyId = getAgencyId(req);
  const application = await Model.CandidateApplicationModel.findOne({
    _id: applicationId,
    agencyId,
  });
  if (!application) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  const stage = await Model.AgencyStageModel.findOne({ _id: stageId, agencyId });
  if (!stage) throw new Error(constants.MESSAGE.CANDIDATE.INVALID_STAGE);

  const status = payload.status === 'Submitted' ? 'Submitted' : 'Draft';
  const formData = {
    ...(payload.form_data || {}),
    stageName: stage.name,
  };

  const feedback = await Model.InterviewFeedbackModel.findOneAndUpdate(
    { applicationId, stageId, agencyId },
    {
      $set: {
        agencyId,
        applicationId,
        stageId,
        candidateId: application.candidateId,
        jobPostId: application.jobPostId,
        formData,
        status,
        authorAccountId: getAccountId(req),
        ...(status === 'Submitted' ? { submittedAt: new Date() } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return formatFeedback(feedback);
};

const getPrintData = async (req, applicationId, stageId) => {
  const data = await getForApplicationStage(req, applicationId, stageId);
  const formData = data.feedback?.formData || data.feedback?.form_data || data.prefill || {};
  return {
    ...data,
    form: formData,
    feedback_status: data.feedback?.status || null,
  };
};

const enrichApplicationsWithFeedback = async (applications, stageId) => {
  if (!stageId || stageId === 'all' || !applications.length) return applications;

  const appIds = applications.map((a) => a.id || a._id);
  const rows = await Model.InterviewFeedbackModel.find({
    applicationId: { $in: appIds },
    stageId,
  }).select('applicationId status submittedAt updatedAt');

  const byApp = {};
  rows.forEach((row) => {
    byApp[String(row.applicationId)] = {
      status: row.status,
      submitted_at: row.submittedAt || null,
      updated_at: row.updatedAt || null,
    };
  });

  return applications.map((app) => ({
    ...app,
    interview_feedback: byApp[String(app.id || app._id)] || null,
  }));
};

module.exports = {
  getOptions,
  getForApplicationStage,
  saveFeedback,
  getPrintData,
  enrichApplicationsWithFeedback,
};
