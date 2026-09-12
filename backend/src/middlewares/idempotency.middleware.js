import { redis } from "../config/redis.js";
import { logger } from "../observability/logger.js";

export const idempotencyMiddleware = async (req, res, next) => {
  const idempotencykey = req.headers["idempotency-key"];
  if (!idempotencykey) {
    return next();
  }

  const rediskey = `idempotency:${idempotencykey}`;

  try {
    const acquired = await redis.set(
      rediskey,
      JSON.stringify({ status: "PROCESSING" }),
      "EX",
      120,
      "NX",
    );

    if (!acquired) {
      const existing = await redis.get(rediskey);
      logger.warn("Duplicate request detected via idempotency key", { idempotencykey });
      return res.status(409).json({
        error: "Duplicate request detected",
        details: existing ? JSON.parse(existing) : "In-flight operation",
      });
    }

    // Attach hook to save final response upon finish
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        redis.set(
          rediskey,
          JSON.stringify({ status: "COMPLETED", body }),
          "EX",
          3600,
        ); // cache 1 hour
      } else {
        redis.del(rediskey); // release lock if required errored
      }
      return originalJson(body);
    };

    req.idempotencyKey = idempotencykey;
    next();
  } catch (error) {
    logger.error("[Idempotency middleware error]:", { error, idempotencykey });
    next(); // Fail open in case of Redis glitch
  }
};
