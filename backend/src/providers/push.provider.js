import { logger } from "../observability/logger.js";

export const sendPush = async ({ deviceToken, title, body, data }) => {
  logger.info(`[PushProvider] Sending FCM Push`, { deviceToken, title });
  await new Promise((res) => setTimeout(res, 100));
  return { success: true, messageId: `fcm_${Date.now()}` };
};
