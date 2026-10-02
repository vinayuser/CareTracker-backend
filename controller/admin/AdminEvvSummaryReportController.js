const constants = require('../../common/constants');
const AdminEvvSummaryReportService = require('../../services/admin/adminEvvSummaryReport.service');

module.exports.getOptions = async (req, res, next) => {
  try {
    const data = await AdminEvvSummaryReportService.getOptions(req.query);
    return res.success(constants.MESSAGE.SUCCESS, data);
  } catch (error) {
    next(error);
  }
};

module.exports.getList = async (req, res, next) => {
  try {
    const data = await AdminEvvSummaryReportService.getList(req.query);
    return res.success(constants.MESSAGE.LIST, data);
  } catch (error) {
    next(error);
  }
};

module.exports.exportCsv = async (req, res, next) => {
  try {
    const { filename, csv } = await AdminEvvSummaryReportService.exportCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
};
