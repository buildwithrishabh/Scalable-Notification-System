import Redis from "ioredis";
import dotenv from "dotenv";
import { logger } from "../observability/logger.js";
dotenv.config();

export const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
};

export const redis = new Redis(redisConfig);

// Dedicated Redis client for pub/sub
export const redisPublisher = new Redis(redisConfig);
export const redisSubscriber = new Redis(redisConfig);

redis.on("connect", () => logger.info("[Redis] connected successfully"));
redis.on("error", (err) => logger.error("[Redis Error]:", { err }));
redisPublisher.on("error", (err) => logger.error("[Redis Publisher Error]:", { err }));
redisSubscriber.on("error", (err) => logger.error("[Redis Subscriber Error]:", { err }));
