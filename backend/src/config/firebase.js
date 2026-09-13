import admin from "firebase-admin";
import dotenv from "dotenv";
import { logger } from "../observability/logger.js";

dotenv.config();

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    logger.info("[Firebase] Admin SDK initialized successfully");
  } catch (error) {
    logger.error("[Firebase] Initialization error:", { error: error.message || error });
  }
}

export const fcm = admin.apps.length ? admin.messaging() : null;
