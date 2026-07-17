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
