const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { HrStaffService } = require('../../services');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await HrStaffService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await HrStaffService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await HrStaffService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.HrStaff.create.validateAsync(req.body);
    const data = await HrStaffService.create(req, req.body);
    return res.success(constants.MESSAGE.HR.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.HrStaff.update.validateAsync(req.body);
    const data = await HrStaffService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.HR.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.updateStatus = async (req, res, next) => {
  try {
    await Validation.HrStaff.updateStatus.validateAsync(req.body);
    const data = await HrStaffService.updateStatus(req, req.params.id, req.body.status);
    return res.success(constants.MESSAGE.HR.STATUS_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.setPassword = async (req, res, next) => {
  try {
    await Validation.HrStaff.setPassword.validateAsync(req.body);
    const data = await HrStaffService.setPassword(req, req.params.id, req.body.password);
    return res.success(constants.MESSAGE.HR.PASSWORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.sendEmail = async (req, res, next) => {
  try {
    await Validation.HrStaff.sendEmail.validateAsync(req.body);
    const data = await HrStaffService.sendEmail(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.HR.EMAIL_SENT, data);
  } catch (error) {
    next(error);
  }
};
