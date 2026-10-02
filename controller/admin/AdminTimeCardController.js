const constants = require('../../common/constants');
const AdminTimeCardService = require('../../services/admin/adminTimeCard.service');

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = await AdminTimeCardService.getOptions();
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getList = async (req, res, next) => {
  try {
    const data = await AdminTimeCardService.getList(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getDetail = async (req, res, next) => {
  try {
    const data = await AdminTimeCardService.getDetail(req.params.id, req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.exportCsv = async (req, res, next) => {
  try {
    const { filename, csv } = await AdminTimeCardService.exportCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
};
