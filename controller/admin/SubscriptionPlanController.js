const constants = require('../../common/constants');
const { SubscriptionPlanService } = require('../../services');

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await SubscriptionPlanService.getAll();
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getActive = async (req, res, next) => {
  try {
    const data = await SubscriptionPlanService.getActive();
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await SubscriptionPlanService.getById(req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    const data = await SubscriptionPlanService.create(req.body);
    return res.success(constants.MESSAGE.RECORD_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    const data = await SubscriptionPlanService.update(req.params.id, req.body);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    await SubscriptionPlanService.remove(req.params.id);
    return res.success(constants.MESSAGE.RECORD_DELETED, {});
  } catch (error) {
    next(error);
  }
};
