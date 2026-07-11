const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { parseExperience, buildUploadUrl } = require('../../common/candidateHelpers');
const { getAgencyId, getAgencyStagesForJob } = require('./jobPost.service');
const CandidateFormService = require('./candidateForm.service');
const InterviewFeedbackService = require('./interviewFeedback.service');
const {
  sendCandidateApplicationEmail,
  sendCaregiverWelcomeEmail,
} = require('../common/mail.service');

const formatApplicationPopulated = (app) => {
  if (!app) return null;
  const base = formatApplication(app, {
    candidate: app.candidateId && typeof app.candidateId === 'object'
      ? formatCandidate(app.candidateId)
      : null,
    job: app.jobPostId && typeof app.jobPostId === 'object'
      ? { id: String(app.jobPostId._id), job_title: app.jobPostId.jobTitle }
      : null,
    stage: app.agencyStageId && typeof app.agencyStageId === 'object'
      ? { id: String(app.agencyStageId._id), name: app.agencyStageId.name, order: app.agencyStageId.stageOrder }
      : null,
  });
  return base;
};

const getJobStages = async (job) => getAgencyStagesForJob(job);

const resolveStageId = (ref) => String(ref?._id || ref || '');

const getStageInfo = async (applicationId, agencyId) => {
  const app = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId })
    .populate('agencyStageId');
  if (!app) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  const job = await Model.JobPostModel.findById(app.jobPostId);
  const stages = await getJobStages(job);
  const currentIndex = stages.findIndex((s) => String(s._id) === resolveStageId(app.agencyStageId));
  const nextStage = currentIndex >= 0 && currentIndex < stages.length - 1 ? stages[currentIndex + 1] : null;
  const previousStage = currentIndex > 0 ? stages[currentIndex - 1] : null;
  const jobHiredCount = await Model.CandidateApplicationModel.countDocuments({
    jobPostId: app.jobPostId,
    status: 'Hired',
  });

  return {
    stages: stages.map((s) => ({ id: String(s._id), name: s.name, order: s.stageOrder })),
    current_stage: app.agencyStageId ? {
      id: String(app.agencyStageId._id || app.agencyStageId),
      name: app.agencyStageId.name,
      order: app.agencyStageId.stageOrder,
    } : null,
    next_stage: nextStage ? { id: String(nextStage._id), name: nextStage.name, order: nextStage.stageOrder } : null,
    previous_stage: previousStage ? { id: String(previousStage._id), name: previousStage.name, order: previousStage.stageOrder } : null,
    is_first_stage: currentIndex === 0,
    is_final_stage: currentIndex === stages.length - 1,
    status: app.status,
    hiring_completed: job?.hiringStatus === 'Complete',
    job_hiring_status: job?.hiringStatus || 'Open',
    caregiver_transferred: Boolean(app.caregiverAccountId),
    job_hired_count: jobHiredCount,
    can_hire: jobHiredCount === 0 && currentIndex === stages.length - 1,
  };
};

const formatCandidate = (doc) => {
  const client = functions.toClientDoc(doc);
  if (!client) return null;
  client.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  client.first_name = client.firstName;
  client.last_name = client.lastName;
  client.current_ctc = client.currentCtc;
  client.expected_ctc = client.expectedCtc;
  client.date_of_birth = client.dateOfBirth
    ? new Date(client.dateOfBirth).toISOString().slice(0, 10)
    : '';
  client.source_id = client.sourceId || '';
  client.profile_pic = buildUploadUrl(client.profilePicPath);
  client.resume = buildUploadUrl(client.resumePath);
  return client;
};

const getUploadedFilePath = (req, field) => {
  const file = req.files?.[field]?.[0];
  if (!file) return '';
  const sub = field === 'profile_pic' ? 'profile_pics' : 'resumes';
  return `candidates/${sub}/${file.filename}`;
};

const formatApplication = (doc, extras = {}) => {
  const client = functions.toClientDoc(doc);
  if (!client) return null;
  client.candidateId = String(doc.candidateId?._id || doc.candidateId || '');
  client.jobPostId = String(doc.jobPostId?._id || doc.jobPostId || '');
  client.agencyStageId = doc.agencyStageId
    ? String(doc.agencyStageId._id || doc.agencyStageId)
    : '';
  return { ...client, ...extras };
};

