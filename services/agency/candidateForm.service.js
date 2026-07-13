const Model = require('../../models/index');
const constants = require('../../common/constants');
const functions = require('../../common/functions');
const fs = require('fs');
const path = require('path');
const { buildEmptyFormData, getFormSchema, hasPdfForm } = require('../../common/hiringFormSchemas');
const { sendCandidateStageFormsEmail, sendCandidateFormResetEmail } = require('../common/mail.service');
const { getAgencyId } = require('./jobPost.service');

const TOKEN_TTL_DAYS = 30;

const generateExpiresAt = () => {
  const d = new Date();
  d.setDate(d.getDate() + TOKEN_TTL_DAYS);
  return d;
};

const loadApplicationContext = async (applicationId) => {
  const application = await Model.CandidateApplicationModel.findById(applicationId)
    .populate('candidateId')
    .populate('jobPostId')
    .populate('agencyStageId');
  if (!application) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);
  return application;
};

const getStageDocuments = (stage) => (stage?.documents || []).slice().sort((a, b) => a.order - b.order);

const formatStageDocumentList = (stage) => getStageDocuments(stage).map((d) => ({
  code: d.code,
  name: d.name,
  is_required: Boolean(d.isRequired),
  order: d.order,
}));

const filterDocumentsByCodes = (documents, documentCodes) => {
  if (!Array.isArray(documentCodes)) return documents;
  const set = new Set(documentCodes.map(String));
  return documents.filter((d) => set.has(String(d.code)));
};

/** Documents visible for an access token (selected subset, or all stage docs for legacy access). */
const resolveIssuedDocuments = (stage, access) => {
  const all = getStageDocuments(stage);
  if (access?.documentCodes?.length) {
    return filterDocumentsByCodes(all, access.documentCodes);
  }
  return all;
};

const assertDocumentIssued = (access, documentCode) => {
  if (!access?.documentCodes?.length) return;
  if (!access.documentCodes.includes(documentCode)) {
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.DOCUMENT_NOT_FOUND);
  }
};

const ensureSubmissionsForStage = async ({
  agencyId,
  applicationId,
  stageId,
  stageAccessId,
  documents,
}) => {
  const submissions = [];
  for (const doc of documents) {
    let submission = await Model.CandidateFormSubmissionModel.findOne({
      applicationId,
      stageId,
      documentCode: doc.code,
    });
    if (!submission) {
      submission = await Model.CandidateFormSubmissionModel.create({
        agencyId,
        applicationId,
        stageId,
        stageAccessId,
        documentCode: doc.code,
        documentName: doc.name,
        status: 'NotStarted',
        formData: buildEmptyFormData(doc.code),
      });
    } else if (stageAccessId && !submission.stageAccessId) {
      submission.stageAccessId = stageAccessId;
      await submission.save();
    }
    submissions.push(submission);
  }
  return submissions;
};

const expireActiveAccessForApplication = async (applicationId, exceptAccessId = null) => {
  const filter = { applicationId, status: 'Active' };
  if (exceptAccessId) filter._id = { $ne: exceptAccessId };
  await Model.CandidateStageAccessModel.updateMany(filter, { status: 'Expired' });
};

const maybeCompleteStageAccess = async (accessId) => {
  const access = await Model.CandidateStageAccessModel.findById(accessId);
  if (!access || access.status !== 'Active') return;

  const stage = await Model.AgencyStageModel.findById(access.stageId);
  const documents = resolveIssuedDocuments(stage, access);
  const requiredCodes = documents.filter((d) => d.isRequired).map((d) => d.code);
  if (requiredCodes.length === 0) {
    // No required forms among issued set — complete when all issued are submitted
    if (documents.length === 0) return;
    const submittedCount = await Model.CandidateFormSubmissionModel.countDocuments({
      applicationId: access.applicationId,
      stageId: access.stageId,
      documentCode: { $in: documents.map((d) => d.code) },
      status: 'Submitted',
    });
    if (submittedCount >= documents.length) {
      access.status = 'Completed';
      access.completedAt = new Date();
      await access.save();
    }
    return;
  }

  const submittedCount = await Model.CandidateFormSubmissionModel.countDocuments({
    applicationId: access.applicationId,
    stageId: access.stageId,
    documentCode: { $in: requiredCodes },
    status: 'Submitted',
  });

  if (submittedCount >= requiredCodes.length) {
    access.status = 'Completed';
    access.completedAt = new Date();
    await access.save();
  }
};

