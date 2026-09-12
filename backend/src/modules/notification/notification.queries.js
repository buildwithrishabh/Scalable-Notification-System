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
export const getUnreadCount = async (req, res, next) => {
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
// Backward compatibility alias
export const getUnreadCounts = getUnreadCount;

// PUT /api/notifications/:id/read
export const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query(
      `UPDATE notification_deliveries 
       SET read_at = NOW()
       WHERE id = $1 AND channel = 'IN_APP'`,
      [id]
    );

    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/dead-notifications (view dlq)
export const getDeadLetters = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM dead_letter_notifications WHERE resolved = false ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ deadLetters: result.rows });
  } catch (error) {
    next(error);
  }
};
// Backward compatibility alias
export const getDeadLetter = getDeadLetters;

// POST /api/admin/retry/:id (Retry DLQ Job)
export const retryDeadLetter = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT * FROM dead_letter_notifications WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "DLQ record not found" });

    const dlqItem = result.rows[0];

    // Re-dispatch into BullMQ
    await dispatchToQueue({
      channel: dlqItem.channel,
      deliveryId: dlqItem.delivery_id,
      payload: dlqItem.payload,
    });

    await db.query(
      `UPDATE dead_letter_notifications SET resolved = true WHERE id = $1`,
      [id]
    );
    logger.info(`[DLQ] Dead letter job retried successfully`, { dlqId: id, channel: dlqItem.channel });
    res.json({ message: "Job re-queued successfully from DLQ." });
  } catch (err) {

    next(err);
  }
};