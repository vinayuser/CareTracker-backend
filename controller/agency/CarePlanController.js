const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { CarePlanService } = require('../../services');

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = await CarePlanService.getOptions(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await CarePlanService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await CarePlanService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await CarePlanService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.CarePlan.create.validateAsync(req.body);
    const data = await CarePlanService.create(req, req.body);
    return res.success(constants.MESSAGE.CARE_PLAN.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.CarePlan.update.validateAsync(req.body);
    const data = await CarePlanService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.CARE_PLAN.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await CarePlanService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.CARE_PLAN.DELETED, data);
  } catch (error) {
    next(error);
  }
};
