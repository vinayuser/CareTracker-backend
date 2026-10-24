const constants = require('../../common/constants');
const MailchimpService = require('../../services/common/mailchimp.service');
const AgencyMarketingService = require('../../services/agency/agencyMarketing.service');

module.exports.getState = async (req, res, next) => {
  try {
    const data = await AgencyMarketingService.getState(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.saveState = async (req, res, next) => {
  try {
    const data = await AgencyMarketingService.saveState(req, req.body || {});
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAudience = async (req, res, next) => {
  try {
    const data = await AgencyMarketingService.getAudience(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getMailchimpStatus = async (req, res, next) => {
  try {
    const data = await MailchimpService.getStatus();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.sendCampaign = async (req, res, next) => {
  try {
    const data = await AgencyMarketingService.sendCampaign(req, req.body || {});
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
