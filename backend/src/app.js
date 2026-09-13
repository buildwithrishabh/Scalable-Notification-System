import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { metricsRegistry } from "./observability/metrics.js";
import { logger } from "./observability/logger.js";
import authRoutes from "./modules/auth/auth.routes.js";
import notificationRoutes from "./modules/notification/notification.routes.js";
import preferencesRoutes from "./modules/preferences/preferences.routes.js";
import devicesRoutes from "./modules/devices/devices.routes.js";

export const createApp = () => {
  const app = express();

  // Security & standard middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || true,
      credentials: true, // Allow cookies over CORS
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 1. Prometheus Metrics Scrape Endpoint
  app.get("/metrics", async (req, res) => {
    try {
      res.set("Content-Type", metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    } catch (error) {
      res.status(500).end(error.message);
    }
  });

  // 2. Health Check Endpoint
  app.get("/health", (req, res) => {
    res.status(200).json({ status: "UP", timestamp: new Date().toISOString() });
  });

  // 3. Module Routers
  app.use("/api/auth", authRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/preferences", preferencesRoutes);
  app.use("/api/devices", devicesRoutes);

  // 4. 404 Route Handler
  app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
  });

  // 5. Centralized Error Handler
  app.use((err, req, res, next) => {
    logger.error("[Unhandled Error]:", {
      message: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });

    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
      error: err.message || "Internal Server Error",
    });
  });

  return app;
};
