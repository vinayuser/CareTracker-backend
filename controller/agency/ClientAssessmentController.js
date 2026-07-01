const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { ClientAssessmentService } = require('../../services');

module.exports.getOptions = async (req, res, next) => {
  try {
    return res.success(constants.MESSAGE.SUCCESS, ClientAssessmentService.getOptions());
  } catch (error) {
    next(error);
  }
};

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await ClientAssessmentService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await ClientAssessmentService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await ClientAssessmentService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.ClientAssessment.create.validateAsync(req.body);
    const data = await ClientAssessmentService.create(req, req.body);
    return res.success(constants.MESSAGE.ASSESSMENT.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.ClientAssessment.update.validateAsync(req.body);
    const data = await ClientAssessmentService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.ASSESSMENT.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await ClientAssessmentService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.ASSESSMENT.DELETED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.generateQuote = async (req, res, next) => {
  try {
    await Validation.ClientAssessment.generateQuote.validateAsync(req.body);
    const data = await ClientAssessmentService.generateQuote(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.CARE_PLAN.QUOTE_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.acceptQuote = async (req, res, next) => {
  try {
    const data = await ClientAssessmentService.acceptQuote(req, req.params.id);
    return res.success(constants.MESSAGE.CARE_PLAN.QUOTE_ACCEPTED, data);
  } catch (error) {
    next(error);
  }
};
