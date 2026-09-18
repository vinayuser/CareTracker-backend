const constants = require('../../common/constants');
const AdminSchedulesService = require('../../services/admin/adminSchedules.service');

module.exports.getCaregiverSchedule = async (req, res, next) => {
  try {
    const data = await AdminSchedulesService.getCaregiverSchedule(req.query, req);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};