const getFirstStageForJob = async (job) => {
  const stages = await getAgencyStagesForJob(job);
  return stages[0] || null;
};

const applyForJob = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: payload.job_id, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);
  if (job.hiringStatus === 'Complete') {
    throw new Error(constants.MESSAGE.JOB.HIRING_CYCLE_LOCKED);
  }

  const existingCandidate = await Model.CandidateModel.findOne({
    agencyId,
    email: payload.email.toLowerCase(),
  });

  let candidate = existingCandidate;
  if (!candidate) {
    const profilePicPath = getUploadedFilePath(req, 'profile_pic');
    const resumePath = getUploadedFilePath(req, 'resume');
    const dateOfBirth = payload.date_of_birth ? new Date(payload.date_of_birth) : undefined;

    candidate = await Model.CandidateModel.create({
      agencyId,
      firstName: payload.first_name,
      lastName: payload.last_name,
      email: payload.email.toLowerCase(),
      phone: payload.phone || '',
      designation: payload.designation || '',
      location: payload.location || '',
      country: payload.country || '',
      education: payload.education || '',
      experience: parseExperience(payload.experience),
      currentCtc: Number(payload.current_ctc) || 0,
      expectedCtc: Number(payload.expected_ctc) || 0,
      dateOfBirth: dateOfBirth && !Number.isNaN(dateOfBirth.getTime()) ? dateOfBirth : undefined,
      summary: payload.summary || '',
      skills: payload.skills || '',
      sourceId: payload.source_id || '',
      profilePicPath,
      resumePath,
    });
  }

  const existingApp = await Model.CandidateApplicationModel.findOne({
    candidateId: candidate._id,
    jobPostId: job._id,
  });
  if (existingApp) throw new Error(constants.MESSAGE.CANDIDATE.ALREADY_APPLIED);

  const firstStage = await getFirstStageForJob(job);

  const application = await Model.CandidateApplicationModel.create({
    agencyId,
    candidateId: candidate._id,
    jobPostId: job._id,
    agencyStageId: firstStage?._id,
    status: 'Active',
  });

  const populated = await Model.CandidateApplicationModel.findById(application._id)
    .populate('candidateId')
    .populate('jobPostId')
    .populate('agencyStageId');

  const formatted = formatApplication(populated, {
    candidate: formatCandidate(populated.candidateId),
    job: populated.jobPostId ? {
      id: String(populated.jobPostId._id),
      job_title: populated.jobPostId.jobTitle,
    } : null,
    stage: populated.agencyStageId ? {
      id: String(populated.agencyStageId._id),
      name: populated.agencyStageId.name,
    } : null,
  });

  try {
    const agency = await Model.AgencyModel.findById(agencyId).select('name');
    if (candidate.email) {
      await sendCandidateApplicationEmail({
        to: candidate.email,
        candidateName: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
        jobTitle: job.jobTitle,
        agencyName: agency?.name,
        stageName: firstStage?.name,
      });
    }
  } catch (err) {
    console.error('[applyForJob] application email failed', err.message);
  }

  try {
    const formAccess = await CandidateFormService.issueStageAccess(req, application._id);
    if (!formAccess.skipped) {
      formatted.form_url = formAccess.form_url;
      formatted.form_progress = formAccess.access ? {
        form_url: formAccess.form_url,
        email_sent_at: formAccess.access.email_sent_at,
      } : null;
    }
  } catch (err) {
    console.error('[applyForJob] form access issue failed', err.message);
  }

  return formatted;
};

const getAllApplications = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId };
  if (query.job_id) filter.jobPostId = query.job_id;
  if (query.status) filter.status = query.status;

  const apps = await Model.CandidateApplicationModel.find(filter)
    .populate('candidateId')
    .populate('jobPostId')
    .populate('agencyStageId')
    .sort({ createdAt: -1 });

  return apps.map((app) => formatApplication(app, {
    candidate: formatCandidate(app.candidateId),
    job: app.jobPostId ? {
      id: String(app.jobPostId._id),
      job_title: app.jobPostId.jobTitle,
      job_location: app.jobPostId.jobLocation,
    } : null,
    stage: app.agencyStageId ? {
      id: String(app.agencyStageId._id),
      name: app.agencyStageId.name,
    } : null,
  }));
};

