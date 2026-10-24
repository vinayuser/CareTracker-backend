const Joi = require('joi');

const expoPushToken = Joi.string()
  .trim()
  .pattern(/^Expo(nent)?PushToken\[.+\]$/)
  .required()
  .messages({
    'string.pattern.base': 'Invalid Expo push token',
  });

module.exports = {
  register: Joi.object({
    pushToken: expoPushToken,
    platform: Joi.string().trim().lowercase().valid('android', 'ios').required(),
    deviceId: Joi.string().trim().min(8).max(128).required(),
  }),
  deregister: Joi.object({
    pushToken: expoPushToken,
  }),
};
