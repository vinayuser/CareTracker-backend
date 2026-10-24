const constants = require('../common/constants');
const Validation = require('../validation/index');
const DeviceTokenService = require('../services/common/deviceToken.service');

module.exports.register = async (req, res, next) => {
  try {
    await Validation.Device.register.validateAsync(req.body);
    const data = await DeviceTokenService.registerDevice(req, req.body);
    return res.success(constants.MESSAGE.DEVICE.REGISTERED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.deregister = async (req, res, next) => {
  try {
    const payload = {
      pushToken: req.body?.pushToken || req.query?.pushToken,
    };
    await Validation.Device.deregister.validateAsync(payload);
    const data = await DeviceTokenService.deregisterDevice(req, payload);
    return res.success(constants.MESSAGE.DEVICE.DEREGISTERED, data);
  } catch (error) {
    next(error);
  }
};
