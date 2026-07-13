const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { CandidateFormService } = require('../../services');

module.exports.getPortal = async (req, res, next) => {
  try {
    const data = await CandidateFormService.getPortalByToken(req.params.token);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getDocument = async (req, res, next) => {
  try {
    const data = await CandidateFormService.getDocumentFormByToken(
      req.params.token,
      req.params.documentCode,
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.saveDraft = async (req, res, next) => {
  try {
    await Validation.CandidateForm.saveDraft.validateAsync(req.body);
    const data = await CandidateFormService.saveDocumentDraft(
      req.params.token,
      req.params.documentCode,
      req.body.form_data,
    );
    return res.success(constants.MESSAGE.CANDIDATE_FORM.SAVED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.submit = async (req, res, next) => {
  try {
    await Validation.CandidateForm.submit.validateAsync(req.body);
    const data = await CandidateFormService.submitDocument(
      req.params.token,
      req.params.documentCode,
      req.body.form_data,
    );
    return res.success(constants.MESSAGE.CANDIDATE_FORM.SUBMITTED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.submitPdf = async (req, res, next) => {
  try {
    let formData = {};
    if (req.body?.form_data) {
      formData = typeof req.body.form_data === 'string'
        ? JSON.parse(req.body.form_data)
        : req.body.form_data;
    }
    const data = await CandidateFormService.submitPdfDocument(
      req.params.token,
      req.params.documentCode,
      formData,
      req.file,
    );
    return res.success(constants.MESSAGE.CANDIDATE_FORM.SUBMITTED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getSubmissions = async (req, res, next) => {
  try {
    const data = await CandidateFormService.getSubmissionsForAgency(
      req,
      req.params.id,
      req.query.stage_id,
    );
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getPrintData = async (req, res, next) => {
  try {
    const data = await CandidateFormService.getSubmissionForPrint(
      req,
      req.params.id,
      req.params.submissionId,
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.resendEmail = async (req, res, next) => {
  try {
    await Validation.CandidateForm.resendEmail.validateAsync(req.body || {});
    const data = await CandidateFormService.resendStageEmail(req, req.params.id, {
      documentCodes: req.body?.document_codes,
    });
    return res.success(constants.MESSAGE.CANDIDATE_FORM.EMAIL_RESENT, data);
  } catch (error) {
    next(error);
  }
};

module.exports.resetSubmission = async (req, res, next) => {
  try {
    const data = await CandidateFormService.resetFormSubmission(
      req,
      req.params.id,
      req.params.documentCode,
    );
    return res.success(constants.MESSAGE.CANDIDATE_FORM.FORM_RESET, data);
  } catch (error) {
    next(error);
  }
};
