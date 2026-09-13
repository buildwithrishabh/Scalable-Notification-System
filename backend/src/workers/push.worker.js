import { Worker } from "bullmq";
import { QUEUES } from "../queues/queue.constants.js";
import { redisConfig } from "../config/redis.js";
import { db } from "../config/database.js";
import { sendPush } from "../providers/push.provider.js";
import { logger } from "../observability/logger.js";
import { notificationsDeliveredCounter } from "../observability/metrics.js";

export const startPushWorker = () => {
  const worker = new Worker(
    QUEUES.PUSH,
    async (job) => {
      const { deliveryId, userId, payload } = job.data;

      logger.info(
        `[PushWorker] Processing job ${job.id} for delivery ${deliveryId} (Attempt: ${job.attemptsMade + 1})`,
        { jobId: job.id, deliveryId, userId, attempt: job.attemptsMade + 1 },
      );

      let deviceToken = payload.deviceToken;

      try {
        // fetch active device token from db if not provided directly in payload
        if (!deviceToken && userId) {
          const deviceResult = await db.query(
            `SELECT device_token FROM user_devices
             WHERE user_id = $1 AND is_active = true
             ORDER BY updated_at DESC LIMIT 1`,
            [userId],
          );
          deviceToken = deviceResult.rows[0]?.device_token;
        }

        if (!deviceToken) {
          throw new Error(`No active device token found for user ${userId}`);
        }

        // dispatch push via firebase admin sdk
        const response = await sendPush({
          deviceToken,
          title: payload.title || payload.subject,
          body: payload.body || payload.text,
          data: payload.data || {},
        });

        // update db: status = sent
        await db.query(
          `UPDATE notification_deliveries 
           SET status = 'SENT', provider_message_id = $1, sent_at = NOW()
           WHERE id = $2`,
          [response.messageId, deliveryId],
        );

        notificationsDeliveredCounter.inc({
          channel: "PUSH",
          status: "SUCCESS",
        });
      } catch (error) {
        logger.error(`[PushWorker] Job ${job.id} failed: ${error.message}`, {
          jobId: job.id,
          deliveryId,
          error: error.message,
        });

        // Record attempt and last error in db
        await db.query(
          `UPDATE notification_deliveries 
           SET attempts = attempts + 1, last_error = $1
           WHERE id = $2`,
          [error.message, deliveryId],
        );

        // Invalidate stale tokens if token is expired/unregistered
        if (
          error.code === "messaging/registration-token-not-registered" ||
          error.code === "messaging/invalid-registration-token"
        ) {
          if (deviceToken) {
            await db.query(
              `UPDATE user_devices SET is_active = false WHERE device_token = $1`,
              [deviceToken],
            );
            logger.warn(`[PushWorker] Marked invalid FCM token as inactive`, {
              token: deviceToken,
            });
          }
        }

        // Re-throw error so BullMQ triggers retry / DLQ logic
        throw error;
      }
    },
    {
      connection: redisConfig,
      concurrency: 15, // Process 15 push notification concurrently
    },
  );

  // dlq handler: triggered when all retry attempts fail
  worker.on("failed", async (job, err) => {
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      logger.error(
        `[PushWorker][DLQ] Job ${job.id} permanently failed. Moving to DLQ.`,
        {
          jobId: job.id,
          deliveryId: job.data?.deliveryId,
          error: err.message,
        },
      );

      const { deliveryId, payload } = job.data;

      await db.query(
        `UPDATE notification_deliveries SET status = 'FAILED' WHERE id = $1`,
        [deliveryId],
      );

      // Save to dead letter queue audit table
      await db.query(
        `INSERT INTO dead_letter_notifications (delivery_id, channel, payload, failure_reason)
         VALUES ($1, 'PUSH', $2, $3)`,
        [deliveryId, JSON.stringify(payload), err.message],
      );

      notificationsDeliveredCounter.inc({
        channel: "PUSH",
        status: "FAILED",
      });

      logger.info(`[PushWorker][DLQ] Job ${job.id} moved to DLQ`, {
        jobId: job.id,
        deliveryId,
      });
    }
  });

  return worker;
};