const setStage = async (req, applicationId, stageId) => {
  const agencyId = getAgencyId(req);
  const app = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId });
  if (!app) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  const job = await Model.JobPostModel.findById(app.jobPostId);
  const stages = await getAgencyStagesForJob(job);
  const valid = stages.some((s) => String(s._id) === String(stageId));
  if (!valid) throw new Error(constants.MESSAGE.CANDIDATE.INVALID_STAGE);

  app.agencyStageId = stageId;
  app.status = 'Active';
  await app.save();

  try {
    await CandidateFormService.issueStageAccess(req, applicationId);
  } catch (err) {
    console.error('[setStage] form access issue failed', err.message);
  }

  return formatApplication(app);
};

const removeHireBinding = (job, applicationId) => {
  job.hiredBindings = (job.hiredBindings || []).filter(
    (b) => String(b.applicationId) !== String(applicationId),
  );
};

const syncJobAfterHireRemoved = async (job) => {
  const hiredCount = await Model.CandidateApplicationModel.countDocuments({
    jobPostId: job._id,
    status: 'Hired',
  });
  if (hiredCount === 0 && job.hiringStatus === 'Complete') {
    job.hiringStatus = 'Open';
  }
  await job.save();
};

const assertHiredCandidateEditable = async (job) => {
  if (job?.hiringStatus === 'Complete') {
    throw new Error(constants.MESSAGE.CANDIDATE.HIRED_LOCKED);
  }
};

const formatCaregiverAccount = (account, extras = {}) => ({
  id: String(account._id),
  email: account.email,
  userId: account.userId,
  fullName: account.fullName,
  role: account.role,
  status: account.status,
  tempPassword: extras.tempPassword || null,
  isNewAccount: Boolean(extras.tempPassword),
  jobTitle: extras.jobTitle || null,
  jobId: extras.jobId ? String(extras.jobId) : null,
});

const transferHiredApplicationToCaregiver = async (req, app, job) => {
  const agencyId = getAgencyId(req);

  if (app.caregiverAccountId) {
    const existing = await Model.AgencyAccountModel.findById(app.caregiverAccountId);
    if (existing) {
      return formatCaregiverAccount(existing, {
        jobTitle: job.jobTitle,
        jobId: job._id,
      });
    }
  }

  const candidate = await Model.CandidateModel.findById(app.candidateId?._id || app.candidateId);
  if (!candidate) throw new Error(constants.MESSAGE.CANDIDATE.NOT_FOUND);

  let caregiverAccount = await Model.AgencyAccountModel.findOne({
    email: candidate.email,
    agencyId,
  });

  let tempPassword = null;
  if (!caregiverAccount) {
    tempPassword = `Care@${functions.generateRandomStringAndNumbers(6)}`;
    caregiverAccount = new Model.AgencyAccountModel({
      userId: candidate.email.toLowerCase(),
      email: candidate.email.toLowerCase(),
      fullName: `${candidate.firstName} ${candidate.lastName}`.trim(),
      role: 'CAREGIVER',
      status: 'Active',
      agencyId,
      candidateId: candidate._id,
      sourceJobPostId: job._id,
      password: 'placeholder',
    });
    await caregiverAccount.setPassword(tempPassword);
    await caregiverAccount.save();
  } else if (caregiverAccount.role !== 'CAREGIVER') {
    throw new Error(constants.MESSAGE.CANDIDATE.CAREGIVER_ACCOUNT_CONFLICT);
  } else {
    caregiverAccount.candidateId = candidate._id;
    caregiverAccount.sourceJobPostId = job._id;
    await caregiverAccount.save();
  }

  candidate.caregiverAccountId = caregiverAccount._id;
  await candidate.save();

  app.caregiverAccountId = caregiverAccount._id;
  await app.save();

  const binding = (job.hiredBindings || []).find(
    (b) => String(b.applicationId) === String(app._id),
  );
  if (binding) {
    binding.caregiverAccountId = caregiverAccount._id;
  } else {
    job.hiredBindings = job.hiredBindings || [];
    job.hiredBindings.push({
      applicationId: app._id,
      candidateId: candidate._id,
      caregiverAccountId: caregiverAccount._id,
      boundAt: new Date(),
    });
  }
  await job.save();

  try {
    if (caregiverAccount.email) {
      const agency = await Model.AgencyModel.findById(agencyId).select('name');
      await sendCaregiverWelcomeEmail({
        to: caregiverAccount.email,
        caregiverName: caregiverAccount.fullName || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Caregiver',
        agencyName: agency?.name,
        jobTitle: job.jobTitle,
        email: caregiverAccount.email,
        password: tempPassword,
      });
    }
  } catch (err) {
    console.error('[transferHiredApplicationToCaregiver] welcome email failed', err.message);
  }

  return formatCaregiverAccount(caregiverAccount, {
    tempPassword,
    jobTitle: job.jobTitle,
    jobId: job._id,
  });
};

