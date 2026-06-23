const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { AgencyCaregiverService } = require('../../services');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await AgencyCaregiverService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await AgencyCaregiverService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await AgencyCaregiverService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.setPassword = async (req, res, next) => {
  try {
    await Validation.Caregiver.setPassword.validateAsync(req.body);
    const data = await AgencyCaregiverService.setPassword(req, req.params.id, req.body.password);
    return res.success(constants.MESSAGE.CAREGIVER.PASSWORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};
