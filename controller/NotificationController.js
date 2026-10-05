const constants = require('../common/constants');
const NotificationService = require('../services/common/notification.service');

module.exports.list = async (req, res, next) => {
  try {
    const data = await NotificationService.listForRequest(req, req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.unreadCount = async (req, res, next) => {
  try {
    const data = await NotificationService.unreadCountForRequest(req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.markRead = async (req, res, next) => {
  try {
    const data = await NotificationService.markRead(req, req.params.id);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};

module.exports.markAllRead = async (req, res, next) => {
  try {
    const data = await NotificationService.markAllRead(req);
    return res.success(constants.MESSAGE.RECORD_UPDATED, data);
  } catch (error) {
    next(error);
  }
};