const completeHire = async (req, applicationId) => {
  const agencyId = getAgencyId(req);
  const app = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId })
    .populate('candidateId')
    .populate('jobPostId');
  if (!app) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  const job = await Model.JobPostModel.findById(app.jobPostId?._id || app.jobPostId);
  const stages = await getJobStages(job);
  const currentIndex = stages.findIndex((s) => String(s._id) === resolveStageId(app.agencyStageId));
  if (currentIndex !== stages.length - 1) {
    throw new Error(constants.MESSAGE.CANDIDATE.NOT_FINAL_STAGE);
  }
  if (app.status === 'Hired') {
    throw new Error(constants.MESSAGE.CANDIDATE.ALREADY_HIRED);
  }

  const existingHiredCount = await Model.CandidateApplicationModel.countDocuments({
    jobPostId: job._id,
    status: 'Hired',
    _id: { $ne: app._id },
  });
  if (existingHiredCount > 0) {
    throw new Error(constants.MESSAGE.CANDIDATE.JOB_HIRE_LIMIT);
  }

  const candidate = app.candidateId;
  if (!candidate) throw new Error(constants.MESSAGE.CANDIDATE.NOT_FOUND);

  app.status = 'Hired';
  await app.save();

  const bindingExists = job.hiredBindings?.some(
    (b) => String(b.applicationId) === String(app._id),
  );
  if (!bindingExists) {
    job.hiredBindings = job.hiredBindings || [];
    job.hiredBindings.push({
      applicationId: app._id,
      candidateId: candidate._id || candidate,
      boundAt: new Date(),
    });
    await job.save();
  }

  return {
    application: formatApplication(app, {
      candidate: formatCandidate(candidate),
    }),
    message: 'Mark the job hiring cycle complete to add this candidate to your caregiver roster.',
  };
};

const moveToNextStage = async (req, applicationId) => {
  const agencyId = getAgencyId(req);
  const app = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId });
  if (!app) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);
  if (app.status !== 'Active') throw new Error(constants.MESSAGE.CANDIDATE.NOT_ACTIVE);

  const job = await Model.JobPostModel.findById(app.jobPostId);
  const stages = await getJobStages(job);
  const currentIndex = stages.findIndex((s) => String(s._id) === resolveStageId(app.agencyStageId));
  if (currentIndex < 0 || currentIndex >= stages.length - 1) {
    throw new Error(constants.MESSAGE.CANDIDATE.NO_NEXT_STAGE);
  }

  app.agencyStageId = stages[currentIndex + 1]._id;
  await app.save();

  try {
    await CandidateFormService.issueStageAccess(req, applicationId);
  } catch (err) {
    console.error('[moveToNextStage] form access issue failed', err.message);
  }

  const populated = await Model.CandidateApplicationModel.findById(app._id)
    .populate('candidateId')
    .populate('agencyStageId');
  return formatApplicationPopulated(populated);
};

