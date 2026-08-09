const constants = require('../../common/constants');
const ClientPortalService = require('../../services/agency/clientPortal.service');
const VisitScheduleService = require('../../services/agency/visitSchedule.service');
const EvvEnrollmentService = require('../../services/agency/evvEnrollment.service');

module.exports.getDashboard = async (req, res, next) => {
  try {
    const data = await ClientPortalService.getDashboard(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCarePlans = async (req, res, next) => {
  try {
    const data = await ClientPortalService.getCarePlans(req);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCarePlanById = async (req, res, next) => {
  try {
    const data = await ClientPortalService.getCarePlanById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.signCarePlan = async (req, res, next) => {
  try {
    const data = await ClientPortalService.signCarePlan(req, req.params.id);
    return res.success(constants.MESSAGE.CARE_PLAN.SIGNED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getVisits = async (req, res, next) => {
  try {
    const data = await VisitScheduleService.getClientVisits(req, req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregivers = async (req, res, next) => {
  try {
    const data = await ClientPortalService.getCaregivers(req);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregiverById = async (req, res, next) => {
  try {
    const data = await ClientPortalService.getCaregiverById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getEvvEnrollments = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getClientAll(req);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getEvvEnrollmentById = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.getClientById(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.signEvvEnrollment = async (req, res, next) => {
  try {
    const data = await EvvEnrollmentService.signClient(req, req.params.id, req.body);
    return res.success(constants.MESSAGE.EVV_ENROLLMENT.CLIENT_SIGNED, data);
  } catch (error) {
    next(error);
  }
};
