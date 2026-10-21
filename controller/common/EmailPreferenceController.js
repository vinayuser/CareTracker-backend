const constants = require('../../common/constants');
const EmailPreferenceService = require('../../services/common/emailPreference.service');

module.exports.getPreferences = async (req, res, next) => {
  try {
    const data = await EmailPreferenceService.getPreferences(req.query.email);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.savePreferences = async (req, res, next) => {
  try {
    const data = await EmailPreferenceService.savePreferences(req.body.email, req.body);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.unsubscribe = async (req, res, next) => {
  try {
    const data = await EmailPreferenceService.unsubscribe(req.body.email || req.query.email);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
