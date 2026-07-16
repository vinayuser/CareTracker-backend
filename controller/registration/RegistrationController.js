const constants = require('../../common/constants');
const { RegistrationService } = require('../../services');

module.exports.checkUserId = async (req, res, next) => {
  try {
    const data = await RegistrationService.checkUserIdAvailability(req.query.email);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.createAccount = async (req, res, next) => {
  try {
    const data = await RegistrationService.createAccount(req.body);
    return res.success(constants.MESSAGE.RECORD_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.submit = async (req, res, next) => {
  try {
    const data = await RegistrationService.submitRegistration(req, req.body);
    return res.success(constants.MESSAGE.REGISTRATION.COMPLETED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.processPayment = async (req, res, next) => {
  try {
    const data = await RegistrationService.processPayment(req.body);
    return res.success(constants.MESSAGE.REGISTRATION.PAYMENT_SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