const moveToPreviousStage = async (req, applicationId) => {
  const agencyId = getAgencyId(req);
  const app = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId });
  if (!app) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);
  if (app.status !== 'Active') throw new Error(constants.MESSAGE.CANDIDATE.NOT_ACTIVE);

  const job = await Model.JobPostModel.findById(app.jobPostId);
  const stages = await getJobStages(job);
  const currentIndex = stages.findIndex((s) => String(s._id) === resolveStageId(app.agencyStageId));
  if (currentIndex <= 0) {
    throw new Error(constants.MESSAGE.CANDIDATE.NO_PREVIOUS_STAGE);
  }

  app.agencyStageId = stages[currentIndex - 1]._id;
  await app.save();

  try {
    await CandidateFormService.issueStageAccess(req, applicationId);
  } catch (err) {
    console.error('[moveToPreviousStage] form access issue failed', err.message);
  }

  const populated = await Model.CandidateApplicationModel.findById(app._id)
    .populate('candidateId')
    .populate('agencyStageId');
  return formatApplicationPopulated(populated);
};

const rejectApplication = async (req, applicationId) => {
  const agencyId = getAgencyId(req);
  const app = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId })
    .populate('candidateId')
    .populate('agencyStageId');
  if (!app) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  let job = null;
  if (app.status === 'Hired') {
    job = await Model.JobPostModel.findById(app.jobPostId);
    await assertHiredCandidateEditable(job);
    removeHireBinding(job, app._id);
    app.caregiverAccountId = undefined;
  }

  app.status = 'Rejected';
  app.rejectedAt = new Date();
  await app.save();

  if (job) await syncJobAfterHireRemoved(job);
  return formatApplicationPopulated(app);
};

const undoHire = async (req, applicationId) => {
  const agencyId = getAgencyId(req);
  const app = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId });
  if (!app) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);
  if (app.status !== 'Hired') throw new Error(constants.MESSAGE.CANDIDATE.NOT_HIRED);

  const job = await Model.JobPostModel.findById(app.jobPostId);
  await assertHiredCandidateEditable(job);
  const stages = await getJobStages(job);
  const finalStage = stages[stages.length - 1];
  if (!finalStage) throw new Error(constants.MESSAGE.CANDIDATE.INVALID_STAGE);

  app.status = 'Active';
  app.caregiverAccountId = undefined;
  app.agencyStageId = finalStage._id;
  await app.save();

  if (job) {
    removeHireBinding(job, app._id);
    await syncJobAfterHireRemoved(job);
  }

  const populated = await Model.CandidateApplicationModel.findById(app._id)
    .populate('candidateId')
    .populate('agencyStageId');
  return formatApplicationPopulated(populated);
};

const getByJobAndStage = async (req, jobId, stageId) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: jobId, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);

  const filter = { agencyId, jobPostId: jobId, status: 'Active' };
  if (stageId && stageId !== 'all') {
    filter.agencyStageId = stageId;
  }

  const apps = await Model.CandidateApplicationModel.find(filter)
    .populate('candidateId')
    .populate('agencyStageId')
    .sort({ createdAt: -1 });

  const stageInfo = stageId && stageId !== 'all'
    ? await Model.AgencyStageModel.findById(stageId)
    : null;

  const applications = await Promise.all(apps.map(async (app) => {
    const info = await getStageInfo(app._id, agencyId);
    return { ...formatApplicationPopulated(app), stage_info: info };
  }));

  const enriched = await CandidateFormService.enrichApplicationsWithFormProgress(
    applications,
    stageId,
  );

  const withFeedback = await InterviewFeedbackService.enrichApplicationsWithFeedback(
    enriched,
    stageId,
  );

  return {
    job: { id: String(job._id), job_title: job.jobTitle },
    stage: stageInfo ? { id: String(stageInfo._id), name: stageInfo.name } : null,
    applications: withFeedback,
  };
};

const getRejectedByJob = async (req, jobId) => {
  const agencyId = getAgencyId(req);
  const apps = await Model.CandidateApplicationModel.find({
    agencyId,
    jobPostId: jobId,
    status: 'Rejected',
  })
    .populate('candidateId')
    .populate('agencyStageId')
    .sort({ rejectedAt: -1 });

  return apps.map((app) => formatApplicationPopulated(app));
};

