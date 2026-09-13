import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  getProfileHandler,
} from "./auth.controller.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { registerUserSchema, loginUserSchema } from "../../validators/index.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { slidingWindowRateLimiter } from "../../middlewares/rateLimiter.middleware.js";

const router = Router();

// Rate limiter for auth endpoints: 20 requests per minute per IP
const authRateLimiter = slidingWindowRateLimiter({
  windowSeconds: 60,
  maxRequests: 10,
});

// POST /api/auth/register
router.post(
  "/register",
  authRateLimiter,
  validate(registerUserSchema),
  registerHandler,
);

// POST /api/auth/login
router.post(
  "/login",
  authRateLimiter,
  validate(loginUserSchema),
  loginHandler,
);

// POST /api/auth/refresh (Reads refreshToken from httpOnly cookie)
router.post("/refresh", refreshHandler);

// POST /api/auth/logout (Clears httpOnly cookie)
router.post("/logout", logoutHandler);

// GET /api/auth/me (Protected route)
router.get("/me", authenticate, getProfileHandler);

export default router;
