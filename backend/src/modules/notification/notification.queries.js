import { db } from "../../config/database.js";
import { dispatchToQueue } from "../../queues/notification.producers.js";
import { logger } from "../../observability/logger.js";


// GET /api/notifications - list user's notifications
export const listUserNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const query = `
        SELECT n.id, n.type, n.title, n.body, n.data, n.created_at,
               d.channel, d.status AS delivery_status, d.read_at 
        FROM notifications n 
        JOIN notification_deliveries d ON n.id = d.notification_id 
        WHERE n.user_id = $1
        ORDER BY n.created_at DESC 
        LIMIT $2 OFFSET $3;`;

    const result = await db.query(query, [userId, limit, offset]);
    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
};

// GET /api/notifications/unread-count
export const getUnreadCounts = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const query = `
        SELECT COUNT(*) AS unread_count 
        FROM notification_deliveries d 
        JOIN notifications n ON d.notification_id = n.id
        WHERE n.user_id = $1 AND d.channel = 'IN_APP' AND d.read_at IS NULL;`;

    const result = await db.query(query, [userId]);
    res.json({ unreadCount: parseInt(result.rows[0].unread_count, 10) });
  } catch (error) {
    next(error);
  }
};

export const getUnreadCount = getUnreadCounts;

// PUT /api/notifications/:id/read
export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await db.query(
      `UPDATE notification_deliveries nd
       SET read_at = NOW()
       FROM notifications n
       WHERE (nd.id = $1 OR nd.notification_id = $1)
         AND nd.notification_id = n.id
         AND n.user_id = $2
         AND nd.channel = 'IN_APP'
       RETURNING nd.id, nd.notification_id, nd.read_at`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Notification delivery not found or not owned by user",
      });
    }

    res.json({ success: true, message: "Notification marked as read", data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// GET /api/notifications/dead-letters (view user's own failed dlq items)
export const getDeadLetter = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const query = `
      SELECT dln.id, dln.delivery_id, dln.channel, dln.payload, dln.failure_reason, dln.created_at, dln.resolved
      FROM dead_letter_notifications dln
      JOIN notification_deliveries nd ON dln.delivery_id = nd.id
      JOIN notifications n ON nd.notification_id = n.id
      WHERE n.user_id = $1 AND dln.resolved = false
      ORDER BY dln.created_at DESC
      LIMIT 50;
    `;
    const result = await db.query(query, [userId]);
    res.json({ deadLetters: result.rows });
  } catch (error) {
    next(error);
  }
};

// POST /api/notifications/retry/:id (Retry User's Own DLQ Job)
export const retryDeadLetter = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const query = `
      SELECT dln.*, nd.notification_id
      FROM dead_letter_notifications dln
      JOIN notification_deliveries nd ON dln.delivery_id = nd.id
      JOIN notifications n ON nd.notification_id = n.id
      WHERE dln.id = $1 AND n.user_id = $2;
    `;
    const result = await db.query(query, [id, userId]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Failed notification record not found" });
    }

    const dlqItem = result.rows[0];

    // Re-dispatch into BullMQ
    await dispatchToQueue({
      channel: dlqItem.channel,
      deliveryId: dlqItem.delivery_id,
      notificationId: dlqItem.notification_id,
      userId,
      payload: dlqItem.payload,
    });

    // Mark DLQ entry as resolved
    await db.query(
      `UPDATE dead_letter_notifications SET resolved = true WHERE id = $1`,
      [id],
    );

    // Reset delivery status to PENDING
    await db.query(
      `UPDATE notification_deliveries SET status = 'PENDING', last_error = NULL WHERE id = $1`,
      [dlqItem.delivery_id],
    );

    logger.info(`[DLQ] User ${userId} retried failed job ${id}`, {
      dlqId: id,
      channel: dlqItem.channel,
    });

    res.json({ success: true, message: "Notification re-queued successfully." });
  } catch (err) {
    next(err);
  }
};