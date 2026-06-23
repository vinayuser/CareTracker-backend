const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const formatJob = (doc) => {
  const client = functions.toClientDoc(doc);
  if (!client) return null;
  client.agencyId = String(doc.agencyId?._id || doc.agencyId || '');
  client.job_title = client.jobTitle;
  client.job_code = client.jobCode;
  client.job_workplace = client.jobWorkplace;
  client.job_location = client.jobLocation;
  client.job_department = client.jobDepartment;
  client.job_function = client.jobFunction;
  client.employment_type = client.employmentType;
  client.from_salary = client.fromSalary;
  client.to_salary = client.toSalary;
  client.stageIds = (client.stageIds || []).map((id) => String(id));
  client.hiring_status = client.hiringStatus || 'Open';
  if (client.keywords) {
    client.keywordsArray = client.keywords.split(',').map((k) => k.trim()).filter(Boolean);
  } else {
    client.keywordsArray = [];
  }
  return client;
};

const mapPayloadToJob = (payload) => ({
  jobTitle: payload.job_title,
  jobCode: payload.job_code,
  jobWorkplace: payload.job_workplace,
  jobLocation: payload.job_location,
  description: payload.job_description || '',
  requirements: payload.job_requirements || '',
  benefits: payload.job_benefits || '',
  jobDepartment: payload.job_department || '',
  jobFunction: payload.job_function || '',
  employmentType: payload.employment_type || '',
  experience: payload.experience || '',
  education: payload.education || '',
  keywords: Array.isArray(payload.keywords) ? payload.keywords.join(', ') : (payload.keywords || ''),
  fromSalary: Number(payload.annual_salary_from) || 0,
  toSalary: Number(payload.annual_salary_to) || 0,
  currency: payload.currency || 'USD',
  showOnCareerPage: payload.showOnCareerPage !== false,
  stageIds: payload.stage_ids || payload.stageIds || [],
  status: payload.status || 'Active',
});

const resolveStageIds = async (agencyId, stageIds) => {
  if (stageIds?.length) {
    const stages = await Model.AgencyStageModel.find({
      _id: { $in: stageIds },
      agencyId,
      isActive: true,
    }).sort({ stageOrder: 1 });
    return stages.map((s) => s._id);
  }
  const stages = await Model.AgencyStageModel.find({ agencyId, isActive: true }).sort({ stageOrder: 1 });
  return stages.map((s) => s._id);
};

const getAll = async (req) => {
  const agencyId = getAgencyId(req);
  const jobs = await Model.JobPostModel.find({ agencyId }).sort({ createdAt: -1 });
  return jobs.map(formatJob);
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: id, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);
  return formatJob(job);
};

const create = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const account = getAgencyAccount(req);
  const data = mapPayloadToJob(payload);
  data.agencyId = agencyId;
  data.stageIds = await resolveStageIds(agencyId, data.stageIds);
  data.createdBy = account?._id || account?.id;

  const existing = await Model.JobPostModel.findOne({ agencyId, jobCode: data.jobCode });
  if (existing) throw new Error(constants.MESSAGE.JOB.CODE_EXISTS);

  const job = await Model.JobPostModel.create(data);
  return formatJob(job);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: id, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);
  if (job.hiringStatus === 'Complete') {
    throw new Error(constants.MESSAGE.JOB.HIRING_CYCLE_LOCKED);
  }

  const data = mapPayloadToJob(payload);
  if (payload.stage_ids !== undefined || payload.stageIds !== undefined) {
    job.stageIds = await resolveStageIds(agencyId, data.stageIds);
  }

  const fields = [
    'jobTitle', 'jobCode', 'jobWorkplace', 'jobLocation', 'description', 'requirements',
    'benefits', 'jobDepartment', 'jobFunction', 'employmentType', 'experience', 'education',
    'keywords', 'fromSalary', 'toSalary', 'currency', 'showOnCareerPage', 'status',
  ];
  fields.forEach((field) => {
    if (data[field] !== undefined) job[field] = data[field];
  });

  if (data.jobCode !== job.jobCode) {
    const dup = await Model.JobPostModel.findOne({ agencyId, jobCode: data.jobCode, _id: { $ne: id } });
    if (dup) throw new Error(constants.MESSAGE.JOB.CODE_EXISTS);
  }

  await job.save();
  return formatJob(job);
};

const remove = async (req, id) => {
  const agencyId = getAgencyId(req);
  const job = await Model.JobPostModel.findOne({ _id: id, agencyId });
  if (!job) throw new Error(constants.MESSAGE.JOB.NOT_FOUND);
  await Model.CandidateApplicationModel.deleteMany({ jobPostId: id });
  await job.deleteOne();
  return { deleted: true };
};

const getAgencyStagesForJob = async (job) => {
  if (job.stageIds?.length) {
    return Model.AgencyStageModel.find({ _id: { $in: job.stageIds }, isActive: true }).sort({ stageOrder: 1 });
  }
  return Model.AgencyStageModel.find({ agencyId: job.agencyId, isActive: true }).sort({ stageOrder: 1 });
};

module.exports = {
  getAll,
  getById,
  create,
  update,
  remove,
  formatJob,
  getAgencyId,
  getAgencyStagesForJob,
  mapPayloadToJob,
};
