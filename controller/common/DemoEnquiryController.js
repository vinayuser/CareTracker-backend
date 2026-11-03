const constants = require('../../common/constants');
const Validation = require('../../validation/index');
const DemoEnquiryService = require('../../services/common/demoEnquiry.service');

module.exports.create = async (req, res, next) => {
  try {
    const payload = await Validation.DemoEnquiry.create.validateAsync(req.body);
    const data = await DemoEnquiryService.create(req, payload);
    return res.success(constants.MESSAGE.DEMO_ENQUIRY.SUBMITTED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.list = async (req, res, next) => {
  try {
    const data = await DemoEnquiryService.list(req.query || {});
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getOne = async (req, res, next) => {
  try {
    const data = await DemoEnquiryService.getById(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