const formatSubmission = (doc, req) => {
  const client = functions.toClientDoc(doc);
  if (!client) return null;
  client.document_code = client.documentCode;
  client.document_name = client.documentName;
  client.form_data = client.formData || {};
  client.filled_pdf_url = client.filledPdfPath
    ? `${functions.getApiBaseUrl(req)}/uploads/${String(client.filledPdfPath).replace(/^\/+/, '')}`
    : null;
  client.submitted_at = client.submittedAt
    ? new Date(client.submittedAt).toISOString()
    : null;
  return client;
};

const getCatalogDocument = async (documentCode) => Model.DocumentModel.findOne({
  code: documentCode,
  isActive: true,
});

const getTemplateUrlForCode = async (documentCode, req) => {
  const catalogDoc = await getCatalogDocument(documentCode);
  if (!catalogDoc?.path) return null;
  return functions.buildDocumentTemplateUrl(catalogDoc.path, req);
};

const formatAccess = (doc, req) => {
  if (!doc) return null;
  const client = functions.toClientDoc(doc);
  client.form_url = functions.buildCandidateFormUrl(doc.token, req);
  client.email_sent_at = doc.emailSentAt ? new Date(doc.emailSentAt).toISOString() : null;
  client.expires_at = doc.expiresAt ? new Date(doc.expiresAt).toISOString() : null;
  client.document_codes = doc.documentCodes || [];
  return client;
};

const buildFormProgress = (documents, submissions, access, req) => {
  const submissionMap = Object.fromEntries(submissions.map((s) => [s.documentCode, s]));
  const docRows = documents.map((doc) => {
    const sub = submissionMap[doc.code];
    return {
      code: doc.code,
      name: doc.name,
      is_required: Boolean(doc.isRequired),
      status: sub?.status || 'NotStarted',
      submission_id: sub ? String(sub._id) : null,
    };
  });
  const required = docRows.filter((d) => d.is_required);
  const submitted = docRows.filter((d) => d.status === 'Submitted');
  return {
    form_url: access ? functions.buildCandidateFormUrl(access.token, req) : null,
    access_status: access?.status || null,
    email_sent_at: access?.emailSentAt ? new Date(access.emailSentAt).toISOString() : null,
    expires_at: access?.expiresAt ? new Date(access.expiresAt).toISOString() : null,
    total: docRows.length,
    submitted: submitted.length,
    required_total: required.length,
    required_submitted: required.filter((d) => d.status === 'Submitted').length,
    documents: docRows,
  };
};

const issueStageAccess = async (req, applicationId, options = {}) => {
  const application = await loadApplicationContext(applicationId);
  const agencyId = String(application.agencyId);
  if (getAgencyId(req) && String(getAgencyId(req)) !== agencyId) {
    throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);
  }

  const stage = application.agencyStageId;
  if (!stage || typeof stage !== 'object') {
    return { skipped: true, reason: 'no_stage' };
  }

  let documents = getStageDocuments(stage);
  if (documents.length === 0) {
    return { skipped: true, reason: 'no_documents' };
  }

  if (Array.isArray(options.documentCodes)) {
    if (options.documentCodes.length === 0) {
      return { skipped: true, reason: 'no_forms_selected' };
    }
    const selected = filterDocumentsByCodes(documents, options.documentCodes);
    if (!selected.length) {
      throw new Error(constants.MESSAGE.CANDIDATE_FORM.INVALID_DOCUMENT_CODES);
    }
    documents = selected;
  }

  await expireActiveAccessForApplication(application._id);

  const token = functions.generateCandidateFormToken();
  const documentCodes = documents.map((d) => d.code);
  const access = await Model.CandidateStageAccessModel.create({
    agencyId: application.agencyId,
    applicationId: application._id,
    candidateId: application.candidateId?._id || application.candidateId,
    jobPostId: application.jobPostId?._id || application.jobPostId,
    stageId: stage._id,
    token,
    documentCodes,
    status: 'Active',
    expiresAt: generateExpiresAt(),
  });

  await ensureSubmissionsForStage({
    agencyId: application.agencyId,
    applicationId: application._id,
    stageId: stage._id,
    stageAccessId: access._id,
    documents,
  });

  const candidate = application.candidateId;
  const job = application.jobPostId;
  const agency = await Model.AgencyModel.findById(application.agencyId).select('name');
  const formUrl = functions.buildCandidateFormUrl(token, req);

  let emailResult = { sent: false, devMode: true };
  if (candidate?.email) {
    try {
      emailResult = await sendCandidateStageFormsEmail({
        to: candidate.email,
        candidateName: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
        jobTitle: job?.jobTitle || 'Position',
        stageName: stage.name,
        agencyName: agency?.name,
        formUrl,
        formNames: documents.map((d) => d.name),
      });
      access.emailSentAt = new Date();
      await access.save();
    } catch (err) {
      console.error('[candidateForm] email failed', err.message);
    }
  }

  return {
    skipped: false,
    form_url: formUrl,
    document_codes: documentCodes,
    access: formatAccess(access, req),
    email: emailResult,
  };
};

