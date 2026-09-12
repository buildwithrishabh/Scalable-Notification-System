import { logger } from "../observability/logger.js";

export const sendSms = async ({ to, text }) => {
  logger.info(`[SmsProvider] Sending SMS`, { to, text });
  await new Promise((res) => setTimeout(res, 150));
  return { success: true, messageId: `sms_${Date.now()}` };
};
