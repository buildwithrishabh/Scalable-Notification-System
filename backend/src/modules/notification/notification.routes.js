import { Router } from "express";
import { createNotificationHandler } from "./notification.controller.js";
import {
  listUserNotifications,
  getUnreadCount,
  markAsRead,
  getDeadLetter,
  retryDeadLetter,
} from "./notification.queries.js";
import { slidingWindowRateLimiter } from "../../middlewares/rateLimiter.middleware.js";
import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { createNotificationSchema } from "../../validators/index.js";

const router = Router();

// Send / Enqueue notification (returns 202 Accepted)
router.post(
  "/",
  slidingWindowRateLimiter({ windowSeconds: 60, maxRequests: 100 }),
  idempotencyMiddleware,
  validate(createNotificationSchema),
  createNotificationHandler,
);

// Get user notifications
router.get("/", authenticate, listUserNotifications);

// Get unread count
router.get("/unread-count", authenticate, getUnreadCount);

// Mark notification as read
router.put("/:id/read", authenticate, markAsRead);

// View user's failed notifications (DLQ)
router.get("/dead-letters", authenticate, getDeadLetter);

// Retry failed notification
router.post("/retry/:id", authenticate, retryDeadLetter);

export default router;