const getActiveAccessForApplicationStage = async (applicationId, stageId) => Model.CandidateStageAccessModel.findOne({
  applicationId,
  stageId,
  status: { $in: ['Active', 'Completed'] },
}).sort({ createdAt: -1 });

const enrichApplicationsWithFormProgress = async (applications, stageId) => {
  if (!stageId || stageId === 'all' || !applications.length) return applications;

  const stage = await Model.AgencyStageModel.findById(stageId);
  const documents = getStageDocuments(stage);
  if (!documents.length) return applications;

  const appIds = applications.map((a) => a.id || a._id);
  const [accessRows, submissionRows] = await Promise.all([
    Model.CandidateStageAccessModel.find({
      applicationId: { $in: appIds },
      stageId,
      status: { $in: ['Active', 'Completed'] },
    }).sort({ createdAt: -1 }),
    Model.CandidateFormSubmissionModel.find({
      applicationId: { $in: appIds },
      stageId,
    }),
  ]);

  const accessByApp = {};
  accessRows.forEach((row) => {
    const key = String(row.applicationId);
    if (!accessByApp[key]) accessByApp[key] = row;
  });

  const submissionsByApp = {};
  submissionRows.forEach((row) => {
    const key = String(row.applicationId);
    if (!submissionsByApp[key]) submissionsByApp[key] = [];
    submissionsByApp[key].push(row);
  });

  return applications.map((app) => {
    const appId = String(app.id || app._id);
    const access = accessByApp[appId] || null;
    const subs = submissionsByApp[appId] || [];
    const issuedDocs = access ? resolveIssuedDocuments(stage, access) : documents;
    return {
      ...app,
      form_progress: buildFormProgress(issuedDocs, subs, access, null),
    };
  });
};

const resolveTokenAccess = async (token) => {
  const access = await Model.CandidateStageAccessModel.findOne({ token });
  if (!access) throw new Error(constants.MESSAGE.CANDIDATE_FORM.INVALID_TOKEN);
  if (access.status === 'Expired') throw new Error(constants.MESSAGE.CANDIDATE_FORM.TOKEN_EXPIRED);
  if (access.expiresAt && new Date(access.expiresAt) < new Date()) {
    access.status = 'Expired';
    await access.save();
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.TOKEN_EXPIRED);
  }
  return access;
};

const getPortalByToken = async (token, req) => {
  const access = await resolveTokenAccess(token);
  access.lastOpenedAt = new Date();
  await access.save();

  const [application, stage, agency] = await Promise.all([
    Model.CandidateApplicationModel.findById(access.applicationId)
      .populate('candidateId')
      .populate('jobPostId'),
    Model.AgencyStageModel.findById(access.stageId),
    Model.AgencyModel.findById(access.agencyId).select('name'),
  ]);

  const documents = resolveIssuedDocuments(stage, access);
  const submissions = await Model.CandidateFormSubmissionModel.find({
    applicationId: access.applicationId,
    stageId: access.stageId,
    ...(documents.length ? { documentCode: { $in: documents.map((d) => d.code) } } : {}),
  });

  const candidate = application?.candidateId;
  return {
    token,
    access_status: access.status,
    candidate: candidate ? {
      first_name: candidate.firstName,
      last_name: candidate.lastName,
      email: candidate.email,
    } : null,
    job: application?.jobPostId ? {
      id: String(application.jobPostId._id),
      job_title: application.jobPostId.jobTitle,
    } : null,
    stage: stage ? { id: String(stage._id), name: stage.name } : null,
    agency_name: agency?.name || '',
    form_progress: buildFormProgress(documents, submissions, access, req),
  };
};

