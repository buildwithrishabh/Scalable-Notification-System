import { Router } from "express";
import {
  getMyPreferences,
  updatePreferences,
} from "./preferences.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { updatePreferencesSchema } from "../../validators/index.js";

const router = Router();

// GET /api/preferences - Get current logged-in user's notification preferences
router.get("/", authenticate, getMyPreferences);

// PUT /api/preferences - Update current logged-in user's notification preferences
router.put("/", authenticate, validate(updatePreferencesSchema), updatePreferences);

export default router;
