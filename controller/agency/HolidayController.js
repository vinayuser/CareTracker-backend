const constants = require('../../common/constants');
const Validation = require('../../validation/index');
const HolidayService = require('../../services/agency/holiday.service');

module.exports.list = async (req, res, next) => {
  try {
    const data = await HolidayService.listHolidays(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.Holiday.create.validateAsync(req.body);
    const data = await HolidayService.createHoliday(req, req.body);
    return res.success(constants.MESSAGE.HOLIDAY.CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.Holiday.update.validateAsync(req.body);
    const data = await HolidayService.updateHoliday(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.HOLIDAY.UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await HolidayService.removeHoliday(req, req.params.id);
    return res.success(constants.MESSAGE.HOLIDAY.DELETED, data);
  } catch (error) {
    next(error);
  }
};
