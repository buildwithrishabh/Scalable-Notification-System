import { Worker } from "bullmq";
import { QUEUES } from "../queues/queue.constants.js";
import { redisConfig } from "../config/redis.js";
import { db } from "../config/database.js";
import { sendEmail } from "../providers/email.provider.js";

export const startEmailWorker = () => {
  const worker = new Worker(
    QUEUES.EMAIL,
    async (job) => {
      const { deliveryId, payload } = job.data;
      console.log(
        `[EmailWorker] Processing job ${job.id} for delivery ${deliveryId} (Attempt: ${job.attemptsMade + 1})`,
      );

      try {
        const response = await sendEmail({
          to: payload.to,
          subject: payload.subject,
          html: payload.html || payload.body,
          text: payload.body || payload.text,
        });

        // Update DB: status = SENT
        await db.query(
          `UPDATE notification_deliveries
           SET status = 'SENT', provider_message_id = $1, sent_at = NOW()
           WHERE id = $2`,
          [response.messageId, deliveryId],
        );
      } catch (error) {
        console.error(`[EmailWorker] Job ${job.id} failed: ${error.message}`);

        // Record last error and attempts in DB
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
      concurrency: 10, // Horizontally process 10 job concurrently
    },
  );

  // dlq handler: triggered when all 3 attempts fail
  worker.on('failed', async (job, err) => {
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      console.error(`[EmailWorker][DLQ] Job ${job.id} permanently failed. Moving to DLQ.`);

      const { deliveryId, payload } = job.data;
      await db.query(
        `UPDATE notification_deliveries SET status = 'FAILED' WHERE id = $1`,
        [deliveryId],
      );

      // saving the job to dead letter queue
      await db.query(
        `INSERT INTO dead_letter_notifications (delivery_id, channel, payload, failure_reason)
         VALUES ($1, 'EMAIL', $2, $3)`,
        [deliveryId, JSON.stringify(payload), err.message],
      );

      console.log(`[EmailWorker][DLQ] Job ${job.id} moved to DLQ`);
    }
  });
  return worker;
};