const completeJobHiring = async (req, jobId) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: jobId, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);
  if (job.hiringStatus === 'Complete') {
    throw new Error(constants.MESSAGE.JOB.HIRING_ALREADY_COMPLETE);
  }

  const hiredApps = await Model.CandidateApplicationModel.find({
    jobPostId: jobId,
    status: 'Hired',
  }).populate('candidateId');

  if (hiredApps.length === 0) {
    throw new Error(constants.MESSAGE.JOB.HIRING_COMPLETE_REQUIRES_HIRE);
  }

  const caregivers = [];
  for (const app of hiredApps) {
    const caregiver = await transferHiredApplicationToCaregiver(req, app, job);
    caregivers.push(caregiver);
  }

  job.hiringStatus = 'Complete';
  await job.save();

  return {
    id: String(job._id),
    job_title: job.jobTitle,
    hiringStatus: job.hiringStatus,
    status: job.status,
    hired_count: hiredApps.length,
    caregivers,
    hired_bindings: (job.hiredBindings || []).map((b) => ({
      applicationId: String(b.applicationId),
      candidateId: String(b.candidateId),
      caregiverAccountId: b.caregiverAccountId ? String(b.caregiverAccountId) : null,
    })),
  };
};

const reopenJobHiring = async (req, jobId) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: jobId, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);

  job.hiringStatus = 'Open';
  await job.save();

  return {
    id: String(job._id),
    job_title: job.jobTitle,
    hiringStatus: job.hiringStatus,
    status: job.status,
  };
};

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const jobs = await Model.JobPostModel.find({ agencyId }).sort({ createdAt: -1 });
  const allStages = await Model.AgencyStageModel.find({ agencyId, isActive: true }).sort({ stageOrder: 1 });

  const applications = await Model.CandidateApplicationModel.find({ agencyId });

  const data = await Promise.all(jobs.map(async (job) => {
    const jobStages = await getAgencyStagesForJob(job);
    const stageMap = Object.fromEntries(jobStages.map((s) => [String(s._id), s.name]));
    const stages = {};
    jobStages.forEach((s) => { stages[s.name] = 0; });

    let hired = 0;
    let rejected = 0;
    applications
      .filter((a) => String(a.jobPostId) === String(job._id))
      .forEach((a) => {
        if (a.status === 'Hired') {
          hired += 1;
        } else if (a.status === 'Rejected') {
          rejected += 1;
        } else if (a.status === 'Active' && a.agencyStageId) {
          const name = stageMap[String(a.agencyStageId)];
          if (name) stages[name] = (stages[name] || 0) + 1;
        }
      });

    const activeTotal = Object.values(stages).reduce((sum, n) => sum + n, 0);
    return {
      job_id: String(job._id),
      job_title: job.jobTitle,
      hiring_status: job.hiringStatus || 'Open',
      hired,
      rejected,
      total: activeTotal + hired + rejected,
      stages,
      stages_metadata: jobStages.map((s) => ({
        id: String(s._id),
        name: s.name,
        order: s.stageOrder,
      })),
    };
  }));

  const stagesMetadata = allStages.map((s) => ({
    id: String(s._id),
    name: s.name,
    order: s.stageOrder,
  }));

  return { data, stages_metadata: stagesMetadata };
};

const getHiredForJob = async (req, jobId) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: jobId, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);

  const apps = await Model.CandidateApplicationModel.find({ jobPostId: jobId, status: 'Hired' })
    .populate('candidateId')
    .populate('agencyStageId')
    .sort({ updatedAt: -1 });

  const stages = await getJobStages(job);
  const finalStage = stages[stages.length - 1];
  const hiredCount = apps.length;
  const jobHiringComplete = job.hiringStatus === 'Complete';

  return apps.map((app) => ({
    ...formatApplicationPopulated(app),
    stage_info: {
      final_stage: finalStage
        ? { id: String(finalStage._id), name: finalStage.name, order: finalStage.stageOrder }
        : null,
      hiring_completed: jobHiringComplete,
      job_hiring_status: job.hiringStatus || 'Open',
      caregiver_transferred: Boolean(app.caregiverAccountId),
      job_hired_count: hiredCount,
      can_hire: false,
      is_final_stage: true,
    },
  }));
};

module.exports = {
  applyForJob,
  getAllApplications,
  setStage,
  moveToNextStage,
  moveToPreviousStage,
  rejectApplication,
  undoHire,
  completeHire,
  getStageInfo,
  getByJobAndStage,
  getRejectedByJob,
  completeJobHiring,
  reopenJobHiring,
  getStats,
  getHiredForJob,
  formatCandidate,
  formatApplication,
};
