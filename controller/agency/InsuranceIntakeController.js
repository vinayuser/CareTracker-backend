const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { InsuranceIntakeService } = require('../../services');

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = await InsuranceIntakeService.getOptions(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await InsuranceIntakeService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await InsuranceIntakeService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await InsuranceIntakeService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.InsuranceIntake.create.validateAsync(req.body);
    const data = await InsuranceIntakeService.create(req, req.body);
    return res.success(constants.MESSAGE.INSURANCE_INTAKE.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.InsuranceIntake.update.validateAsync(req.body);
    const data = await InsuranceIntakeService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.INSURANCE_INTAKE.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await InsuranceIntakeService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.INSURANCE_INTAKE.DELETED, data);
  } catch (error) {
    next(error);
  }
};
