const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { EvvEnrollmentService } = require('../../services');

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getCaregiverAll(req);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getCaregiverById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.submit = async (req, res, next) => {
  try {
    await Validation.EvvEnrollment.submit.validateAsync(req.body);
    const data = await EvvEnrollmentService.submitCaregiver(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.EVV_ENROLLMENT.SUBMITTED, data);
  } catch (error) {
    next(error);
  }
};
