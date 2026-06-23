const constants = require('../../common/constants');
const { AgencyService } = require('../../services');

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await AgencyService.getAll();
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await AgencyService.getById(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    const data = await AgencyService.create(req.body);
    return res.success(constants.MESSAGE.RECORD_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    const data = await AgencyService.update(req.params.id, req.body);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    await AgencyService.remove(req.params.id);
    return res.success(constants.MESSAGE.RECORD_DELETED, {});
  } catch (error) {
    next(error);
  }
};
