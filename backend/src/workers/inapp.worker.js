import { Worker } from "bullmq";
import { QUEUES } from "../queues/queue.constants.js";
import { redisConfig, redisPublisher } from "../config/redis.js";
import { db } from "../config/database.js";
import { logger } from "../observability/logger.js";
import { notificationsDeliveredCounter } from "../observability/metrics.js";

export const startInAppWorker = () => {
  return new Worker(QUEUES.IN_APP, async (job) => {
    const { deliveryId, userId, payload } = job.data;

    // update delivery status in postgreSql
    await db.query(
      `update notification_deliveries set status = 'SENT' , sent_at = NOW() where id = $1`,
      [deliveryId],
    );

    // publish to redis pub/sub channel for websockets
    const eventPayload = {
        deliveryId,
        title: payload.title,
        body: payload.body,
        type: payload.type,
        data: payload.data,
        createdAt: new Date().toISOString()
    };

    await redisPublisher.publish(`user:notifications:${userId}` , JSON.stringify(eventPayload));
    
    notificationsDeliveredCounter.inc({
      channel: "IN_APP",
      status: "SUCCESS",
    });

    logger.info(`[InAppWorker] Notification sent to user ${userId} via Redis Pub/Sub`, {
      deliveryId,
      userId,
    });
  } , {
    connection: redisConfig , concurrency: 25
  });
};

