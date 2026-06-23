const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { ClientService } = require('../../services');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await ClientService.getStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await ClientService.getAll(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await ClientService.getById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.Client.create.validateAsync(req.body);
    const data = await ClientService.create(req, req.body);
    return res.success(constants.MESSAGE.CLIENT.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.Client.update.validateAsync(req.body);
    const data = await ClientService.update(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.CLIENT.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await ClientService.remove(req, req.params.id);
    return res.success(constants.MESSAGE.CLIENT.DELETED, data);
  } catch (error) {
    next(error);
  }
};
