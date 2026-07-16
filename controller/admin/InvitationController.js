const Validation = require('../../validation/index');
const constants = require('../../common/constants');
const { InvitationService } = require('../../services');

module.exports.getStats = async (req, res, next) => {
  try {
    const data = await InvitationService.getStats();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getAll = async (req, res, next) => {
  try {
    const data = await InvitationService.getAll(req);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.send = async (req, res, next) => {
  try {
    await Validation.Invitation.create.validateAsync(req.body);
    const data = await InvitationService.send(req, req.body);
    return res.success(constants.MESSAGE.INVITATION.SENT, data);
  } catch (error) {
    next(error);
  }
};

module.exports.resend = async (req, res, next) => {
  try {
    const data = await InvitationService.resend(req, req.params.id);
    return res.success(constants.MESSAGE.INVITATION.RESENT, data);
  } catch (error) {
    next(error);
  }
};

module.exports.validate = async (req, res, next) => {
  try {
    const data = await InvitationService.validateToken(req.query.token);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
