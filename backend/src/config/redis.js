import Redis from "redis";
import dotenv from "dotenv";
dotenv.config();

export const redisconfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
};

export const redis = new Redis(redisconfig);

// Dedicated Redis client for pub/sub
export const redisPublisher = new Redis(redisconfig);
export const redisSubscriber = new Redis(redisconfig);

redis.on("connect", () => console.log("[Redis] connected successfully"));
redis.on("error", () => console.error("[Redis Error]:", error));
