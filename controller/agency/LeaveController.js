const constants = require('../../common/constants');
const Validation = require('../../validation/index');
const LeavePolicyService = require('../../services/agency/leavePolicy.service');
const LeaveRequestService = require('../../services/agency/leaveRequest.service');

module.exports.getPolicy = async (req, res, next) => {
  try {
    const data = await LeavePolicyService.getPolicy(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.savePolicy = async (req, res, next) => {
  try {
    await Validation.Leave.savePolicy.validateAsync(req.body);
    const data = await LeavePolicyService.savePolicy(req, req.body);
    return res.success(constants.MESSAGE.LEAVE.POLICY_SAVED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.listRequests = async (req, res, next) => {
  try {
    const data = await LeaveRequestService.listAgencyRequests(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.approve = async (req, res, next) => {
  try {
    const data = await LeaveRequestService.reviewRequest(req, req.params.id, 'approve', req.body?.note);
    return res.success(constants.MESSAGE.LEAVE.APPROVED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.reject = async (req, res, next) => {
  try {
    const data = await LeaveRequestService.reviewRequest(req, req.params.id, 'reject', req.body?.note);
    return res.success(constants.MESSAGE.LEAVE.REJECTED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getCaregiverBalance = async (req, res, next) => {
  try {
    const data = await LeaveRequestService.getAgencyCaregiverBalance(req, req.params.id);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.myLeaves = async (req, res, next) => {
  try {
    const data = await LeaveRequestService.listMine(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.apply = async (req, res, next) => {
  try {
    await Validation.Leave.apply.validateAsync(req.body);
    const data = await LeaveRequestService.createRequest(req, req.body);
    return res.success(constants.MESSAGE.LEAVE.APPLIED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.cancelMine = async (req, res, next) => {
  try {
    const data = await LeaveRequestService.cancelMine(req, req.params.id);
    return res.success(constants.MESSAGE.LEAVE.CANCELLED, data);
  } catch (error) {
    next(error);
  }
};
