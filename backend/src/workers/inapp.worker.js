import { Worker } from "bullmq";
import { QUEUES } from "../queues/queue.constants.js";
import { redisConfig, redisPublisher } from "../config/redis.js";
import { db } from "../config/database.js";
import { logger } from "../observability/logger.js";
import { notificationsDeliveredCounter } from "../observability/metrics.js";

export const startInAppWorker = () => {
  const worker = new Worker(
    QUEUES.IN_APP,
    async (job) => {
      const { deliveryId, userId, payload } = job.data;

      logger.info(
        `[InAppWorker] Processing job ${job.id} for delivery ${deliveryId} (Attempt: ${job.attemptsMade + 1})`,
        { jobId: job.id, deliveryId, userId, attempt: job.attemptsMade + 1 },
      );

      try {
        // update db status = sent
        await db.query(
          `UPDATE notification_deliveries 
           SET status = 'SENT', sent_at = NOW() 
           WHERE id = $1`,
          [deliveryId],
        );

        // publish to redis pub / sub channel for websockets
        const everyPayload = {
          deliveryId,
          title: payload.title,
          body: payload.body,
          type: payload.type,
          data: payload.data || {},
          created_at: new Date().toISOString(),
        };

        await redisPublisher.publish(
          `user:notifications:${userId}`,
          JSON.stringify(everyPayload),
        );

        // Increment Prometheus success metric
        notificationsDeliveredCounter.inc({
          channel: "IN_APP",
          status: "SUCCESS",
        });

        logger.info(
          `[InAppWorker] Notification sent to user ${userId} via Redis Pub/Sub`,
          { deliveryId, userId },
        );
      } catch (error) {
        logger.error(`[InAppWorker] Job ${job.id} failed: ${error.message}`, {
          jobId: job.id,
          deliveryId,
          userId,
          error: error.message,
        });

        // record attempt and last error in db
        await db.query(
          `UPDATE notification_deliveries
           SET attempts = attempts + 1, last_error = $1
           WHERE id = $2`,
          [error.message, deliveryId],
        );

        // rethrow to trigger retry or DLQ
        throw error;
      }
    },
    {
      connection: redisConfig,
      concurrency: 25,
    },
  );

  // handle failed jobs moved to dlq after max retries
  worker.on("failed", async (job, err) => {
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      logger.error(
        `[InAppWorker][DLQ] Job ${job.id} permanently failed. Moving to DLQ.`,
        {
          jobId: job.id,
          deliveryId: job.data?.deliveryId,
          error: err.message,
        },
      );

      const { deliveryId, payload } = job.data;

      // update status to failed
      await db.query(
        `update notification_deliveries set 
        status = 'FAILED' 
        where id = $1`,
        [deliveryId],
      );

      // save to dead letter table
      await db.query(
        `insert into dead_letter_notifications 
        (delivery_id , channel , payload , failure_reason)
        values ($1 , 'IN_APP' , $2 , $3)`,
        [deliveryId, JSON.stringify(payload), err.message],
      );

      notificationsDeliveredCounter.inc({
        channel: "IN_APP",
        status: "FAILED",
      });

      logger.info(
        `[InAppWorker][DLQ] Job ${job.id} moved to DLQ successfully`,
        {
          jobId: job.id,
          deliveryId,
        },
      );
    }
  });

  return worker;
};