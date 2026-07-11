const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { EvvEnrollmentService } = require('../../services');

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getOptions(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.EvvEnrollment.update.validateAsync(req.body);
    const data = await EvvEnrollmentService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.EVV_ENROLLMENT.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.verify = async (req, res, next) => {
  try {
    await Validation.EvvEnrollment.verify.validateAsync(req.body);
    const data = await EvvEnrollmentService.verify(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.EVV_ENROLLMENT.VERIFIED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.EVV_ENROLLMENT.DELETED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.syncCarePlan = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.syncCarePlan(req, req.params.carePlanId);
    return res.success(constants.MESSAGE.EVV_ENROLLMENT.SYNCED, data);
  } catch (error) {
    next(error);
  }
};
