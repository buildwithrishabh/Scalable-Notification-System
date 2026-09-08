import Joi from 'joi';

// 1. Create Notification Schema
export const createNotificationSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  type: Joi.string().max(50).required(),
  title: Joi.string().max(255).required(),
  body: Joi.string().required(),
  channels: Joi.array().items(Joi.string().valid('EMAIL', 'SMS', 'PUSH', 'IN_APP')).min(1).required(),
  data: Joi.object().optional().default({}),
  priority: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'CRITICAL').default('NORMAL'),
  scheduledAt: Joi.date().iso().optional().allow(null),
});

// 2. User Preferences Schema
export const updatePreferencesSchema = Joi.object({
  email_enabled: Joi.boolean().required(),
  push_enabled: Joi.boolean().required(),
  sms_enabled: Joi.boolean().required(),
  in_app_enabled: Joi.boolean().required(),
});

// 3. User Authentication Schemas
export const registerUserSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  role: Joi.string().valid('USER', 'ADMIN').default('USER'),
});

export const loginUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});