const getDocumentFormByToken = async (token, documentCode, req) => {
  const access = await resolveTokenAccess(token);
  const stage = await Model.AgencyStageModel.findById(access.stageId);
  const documents = resolveIssuedDocuments(stage, access);
  const docMeta = documents.find((d) => d.code === documentCode);
  if (!docMeta) throw new Error(constants.MESSAGE.CANDIDATE_FORM.DOCUMENT_NOT_FOUND);

  let submission = await Model.CandidateFormSubmissionModel.findOne({
    applicationId: access.applicationId,
    stageId: access.stageId,
    documentCode,
  });

  if (!submission) {
    submission = await Model.CandidateFormSubmissionModel.create({
      agencyId: access.agencyId,
      applicationId: access.applicationId,
      stageId: access.stageId,
      stageAccessId: access._id,
      documentCode,
      documentName: docMeta.name,
      status: 'NotStarted',
      formData: buildEmptyFormData(documentCode),
    });
  }

  const schema = getFormSchema(documentCode);
  const templateUrl = await getTemplateUrlForCode(documentCode, req);

  return {
    document_code: documentCode,
    code: documentCode,
    document_name: docMeta.name,
    name: docMeta.name,
    is_required: Boolean(docMeta.isRequired),
    status: submission.status,
    form_type: schema.type,
    has_pdf_form: hasPdfForm(documentCode),
    template_url: templateUrl,
    url: templateUrl,
    form_data: submission.formData || buildEmptyFormData(documentCode),
    filled_pdf_url: submission.filledPdfPath
      ? `${functions.getApiBaseUrl(req)}/uploads/${String(submission.filledPdfPath).replace(/^\/+/, '')}`
      : null,
    read_only: submission.status === 'Submitted',
  };
};

const saveDocumentDraft = async (token, documentCode, formData, req) => {
  const access = await resolveTokenAccess(token);
  assertDocumentIssued(access, documentCode);
  const submission = await Model.CandidateFormSubmissionModel.findOne({
    applicationId: access.applicationId,
    stageId: access.stageId,
    documentCode,
  });
  if (!submission) throw new Error(constants.MESSAGE.CANDIDATE_FORM.DOCUMENT_NOT_FOUND);
  if (submission.status === 'Submitted') {
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.ALREADY_SUBMITTED);
  }

  submission.formData = formData;
  submission.status = 'Draft';
  submission.stageAccessId = access._id;
  await submission.save();
  return formatSubmission(submission, req);
};

const submitPdfDocument = async (token, documentCode, formData, file, req) => {
  const access = await resolveTokenAccess(token);
  assertDocumentIssued(access, documentCode);
  if (!hasPdfForm(documentCode)) {
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.DOCUMENT_NOT_FOUND);
  }
  if (!file) throw new Error(constants.MESSAGE.CANDIDATE_FORM.PDF_REQUIRED);

  const submission = await Model.CandidateFormSubmissionModel.findOne({
    applicationId: access.applicationId,
    stageId: access.stageId,
    documentCode,
  });
  if (!submission) throw new Error(constants.MESSAGE.CANDIDATE_FORM.DOCUMENT_NOT_FOUND);
  if (submission.status === 'Submitted') {
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.ALREADY_SUBMITTED);
  }

  const relativePath = `candidates/filled-documents/${token}/${file.filename}`;
  submission.formData = formData || {};
  submission.filledPdfPath = relativePath;
  submission.status = 'Submitted';
  submission.submittedAt = new Date();
  submission.stageAccessId = access._id;
  await submission.save();

  await maybeCompleteStageAccess(access._id);
  return formatSubmission(submission, req);
};

const validateSubmissionPayload = (documentCode, formData) => {
  const schema = getFormSchema(documentCode);
  if (schema.type === 'pdf_fillable') return;
  if (schema.type === 'employment_application') {
    const name = formData?.personalInfo?.fullName?.trim();
    const email = formData?.personalInfo?.email?.trim();
    const signature = formData?.authorization?.signature;
    if (!name || !email) throw new Error(constants.MESSAGE.CANDIDATE_FORM.REQUIRED_FIELDS);
    if (!signature) throw new Error(constants.MESSAGE.CANDIDATE_FORM.SIGNATURE_REQUIRED);
    return;
  }
  if (!formData?.acknowledged) throw new Error(constants.MESSAGE.CANDIDATE_FORM.ACK_REQUIRED);
  if (!formData?.signature) throw new Error(constants.MESSAGE.CANDIDATE_FORM.SIGNATURE_REQUIRED);
};

