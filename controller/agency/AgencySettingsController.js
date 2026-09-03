const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const AgencySettingsService = require('../../services/agency/agencySettings.service');

module.exports.get = async (req, res, next) => {
  try {
    const data = await AgencySettingsService.getSettings(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    if (Validation.AgencySettings?.update) {
      await Validation.AgencySettings.update.validateAsync(req.body || {});
    }
    const data = await AgencySettingsService.updateSettings(req, req.body || {});
    return res.success(AgencySettingsService.MESSAGE.UPDATED, data);
  } catch (error) {
    next(error);
  }
};
