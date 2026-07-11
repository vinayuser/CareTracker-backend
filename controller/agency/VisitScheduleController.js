const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { VisitScheduleService } = require('../../services');

module.exports.getOptions = async (req, res, next) => {
  try {
    return res.success(constants.MESSAGE.SUCCESS, VisitScheduleService.getOptions());
  } catch (error) {
    next(error);
  }
};

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getScheduleStats(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getSchedules(req, req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getById = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getScheduleById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.create = async (req, res, next) => {
  try {
    await Validation.VisitSchedule.create.validateAsync(req.body);
    const data = await VisitScheduleService.createSchedule(req, req.body);
    return res.success(constants.MESSAGE.VISIT.SCHEDULE_CREATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.update = async (req, res, next) => {
  try {
    await Validation.VisitSchedule.update.validateAsync(req.body);
    const data = await VisitScheduleService.updateSchedule(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.VISIT.SCHEDULE_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.remove = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.removeSchedule(req, req.params.id);
    return res.success(constants.MESSAGE.VISIT.SCHEDULE_DELETED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.regenerate = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.regenerateScheduleVisits(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getVisits = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getVisits(req, req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCarePlanSources = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getCarePlanScheduleSources(req, req.params.carePlanId);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregiverVisits = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getCaregiverVisits(req, req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getEvvDashboard = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getEvvDashboard(req, req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregiverDashboard = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getCaregiverDashboard(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.checkIn = async (req, res, next) => {
  try {
    await Validation.VisitSchedule.checkIn.validateAsync(req.body || {});
    const data = await VisitScheduleService.checkInVisit(req, req.params.id, req.body || {});
    return res.success(constants.MESSAGE.VISIT.CHECKED_IN, data);
  } catch (error) {
    next(error);
  }
};

module.exports.checkOut = async (req, res, next) => {
  try {
    await Validation.VisitSchedule.checkOut.validateAsync(req.body || {});
    const data = await VisitScheduleService.checkOutVisit(req, req.params.id, req.body || {});
    return res.success(constants.MESSAGE.VISIT.CHECKED_OUT, data);
  } catch (error) {
    next(error);
  }
};

module.exports.approveVisit = async (req, res, next) => {
  try {
    await Validation.VisitSchedule.approve.validateAsync(req.body || {});
    const data = await VisitScheduleService.approveVisit(req, req.params.id, req.body || {});
    return res.success(constants.MESSAGE.VISIT.APPROVED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.rejectVisit = async (req, res, next) => {
  try {
    await Validation.VisitSchedule.reject.validateAsync(req.body || {});
    const data = await VisitScheduleService.rejectVisit(req, req.params.id, req.body || {});
    return res.success(constants.MESSAGE.VISIT.REJECTED, data);
  } catch (error) {
    next(error);
  }
};
