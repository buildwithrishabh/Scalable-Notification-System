import { fcm } from "../config/firebase.js";
import { logger } from "../observability/logger.js";

export const sendPush = async ({ deviceToken, title, body, data = {} }) => {
  try {
    if (!fcm) {
      throw new Error(
        "[Push Provider] Firebase Admin SDK is not initialized. Please configure FIREBASE_* credentials in .env",
      );
    }

    // fcm data payload values must always be in string format
    const stringifedData = Object.entries(data).reduce((acc, [k, v]) => {
      acc[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
      return acc;
    }, {});

    const message = {
      token: deviceToken,
      notification: {
        title: title || "New Notification",
        body: body || "",
      },
      data: stringifedData,
    };

    const messageId = await fcm.send(message);

    logger.info(`[Push Provider] Message sent with ID: ${messageId}`, {
      messageId,
      deviceToken,
    });

    return { success: true, messageId };
  } catch (error) {
    logger.error(`[Push Provider] Failed to send message: ${error.message}`, {
      deviceToken,
      error: error.message,
    });
    throw error;
  }
};
