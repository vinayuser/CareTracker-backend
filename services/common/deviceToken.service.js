const mongoose = require('mongoose');
const Model = require('../../models/index');
const functions = require('../../common/functions');

const toOid = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (mongoose.Types.ObjectId.isValid(String(value))) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return null;
};

const getSessionUser = (req) => {
  if (req.super_admin) {
    return {
      userId: toOid(req.super_admin._id || req.super_admin.id),
      agencyId: null,
    };
  }
  const account = req.agency_owner || req.hr || req.caregiver || req.client;
  if (!account) return null;
  return {
    userId: toOid(account._id || account.id),
    agencyId: toOid(account.agencyId?._id || account.agencyId),
  };
};

const formatOne = (doc) => {
  const row = functions.toClientDoc(doc);
  if (!row) return null;
  if (row.userId) row.userId = String(row.userId);
  if (row.agencyId) row.agencyId = String(row.agencyId);
  row.updatedAt = doc.updatedAt?.toISOString?.() || doc.updatedAt;
  return row;
};

const registerDevice = async (req, payload = {}) => {
  const session = getSessionUser(req);
  if (!session?.userId) throw new Error('Unauthorized');

  const deviceId = String(payload.deviceId || '').trim();
  const pushToken = String(payload.pushToken || '').trim();
  const platform = String(payload.platform || '').trim().toLowerCase();

  const doc = await Model.DeviceTokenModel.findOneAndUpdate(
    { deviceId },
    {
      $set: {
        userId: session.userId,
        agencyId: session.agencyId,
        deviceId,
        pushToken,
        platform,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await Model.DeviceTokenModel.deleteMany({
    pushToken,
    deviceId: { $ne: deviceId },
  });

  return formatOne(doc);
};

const deregisterDevice = async (req, payload = {}) => {
  const session = getSessionUser(req);
  if (!session?.userId) throw new Error('Unauthorized');

  const pushToken = String(payload.pushToken || req.query?.pushToken || '').trim();
  if (!pushToken) throw new Error('pushToken is required');

  const result = await Model.DeviceTokenModel.deleteMany({
    userId: session.userId,
    pushToken,
  });

  return { deleted: result.deletedCount || 0 };
};

const listTokensForUser = async (userId) => {
  const id = toOid(userId);
  if (!id) return [];
  return Model.DeviceTokenModel.find({ userId: id }).select('pushToken platform deviceId').lean();
};

const removeByPushTokens = async (pushTokens = []) => {
  const tokens = [...new Set(pushTokens.map((token) => String(token || '').trim()).filter(Boolean))];
  if (!tokens.length) return 0;
  const result = await Model.DeviceTokenModel.deleteMany({ pushToken: { $in: tokens } });
  return result.deletedCount || 0;
};

module.exports = {
  registerDevice,
  deregisterDevice,
  listTokensForUser,
  removeByPushTokens,
};
