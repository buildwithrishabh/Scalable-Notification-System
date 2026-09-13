import { Router } from "express";
import { createNotificationHandler } from "./notification.controller.js";
import {
  listUserNotifications,
  getUnreadCount,
  markAsRead,
} from "./notification.queries.js";
import { slidingWindowRateLimiter } from "../../middlewares/rateLimiter.middleware.js";
import { idempotencyMiddleware } from "../../middlewares/idempotency.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { createNotificationSchema } from "../../validators/index.js";

const router = Router();

// POST /api/notifications - Ingest notification (Async Decoupled, returns 202)
router.post(
  "/",
  slidingWindowRateLimiter({ windowSeconds: 60, maxRequests: 100 }),
  idempotencyMiddleware,
  validate(createNotificationSchema),
  createNotificationHandler,
);

// GET /api/notifications - List authenticated user's notifications
router.get("/", authenticate, listUserNotifications);

// GET /api/notifications/unread-count - Get total unread in-app notifications
router.get("/unread-count", authenticate, getUnreadCount);

// PUT /api/notifications/:id/read - Mark an in-app notification delivery as read
router.put("/:id/read", authenticate, markAsRead);

export default router;
