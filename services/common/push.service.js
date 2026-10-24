const DeviceTokenService = require('./deviceToken.service');

const RECEIPT_CHECK_DELAY_MS = 15 * 60 * 1000;
const pendingReceipts = new Map();
let expoClient = null;
let ExpoClass = null;
let receiptTimer = null;

const asString = (value) => {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
};

const flattenData = (notification = {}) => {
  const data = {
    type: asString(notification.type),
    entityId: asString(notification.entityId),
    notificationId: asString(notification.id || notification._id),
    entityType: asString(notification.entityType),
    category: asString(notification.category),
    tone: asString(notification.tone),
    priority: asString(notification.priority),
    actionUrl: asString(notification.actionUrl),
    actionLabel: asString(notification.actionLabel),
    recipientType: asString(notification.recipientType),
    agencyId: asString(notification.agencyId),
  };

  const metadata = notification.metadata && typeof notification.metadata === 'object'
    ? notification.metadata
    : {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (data[key] != null && data[key] !== '') return;
    const text = asString(value);
    if (text) data[key] = text;
  });

  return data;
};

const loadExpo = async () => {
  if (!ExpoClass) {
    ({ Expo: ExpoClass } = await import('expo-server-sdk'));
  }
  if (!expoClient) {
    const accessToken = String(process.env.EXPO_ACCESS_TOKEN || '').trim();
    expoClient = new ExpoClass({
      accessToken: accessToken || undefined,
    });
  }
  return { Expo: ExpoClass, expo: expoClient };
};

const deleteDeadTokens = async (tokens = []) => {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return;
  const deleted = await DeviceTokenService.removeByPushTokens(unique);
  if (deleted) {
    console.warn(`[push] removed ${deleted} DeviceNotRegistered token(s)`);
  }
};

const tokenFromMessage = (message) => {
  const to = message?.to;
  if (Array.isArray(to)) return to[0] || '';
  return to || '';
};

const isDeviceNotRegistered = (result) =>
  result?.status === 'error' && result?.details?.error === 'DeviceNotRegistered';

const scheduleReceiptCheck = () => {
  if (receiptTimer || pendingReceipts.size === 0) return;
  receiptTimer = setTimeout(() => {
    receiptTimer = null;
    processReceipts().catch((err) => console.error('[push] receipts', err.message));
  }, RECEIPT_CHECK_DELAY_MS);
  if (typeof receiptTimer.unref === 'function') receiptTimer.unref();
};

const processReceipts = async () => {
  if (!pendingReceipts.size) return;
  const snapshot = new Map(pendingReceipts);
  pendingReceipts.clear();

  try {
    const { expo } = await loadExpo();
    const receiptIds = [...snapshot.keys()];
    const chunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    const dead = [];

    for (const chunk of chunks) {
      // eslint-disable-next-line no-await-in-loop
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);
      Object.entries(receipts || {}).forEach(([receiptId, receipt]) => {
        if (isDeviceNotRegistered(receipt)) {
          dead.push(snapshot.get(receiptId));
        } else if (receipt?.status === 'error') {
          console.error('[push] receipt error', receipt.message || receipt.details?.error);
        }
      });
    }

    await deleteDeadTokens(dead);
  } finally {
    if (pendingReceipts.size) scheduleReceiptCheck();
  }
};

const sendForNotification = async (notification) => {
  const recipientId = notification?.recipientId;
  if (!recipientId || !notification?.title) return { sent: 0 };

  const devices = await DeviceTokenService.listTokensForUser(recipientId);
  if (!devices.length) return { sent: 0 };

  const { Expo, expo } = await loadExpo();
  const data = flattenData(notification);
  const messages = [];
  const invalid = [];

  devices.forEach((device) => {
    const pushToken = String(device.pushToken || '').trim();
    if (!Expo.isExpoPushToken(pushToken)) {
      invalid.push(pushToken);
      return;
    }
    messages.push({
      to: pushToken,
      title: String(notification.title),
      body: String(notification.body || ''),
      sound: 'default',
      data,
    });
  });

  if (invalid.length) await deleteDeadTokens(invalid);
  if (!messages.length) return { sent: 0 };

  const deadFromTickets = [];
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, index) => {
        const pushToken = tokenFromMessage(chunk[index]);
        if (isDeviceNotRegistered(ticket)) {
          deadFromTickets.push(pushToken);
          return;
        }
        if (ticket?.status === 'error') {
          console.error('[push] ticket error', ticket.message || ticket.details?.error);
          return;
        }
        if (ticket?.id && pushToken) {
          pendingReceipts.set(ticket.id, pushToken);
        }
      });
    } catch (err) {
      console.error('[push] send failed', err.message);
    }
  }

  await deleteDeadTokens(deadFromTickets);
  scheduleReceiptCheck();
  return { sent: messages.length };
};

module.exports = {
  sendForNotification,
  flattenData,
};
