const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { CandidateApplicationService } = require('../../services');

module.exports.getApplications = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.getAllApplications(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.apply = async (req, res, next) => {
  try {
    await Validation.CandidateApplication.apply.validateAsync(req.body);
    const data = await CandidateApplicationService.applyForJob(req, req.body);
    return res.success(constants.MESSAGE.CANDIDATE.APPLIED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getStats = async (req, res, next) => {
  try {
    const result = await CandidateApplicationService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, result);
  } catch (error) {
    next(error);
  }
};

module.exports.getHired = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.getHiredForJob(req, req.params.jobId);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.setStage = async (req, res, next) => {
  try {
    await Validation.CandidateApplication.setStage.validateAsync(req.body);
    const data = await CandidateApplicationService.setStage(
      req,
      req.params.id,
      req.body.stage_id,
      { documentCodes: req.body.document_codes },
    );
    return res.success(constants.MESSAGE.CANDIDATE.STAGE_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.completeHire = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.completeHire(req, req.params.id);
    return res.success(constants.MESSAGE.CANDIDATE.HIRED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.moveToNextStage = async (req, res, next) => {
  try {
    await Validation.CandidateApplication.stageMove.validateAsync(req.body || {});
    const data = await CandidateApplicationService.moveToNextStage(req, req.params.id, {
      documentCodes: req.body?.document_codes,
    });
    return res.success(constants.MESSAGE.CANDIDATE.STAGE_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.moveToPreviousStage = async (req, res, next) => {
  try {
    await Validation.CandidateApplication.stageMove.validateAsync(req.body || {});
    const data = await CandidateApplicationService.moveToPreviousStage(req, req.params.id, {
      documentCodes: req.body?.document_codes,
    });
    return res.success(constants.MESSAGE.CANDIDATE.STAGE_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.reject = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.rejectApplication(req, req.params.id);
    return res.success(constants.MESSAGE.CANDIDATE.REJECTED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.undoHire = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.undoHire(req, req.params.id);
    return res.success(constants.MESSAGE.CANDIDATE.HIRE_UNDONE, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getStageInfo = async (req, res, next) => {
  try {
    const { getAgencyId } = require('../../services/agency/jobPost.service');
    const agencyId = getAgencyId(req);
    const data = await CandidateApplicationService.getStageInfo(req.params.id, agencyId);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getByJobAndStage = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.getByJobAndStage(
      req,
      req.params.jobId,
      req.params.stageId,
    );
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getRejectedByJob = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.getRejectedByJob(req, req.params.jobId);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};
