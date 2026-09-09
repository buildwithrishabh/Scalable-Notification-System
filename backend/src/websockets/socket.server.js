import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { redisSubscriber } from "../config/redis.js";

export const initializeWebSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  // 1. Authenticate WebSocket connections via JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication error: Missing token"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  // 2. Handle Client Connections
  io.on("connection", (socket) => {
    const userId = socket.user.id;
    console.log(`[WebSocket] User connected: ${userId} (Socket ID: ${socket.id})`);

    // Join a private room for this user
    socket.join(`room:user:${userId}`);

    socket.on("disconnect", () => {
      console.log(`[WebSocket] User disconnected: ${userId}`);
    });
  });

  // 3. Redis Pub/Sub: Placed OUTSIDE io.on("connection") to avoid duplicate listeners & memory leaks
  redisSubscriber.psubscribe("user:notifications:*", (err) => {
    if (err) {
      console.error("[Redis PubSub] Subscription error:", err);
    } else {
      console.log("[Redis PubSub] Subscribed to user:notifications:*");
    }
  });

  redisSubscriber.on("pmessage", (pattern, channel, message) => {
    try {
      const userId = channel.split(":")[2];
      const data = JSON.parse(message);

      // Broadcast only to that specific user's room
      io.to(`room:user:${userId}`).emit("new_notification", data);
      console.log(`[WebSocket] Emitted "new_notification" to room:user:${userId}`);
    } catch (err) {
      console.error("[WebSocket] Failed to process Redis message:", err.message);
    }
  });

  return io;
};