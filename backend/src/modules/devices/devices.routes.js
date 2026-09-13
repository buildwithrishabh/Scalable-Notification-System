import { Router } from "express";
import { registerDeviceToken } from "./devices.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { registerDeviceSchema } from "../../validators/index.js";

const router = Router();

// register or update fcm device token 
router.post("/" , authenticate , validate(registerDeviceSchema) , registerDeviceToken);

export default router;