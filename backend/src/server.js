import http from "http";
import dotenv from "dotenv";
import { createApp } from "./app.js";
import { initializeWebSocket } from "./websockets/socket.server.js";
import { logger } from "./observability/logger.js";

dotenv.config();

const app = createApp();
const server = http.createServer(app);

// Initialize Websockets with redis pub / sub
initializeWebSocket(server);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  logger.info("=========================================");
  logger.info(`🚀 Notification Service running on port ${PORT}`);
  logger.info(
    `📊 Prometheus Metrics available at http://localhost:${PORT}/metrics`,
  );
  logger.info(`🔌 WebSockets listening at ws://localhost:${PORT}`);
  logger.info("=========================================");
});

// Graceful Shutdown
const handleShutdown = async (signal) => {
  logger.info(
    `[Server] Received ${signal}. Gracefully shutting down HTTP server...`,
  );
  server.close(() => {
    logger.info("[Server] HTTP and WebSocket server closed successfully.");
    process.exit(0);
  });
  // Force close after 10 seconds if hanging
  setTimeout(() => {
    logger.error("[Server] Forceful shutdown initiated due to timeout.");
    process.exit(1);
  }, 10000);
};
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("SIGINT", () => handleShutdown("SIGINT"));
