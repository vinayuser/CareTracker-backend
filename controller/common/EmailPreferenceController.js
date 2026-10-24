const constants = require('../../common/constants');
const EmailPreferenceService = require('../../services/common/emailPreference.service');

const scopeFrom = (req) => req.body?.agencyId || req.body?.scope || req.query?.agencyId || req.query?.scope;

module.exports.getPreferences = async (req, res, next) => {
  try {
    const data = await EmailPreferenceService.getPreferences(req.query.email, scopeFrom(req));
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.savePreferences = async (req, res, next) => {
  try {
    const data = await EmailPreferenceService.savePreferences(req.body.email, req.body, scopeFrom(req));
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.unsubscribe = async (req, res, next) => {
  try {
    const data = await EmailPreferenceService.unsubscribe(
      req.body.email || req.query.email,
      scopeFrom(req),
    );
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
