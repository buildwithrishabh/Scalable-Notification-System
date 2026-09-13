import { Worker } from "bullmq";
import { QUEUES } from "../queues/queue.constants.js";
import { redisConfig } from "../config/redis.js";
import { db } from "../config/database.js";
import { sendSms } from "../providers/sms.provider.js";
import { logger } from "../observability/logger.js";
import { notificationsDeliveredCounter } from "../observability/metrics.js";

export const startSmsWorker = () => {
  const worker = new Worker(
    QUEUES.SMS,
    async (job) => {
      const { deliveryId, payload , userId } = job.data;
      logger.info(
        `[SmsWorker] Processing job ${job.id} for delivery ${deliveryId} (Attempt: ${job.attemptsMade + 1})`,
        { jobId: job.id, deliveryId, attempt: job.attemptsMade + 1 },
      );

      try {
        let toPhone = payload.to;

        // agar payload me phone number nahi hai to database se user ka phone fetch karo
        if (!toPhone && userId) {
          const userResult = await db.query(
            `select phone from users where id = $1`, [userId],
          );
          toPhone = userResult.rows[0]?.phone;

          // agar ab bhi phone number nahi hai to error throw karo
          if (!toPhone) {
            throw new Error("Phone number not found for user");
          }
        }

        const response = await sendSms({
          to: toPhone,
          text: payload.body || payload.text,
        });

        // Update DB: status = SENT
        await db.query(
          `UPDATE notification_deliveries 
           SET status = 'SENT', provider_message_id = $1, sent_at = NOW() 
           WHERE id = $2`,
          [response.messageId, deliveryId],
        );

        notificationsDeliveredCounter.inc({
          channel: "SMS",
          status: "SUCCESS",
        });
      } catch (error) {
        logger.error(`[SmsWorker] Job ${job.id} failed: ${error.message}`, {
          jobId: job.id,
          deliveryId,
          error: error.message,
        });

        // Record attempt and last error in DB
        await db.query(
          `UPDATE notification_deliveries 
           SET attempts = attempts + 1, last_error = $1 
           WHERE id = $2`,
          [error.message, deliveryId],
        );

        throw error;
      }
    },
    {
      connection: redisConfig,
      concurrency: 10,
    },
  );

  // DLQ Handler: triggered when all retry attempts fail
  worker.on("failed", async (job, err) => {
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      logger.error(
        `[SmsWorker][DLQ] Job ${job.id} permanently failed. Moving to DLQ.`,
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

      await db.query(
        `INSERT INTO dead_letter_notifications (delivery_id, channel, payload, failure_reason)
         VALUES ($1, 'SMS', $2, $3)`,
        [deliveryId, JSON.stringify(payload), err.message],
      );

      notificationsDeliveredCounter.inc({
        channel: "SMS",
        status: "FAILED",
      });

      logger.info(`[SmsWorker][DLQ] Job ${job.id} moved to DLQ`, {
        jobId: job.id,
        deliveryId,
      });
    }
  });

  return worker;
};
