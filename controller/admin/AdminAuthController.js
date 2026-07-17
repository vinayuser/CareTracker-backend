const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { AdminAuthService } = require('../../services');

module.exports.login = async (req, res, next) => {
  try {
    await Validation.Auth.login.validateAsync(req.body);
    const data = await AdminAuthService.login(req);
    return res.success(constants.MESSAGE.AUTH.LOGIN_SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.me = async (req, res, next) => {
  try {
    const user = await AdminAuthService.getMe(req);
    return res.success(constants.MESSAGE.SUCCESS, { user });
  } catch (error) {
    next(error);
  }
};

module.exports.updateProfile = async (req, res, next) => {
  try {
    await Validation.Auth.updateProfile.validateAsync(req.body);
    const data = await AdminAuthService.updateProfile(req, req.body);
    return res.success(constants.MESSAGE.AUTH.PROFILE_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.changePassword = async (req, res, next) => {
  try {
    await Validation.Auth.changePassword.validateAsync(req.body);
    const data = await AdminAuthService.changePassword(req, req.body);
    return res.success(constants.MESSAGE.AUTH.PASSWORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.forgotPassword = async (req, res, next) => {
  try {
    await Validation.Auth.forgotPassword.validateAsync(req.body);
    await AdminAuthService.forgotPassword(req, req.body);
    // Always return the same message to avoid account enumeration
    return res.success(constants.MESSAGE.AUTH.FORGOT_PASSWORD_SENT, { ok: true });
  } catch (error) {
    next(error);
  }
};

module.exports.resetPassword = async (req, res, next) => {
  try {
    await Validation.Auth.resetPassword.validateAsync(req.body);
    const data = await AdminAuthService.resetPassword(req.body);
    return res.success(constants.MESSAGE.AUTH.RESET_PASSWORD_SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