const submitDocument = async (token, documentCode, formData, req) => {
  if (hasPdfForm(documentCode)) {
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.USE_PDF_SUBMIT);
  }
  const access = await resolveTokenAccess(token);
  assertDocumentIssued(access, documentCode);
  validateSubmissionPayload(documentCode, formData);

  const submission = await Model.CandidateFormSubmissionModel.findOne({
    applicationId: access.applicationId,
    stageId: access.stageId,
    documentCode,
  });
  if (!submission) throw new Error(constants.MESSAGE.CANDIDATE_FORM.DOCUMENT_NOT_FOUND);
  if (submission.status === 'Submitted') {
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.ALREADY_SUBMITTED);
  }

  const payload = { ...formData };
  if (!payload.authorization?.date && schemaUsesAuthDate(documentCode)) {
    payload.authorization = { ...payload.authorization, date: new Date().toISOString().slice(0, 10) };
  }
  if (!payload.date) {
    payload.date = new Date().toISOString().slice(0, 10);
  }

  submission.formData = payload;
  submission.status = 'Submitted';
  submission.submittedAt = new Date();
  submission.stageAccessId = access._id;
  await submission.save();

  await maybeCompleteStageAccess(access._id);
  return formatSubmission(submission, req);
};

const schemaUsesAuthDate = (documentCode) => getFormSchema(documentCode).type === 'employment_application';

const getSubmissionsForAgency = async (req, applicationId, stageId = null) => {
  const agencyId = getAgencyId(req);
  const application = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId });
  if (!application) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  const resolvedStageId = stageId || application.agencyStageId;
  const stage = await Model.AgencyStageModel.findById(resolvedStageId);

  const [submissions, access] = await Promise.all([
    Model.CandidateFormSubmissionModel.find({
      applicationId,
      stageId: resolvedStageId,
    }).sort({ documentCode: 1 }),
    getActiveAccessForApplicationStage(applicationId, resolvedStageId),
  ]);

  const documents = resolveIssuedDocuments(stage, access);
  const availableDocuments = formatStageDocumentList(stage);

  return {
    application_id: String(applicationId),
    stage: stage ? { id: String(stage._id), name: stage.name } : null,
    available_documents: availableDocuments,
    form_progress: buildFormProgress(documents, submissions, access, req),
    submissions: submissions.map((s) => formatSubmission(s, req)),
    access: formatAccess(access, req),
  };
};

const getSubmissionForPrint = async (req, applicationId, submissionId) => {
  const agencyId = getAgencyId(req);
  const submission = await Model.CandidateFormSubmissionModel.findOne({
    _id: submissionId,
    applicationId,
    agencyId,
  });
  if (!submission) throw new Error(constants.MESSAGE.CANDIDATE_FORM.SUBMISSION_NOT_FOUND);

  const application = await Model.CandidateApplicationModel.findById(applicationId)
    .populate('candidateId')
    .populate('jobPostId');
  const stage = await Model.AgencyStageModel.findById(submission.stageId);
  const agency = await Model.AgencyModel.findById(agencyId).select('name');

  const candidate = application?.candidateId;
  const schema = getFormSchema(submission.documentCode);

  return {
    submission: formatSubmission(submission, req),
    form_type: schema.type,
    document_name: submission.documentName,
    pdf_url: submission.filledPdfPath
      ? `${functions.getApiBaseUrl(req)}/uploads/${String(submission.filledPdfPath).replace(/^\/+/, '')}`
      : null,
    candidate: candidate ? {
      first_name: candidate.firstName,
      last_name: candidate.lastName,
      email: candidate.email,
      phone: candidate.phone,
    } : null,
    job: application?.jobPostId ? { job_title: application.jobPostId.jobTitle } : null,
    stage: stage ? { name: stage.name } : null,
    agency_name: agency?.name || '',
  };
};

