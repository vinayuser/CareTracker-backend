const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { JobPostService, AiJobContentService, CandidateApplicationService } = require('../../services');

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await JobPostService.getAll(req);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await JobPostService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.JobPost.create.validateAsync(req.body);
    const data = await JobPostService.create(req, req.body);
    return res.success(constants.MESSAGE.JOB.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.JobPost.update.validateAsync(req.body);
    const data = await JobPostService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.JOB.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    await JobPostService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.JOB.DELETED, { deleted: true });
  } catch (error) {
    next(error);
  }
};

module.exports.generateAi = async (req, res, next) => {
  try {
    await Validation.JobPost.generateAi.validateAsync(req.body);
    const data = await AiJobContentService.generateJobContent(req, req.body);
    return res.success(constants.MESSAGE.JOB.AI_GENERATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.completeJobHiring = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.completeJobHiring(req, req.params.id);
    return res.success(constants.MESSAGE.JOB.HIRING_COMPLETE, data);
  } catch (error) {
    next(error);
  }
};

module.exports.reopenJobHiring = async (req, res, next) => {
  try {
    const data = await CandidateApplicationService.reopenJobHiring(req, req.params.id);
    return res.success(constants.MESSAGE.JOB.HIRING_REOPENED, data);
  } catch (error) {
    next(error);
  }
};
