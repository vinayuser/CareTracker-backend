const Model = require('../../models/index');
const constants = require('../../common/constants');

const getAgencyAccount = (req) => req.agency_owner || req.hr;
const getAgencyId = (req) => {
  const account = getAgencyAccount(req);
  const agencyId = account?.agencyId?._id || account?.agencyId;
  if (!agencyId) throw new Error('Agency not found for this account');
  return agencyId;
};

const formatSettings = (doc) => {
  if (!doc) return null;
  return {
    id: String(doc._id),
    agencyId: String(doc.agencyId),
    vendorName: doc.vendorName || '',
    complianceGoalPercent: doc.complianceGoalPercent ?? 90,
    defaultGraceMinutes: doc.defaultGraceMinutes ?? 15,
    geoRadiusMeters: doc.geoRadiusMeters ?? 500,
    geoEnforcement: doc.geoEnforcement || 'warn',
    allowedMethods: doc.allowedMethods || [],
    medicaidExportEnabled: Boolean(doc.medicaidExportEnabled),
    updatedAt: doc.updatedAt,
  };
};

const getSettings = async (req) => {
  const agencyId = getAgencyId(req);
  let settings = await Model.EvvSettingsModel.findOne({ agencyId });
  if (!settings) {
    settings = await Model.EvvSettingsModel.create({ agencyId });
  }
  return formatSettings(settings);
};

const updateSettings = async (req, payload) => {
  const agencyId = getAgencyId(req);
  const updates = {};
  if (payload.vendorName !== undefined) updates.vendorName = String(payload.vendorName || '').trim();
  if (payload.complianceGoalPercent !== undefined) {
    updates.complianceGoalPercent = Math.min(100, Math.max(0, Number(payload.complianceGoalPercent) || 90));
  }
  if (payload.defaultGraceMinutes !== undefined) {
    updates.defaultGraceMinutes = Number(payload.defaultGraceMinutes) === 30 ? 30 : 15;
  }
  if (payload.geoRadiusMeters !== undefined) {
    updates.geoRadiusMeters = Math.max(50, Number(payload.geoRadiusMeters) || 500);
  }
  if (payload.geoEnforcement !== undefined) {
    updates.geoEnforcement = ['off', 'warn', 'block'].includes(payload.geoEnforcement)
      ? payload.geoEnforcement
      : 'warn';
  }
  if (payload.allowedMethods !== undefined) {
    updates.allowedMethods = Array.isArray(payload.allowedMethods) ? payload.allowedMethods : [];
  }
  if (payload.medicaidExportEnabled !== undefined) {
    updates.medicaidExportEnabled = Boolean(payload.medicaidExportEnabled);
  }

  const settings = await Model.EvvSettingsModel.findOneAndUpdate(
    { agencyId },
    { $set: updates },
    { upsert: true, new: true },
  );
  return formatSettings(settings);
};

module.exports = {
  getSettings,
  updateSettings,
  MESSAGE: constants.MESSAGE.EVV_SETTINGS,
};
