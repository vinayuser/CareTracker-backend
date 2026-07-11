const Joi = require('joi');

module.exports.create = Joi.object({
  care_plan_id: Joi.string().required(),
  client_id: Joi.string().allow('', null),
  caregiver_account_id: Joi.string().required(),
  service_area: Joi.string().allow('', null),
  care_need_area_key: Joi.string().allow('', null),
  recurrence_type: Joi.string().valid('Daily', 'Weekly', 'Monthly').required(),
  days_of_week: Joi.array().items(Joi.string().valid('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')).default([]),
  day_of_month: Joi.number().integer().min(1).max(31).allow(null),
  start_time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  end_time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
  grace_minutes: Joi.number().valid(15, 30).default(15),
  effective_from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
  effective_to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  timezone: Joi.string().allow('', null),
  notes: Joi.string().allow('', null),
  address: Joi.string().allow('', null),
  status: Joi.string().valid('Active', 'Paused', 'Ended'),
});

module.exports.update = Joi.object({
  caregiver_account_id: Joi.string(),
  service_area: Joi.string().allow('', null),
  recurrence_type: Joi.string().valid('Daily', 'Weekly', 'Monthly'),
  days_of_week: Joi.array().items(Joi.string().valid('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  day_of_month: Joi.number().integer().min(1).max(31).allow(null),
  start_time: Joi.string().pattern(/^\d{2}:\d{2}$/),
  end_time: Joi.string().pattern(/^\d{2}:\d{2}$/),
  grace_minutes: Joi.number().valid(15, 30),
  effective_from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow('', null),
  notes: Joi.string().allow('', null),
  address: Joi.string().allow('', null),
  status: Joi.string().valid('Active', 'Paused', 'Ended'),
}).min(1);

module.exports.checkIn = Joi.object({
  method: Joi.string().allow('', null),
  lat: Joi.number().allow(null),
  lng: Joi.number().allow(null),
  exception_reason: Joi.string().allow('', null),
});

module.exports.checkOut = Joi.object({
  method: Joi.string().allow('', null),
  lat: Joi.number().allow(null),
  lng: Joi.number().allow(null),
  notes: Joi.string().allow('', null),
});

module.exports.approve = Joi.object({
  notes: Joi.string().allow('', null),
});

module.exports.reject = Joi.object({
  reason: Joi.string().trim().min(3).required(),
  notes: Joi.string().allow('', null),
});
