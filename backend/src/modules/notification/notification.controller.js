import { db } from "../../config/database.js";
import { getUserPreferences } from "../preferences/preferences.service.js";
import { dispatchToQueue } from "../../queues/notification.producers.js";
import { notificationsReceivedCounter } from "../../observability/metrics.js";
import { logger } from "../../observability/logger.js";

export const createNotificationHandler = async (req, res, next) => {
  try {
    const {
      userId,
      type,
      title,
      body,
      channels,
      data = {},
      priority = "NORMAL",
      scheduledAt,
    } = req.body;

    const idempotencyKey = req.idempotencyKey || null;

    // 1. Fetch user preferences (cached in Redis)
    const preferences = await getUserPreferences(userId);

    // Filter requested channels according to user's opted-in preferences
    const activeChannels = channels.filter((channel) => {
      if (channel === "EMAIL") return preferences?.email_enabled;
      if (channel === "SMS") return preferences?.sms_enabled;
      if (channel === "PUSH") return preferences?.push_enabled;
      if (channel === "IN_APP") return preferences?.in_app_enabled;
      return false;
    });

    if (activeChannels.length === 0) {
      logger.warn(`Notification skipped for user ${userId}: Opted out of all requested channels`, {
        userId,
        requestedChannels: channels,
      });
      return res.status(200).json({
        message:
          "Notification skipped: User opted out of all requested channels.",
      });
    }


    // 2. Insert into PostgreSQL within a single atomic transaction
    const client = await db.connect();

    let notificationId;
    const deliveries = [];

    try {
      await client.query("BEGIN");

      const notifyQuery = `
        INSERT INTO notifications (user_id, type, title, body, data, priority, idempotency_key, scheduled_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'QUEUED')
        RETURNING id, created_at;
      `;
      const notifyResult = await client.query(notifyQuery, [
        userId,
        type,
        title,
        body,
        JSON.stringify(data),
        priority,
        idempotencyKey,
        scheduledAt || null,
      ]);
      notificationId = notifyResult.rows[0].id;

      // Insert delivery records for each active channel
      for (const channel of activeChannels) {
        const deliveryQuery = `
          INSERT INTO notification_deliveries (notification_id, channel, status)
          VALUES ($1, $2, 'PENDING')
          RETURNING id, channel;
        `;

        const deliveryResult = await client.query(deliveryQuery, [
          notificationId,
          channel,
        ]);
        deliveries.push(deliveryResult.rows[0]);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // 3. Dispatch jobs to BullMQ queues
    for (const delivery of deliveries) {
      await dispatchToQueue({
        channel: delivery.channel,
        deliveryId: delivery.id,
        notificationId,
        userId,
        payload: {
          to: req.body.recipient || "user@example.com",
          subject: title,
          body,
          title,
          data,
        },
        scheduledAt,
      });

      notificationsReceivedCounter.inc({ channel: delivery.channel });
    }

    logger.info(`Notification accepted and queued`, {
      notificationId,
      userId,
      channels: activeChannels,
      priority,
    });

    return res.status(202).json({
      message: "Notification accepted and queued for delivery.",
      notificationId,
      queuedChannels: activeChannels,
      status: "QUEUED",
    });
  } catch (error) {
    next(error);
  }
};

