const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const { buildUploadUrl } = require('../../common/candidateHelpers');
const { sendCandidateCustomEmail } = require('../common/mail.service');

const getAgencyAccount = (req) => req.agency_owner || req.hr;

const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const resolveJobContext = async (account, agencyId) => {
  if (account.sourceJobPostId) {
    const job = await Model.JobPostModel.findById(account.sourceJobPostId).select('jobTitle');
    if (job) {
      return { jobId: job._id, jobTitle: job.jobTitle };
    }
  }

  const appByCaregiver = await Model.CandidateApplicationModel.findOne({
    agencyId,
    caregiverAccountId: account._id,
    status: 'Hired',
  }).populate('jobPostId');

  if (appByCaregiver?.jobPostId) {
    return {
      jobId: appByCaregiver.jobPostId._id,
      jobTitle: appByCaregiver.jobPostId.jobTitle,
      candidateId: appByCaregiver.candidateId,
      backfill: true,
    };
  }

  const candidate = account.candidateId
    ? await Model.CandidateModel.findById(account.candidateId)
    : await Model.CandidateModel.findOne({ agencyId, email: account.email });

  if (candidate) {
    const hiredApp = await Model.CandidateApplicationModel.findOne({
      agencyId,
      candidateId: candidate._id,
      status: 'Hired',
    }).populate('jobPostId');

    if (hiredApp?.jobPostId) {
      return {
        jobId: hiredApp.jobPostId._id,
        jobTitle: hiredApp.jobPostId.jobTitle,
        candidateId: candidate._id,
        backfill: true,
      };
    }
  }

  const jobFromBinding = await Model.JobPostModel.findOne({
    agencyId,
    'hiredBindings.caregiverAccountId': account._id,
  }).select('jobTitle');

  if (jobFromBinding) {
    return {
      jobId: jobFromBinding._id,
      jobTitle: jobFromBinding.jobTitle,
      backfill: true,
    };
  }

  return { jobId: null, jobTitle: '', candidateId: candidate?._id || null };
};

const maybeBackfillCaregiverLinks = async (account, context) => {
  if (!context.backfill) return;

  let dirty = false;
  if (context.jobId && !account.sourceJobPostId) {
    account.sourceJobPostId = context.jobId;
    dirty = true;
  }
  if (context.candidateId && !account.candidateId) {
    account.candidateId = context.candidateId;
    dirty = true;
  }
  if (dirty) await account.save();
};

const formatCaregiver = async (account, agencyId) => {
  const client = functions.toClientDoc(account);
  if (!client) return null;

  client.agencyId = String(account.agencyId?._id || account.agencyId || '');
  client.role = client.role || 'CAREGIVER';

  const jobContext = await resolveJobContext(account, agencyId);
  await maybeBackfillCaregiverLinks(account, jobContext);

  client.sourceJobId = jobContext.jobId ? String(jobContext.jobId) : '';
  client.source_job_title = jobContext.jobTitle || '';
  client.candidateId = String(account.candidateId || jobContext.candidateId || '');

  let candidate = null;
  const candidateId = account.candidateId || jobContext.candidateId;
  if (candidateId) {
    const doc = await Model.CandidateModel.findById(candidateId);
    if (doc) {
      candidate = {
        id: String(doc._id),
        first_name: doc.firstName,
        last_name: doc.lastName,
        email: doc.email,
        phone: doc.phone || '',
        experience: doc.experience || '',
        profile_pic_url: doc.profilePicPath ? buildUploadUrl(doc.profilePicPath) : '',
      };
    }
  }
  client.candidate = candidate;

  return client;
};

const getStats = async (req) => {
  const agencyId = getAgencyId(req);
  const list = await Model.AgencyAccountModel.find({ agencyId, role: 'CAREGIVER' });
  return {
    total: list.length,
    active: list.filter((member) => member.status === 'Active').length,
    inactive: list.filter((member) => member.status === 'Inactive').length,
    pending: list.filter((member) => member.status === 'Pending').length,
  };
};