const resendStageEmail = async (req, applicationId, options = {}) => {
  let documentCodes = options.documentCodes;
  if (documentCodes === undefined && (options.document_codes !== undefined || req.body)) {
    const raw = options.document_codes ?? req.body?.document_codes;
    if (raw !== undefined) {
      documentCodes = Array.isArray(raw) ? raw.map(String).filter(Boolean) : undefined;
    }
  }
  const result = await issueStageAccess(req, applicationId, { documentCodes });
  if (result.skipped) {
    if (result.reason === 'no_forms_selected') {
      throw new Error(constants.MESSAGE.CANDIDATE_FORM.NO_FORMS_SELECTED);
    }
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.NO_FORMS_FOR_STAGE);
  }
  return result;
};

const deleteFilledPdfFile = (relativePath) => {
  if (!relativePath) return;
  const fullPath = path.join(__dirname, '../../uploads', relativePath);
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (err) {
    console.warn('[candidateForm] could not delete filled PDF', err.message);
  }
};

const resetFormSubmission = async (req, applicationId, documentCode) => {
  const agencyId = getAgencyId(req);
  const application = await Model.CandidateApplicationModel.findOne({ _id: applicationId, agencyId })
    .populate('candidateId')
    .populate('jobPostId');
  if (!application) throw new Error(constants.MESSAGE.CANDIDATE.APPLICATION_NOT_FOUND);

  const stageId = application.agencyStageId;
  const submission = await Model.CandidateFormSubmissionModel.findOne({
    applicationId,
    stageId,
    documentCode,
    agencyId,
  });
  if (!submission) throw new Error(constants.MESSAGE.CANDIDATE_FORM.SUBMISSION_NOT_FOUND);
  if (submission.status === 'NotStarted') {
    throw new Error(constants.MESSAGE.CANDIDATE_FORM.CANNOT_RESET);
  }

  deleteFilledPdfFile(submission.filledPdfPath);

  submission.formData = buildEmptyFormData(documentCode);
  submission.filledPdfPath = '';
  submission.submittedAt = undefined;
  submission.status = 'NotStarted';
  await submission.save();

  let access = await Model.CandidateStageAccessModel.findOne({
    applicationId,
    stageId,
    status: { $in: ['Active', 'Completed'] },
  }).sort({ createdAt: -1 });

  if (!access) {
    const issued = await issueStageAccess(req, applicationId, { documentCodes: [documentCode] });
    return {
      submission: formatSubmission(submission, req),
      form_url: issued.form_url,
      email: issued.email,
    };
  }

  if (access.status === 'Completed') {
    access.status = 'Active';
    access.completedAt = undefined;
  }
  // Ensure reset form remains in the issued set
  const codes = new Set(access.documentCodes || []);
  codes.add(documentCode);
  access.documentCodes = [...codes];
  access.expiresAt = generateExpiresAt();
  await access.save();

  const candidate = application.candidateId;
  const job = application.jobPostId;
  const stage = await Model.AgencyStageModel.findById(stageId);
  const agency = await Model.AgencyModel.findById(agencyId).select('name');
  const formUrl = functions.buildCandidateFormUrl(access.token, req);

  let emailResult = { sent: false, devMode: true };
  if (candidate?.email) {
    try {
      emailResult = await sendCandidateFormResetEmail({
        to: candidate.email,
        candidateName: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate',
        jobTitle: job?.jobTitle || 'Position',
        stageName: stage?.name || 'Hiring',
        documentName: submission.documentName,
        agencyName: agency?.name,
        formUrl,
      });
    } catch (err) {
      console.error('[candidateForm] reset email failed', err.message);
    }
  }

  const submissions = await Model.CandidateFormSubmissionModel.find({ applicationId, stageId });
  const documents = resolveIssuedDocuments(stage, access);

  return {
    submission: formatSubmission(submission, req),
    form_url: formUrl,
    form_progress: buildFormProgress(documents, submissions, access, req),
    email: emailResult,
  };
};

module.exports = {
  issueStageAccess,
  enrichApplicationsWithFormProgress,
  getPortalByToken,
  getDocumentFormByToken,
  saveDocumentDraft,
  submitDocument,
  submitPdfDocument,
  getSubmissionsForAgency,
  getSubmissionForPrint,
  resendStageEmail,
  resetFormSubmission,
  formatStageDocumentList,
  getStageDocuments,
};
