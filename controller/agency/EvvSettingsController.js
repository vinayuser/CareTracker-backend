const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const EvvSettingsService = require('../../services/agency/evvSettings.service');

module.exports.get = async (req, res, next) => {
  try {
    const data = await EvvSettingsService.getSettings(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    if (Validation.EvvSettings?.update) {
      await Validation.EvvSettings.update.validateAsync(req.body || {});
    }
    const data = await EvvSettingsService.updateSettings(req, req.body || {});
    return res.success(constants.MESSAGE.EVV_SETTINGS.UPDATED, data);
  } catch (error) {
    next(error);
  }
};