const getAll = async (req, query = {}) => {
  const agencyId = getAgencyId(req);
  const filter = { agencyId, role: 'CAREGIVER' };

  if (query.status && query.status !== 'All') {
    filter.status = query.status;
  }

  if (query.search) {
    const search = String(query.search).trim();
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { fullName: regex },
      { email: regex },
      { userId: regex },
    ];
  }

  const list = await Model.AgencyAccountModel.find(filter).sort({ createdAt: -1 });
  return Promise.all(list.map((account) => formatCaregiver(account, agencyId)));
};

const getById = async (req, id) => {
  const agencyId = getAgencyId(req);
  const account = await Model.AgencyAccountModel.findOne({ _id: id, agencyId, role: 'CAREGIVER' });
  if (!account) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);
  return formatCaregiver(account, agencyId);
};

const setPassword = async (req, id, password) => {
  const agencyId = getAgencyId(req);
  const account = await Model.AgencyAccountModel.findOne({ _id: id, agencyId, role: 'CAREGIVER' });
  if (!account) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);

  await account.setPassword(password);
  account.jti = functions.generateRandomStringAndNumbers(20);
  await account.save();

  return formatCaregiver(account, agencyId);
};

const update = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const account = await Model.AgencyAccountModel.findOne({ _id: id, agencyId, role: 'CAREGIVER' });
  if (!account) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);

  if (payload.email || payload.userId) {
    const email = (payload.email || account.email || '').toLowerCase();
    const userId = (payload.userId || account.userId || '').toLowerCase();
    const conflict = await Model.AgencyAccountModel.findOne({
      _id: { $ne: account._id },
      $or: [{ email }, { userId }],
    });
    if (conflict) throw new Error(constants.MESSAGE.CAREGIVER.USER_ID_TAKEN);
  }

  if (payload.fullName !== undefined) account.fullName = payload.fullName.trim();
  if (payload.email !== undefined) account.email = payload.email.toLowerCase().trim();
  if (payload.userId !== undefined) account.userId = payload.userId.toLowerCase().trim();
  if (payload.phone !== undefined) account.phone = payload.phone;
  if (payload.employeeId !== undefined) account.employeeId = payload.employeeId;
  if (payload.dateOfBirth !== undefined) account.dateOfBirth = payload.dateOfBirth;
  if (payload.status !== undefined) account.status = payload.status;

  await account.save();
  return formatCaregiver(account, agencyId);
};

const updateStatus = async (req, id, status) => {
  const agencyId = getAgencyId(req);
  const account = await Model.AgencyAccountModel.findOne({ _id: id, agencyId, role: 'CAREGIVER' });
  if (!account) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);

  account.status = status;
  if (status === 'Inactive') {
    account.jti = functions.generateRandomStringAndNumbers(20);
  }
  await account.save();
  return formatCaregiver(account, agencyId);
};

const sendEmail = async (req, id, payload) => {
  const agencyId = getAgencyId(req);
  const account = await Model.AgencyAccountModel.findOne({ _id: id, agencyId, role: 'CAREGIVER' });
  if (!account) throw new Error(constants.MESSAGE.CAREGIVER.NOT_FOUND);
  if (!account.email) throw new Error(constants.MESSAGE.CAREGIVER.EMAIL_MISSING);

  const agency = await Model.AgencyModel.findById(agencyId).select('name');
  const sender = getAgencyAccount(req);

  await sendCandidateCustomEmail({
    to: account.email,
    candidateName: account.fullName || 'Caregiver',
    agencyName: agency?.name,
    subject: payload.subject,
    message: payload.message,
    senderName: sender?.fullName || sender?.name || '',
  });

  return {
    id: String(account._id),
    email: account.email,
    subject: payload.subject,
  };
};

module.exports = {
  getStats,
  getAll,
  getById,
  setPassword,
  update,
  updateStatus,
  sendEmail,
};
