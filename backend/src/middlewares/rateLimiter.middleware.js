import { redis } from "../config/redis.js";
import { logger } from "../observability/logger.js";

export const slidingWindowRateLimiter = ({ windowSeconds = 60 , maxRequests = 100}) => {
    return async ( req , res , next) => {
        const identifier = req.user?.id || req.ip;
        const key = `ratelimit:${identifier}`;
        const now = Date.now();
        const windowStart = now - windowSeconds * 1000;

        try {
            const multi = redis.multi();

            // Remove timestamp older than window 
            multi.zremrangebyscore(key , 0 , windowStart);

            // add current request timestamp
            multi.zadd(key, now, `${now}-${Math.random()}`);

            // count element in window
            multi.zcard(key);

            // set key ttl
            multi.expire(key, windowSeconds);

            const result = await multi.exec();
            const requestCount = result[2][1];

            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requestCount));

            if (requestCount > maxRequests) {
                logger.warn("Rate limit exceeded", { identifier, requestCount, maxRequests });
                return res.status(429).json({
                    error: "Too Many Requests",
                    message: `Rate limit exceeded: Max ${maxRequests} requests per ${windowSeconds} seconds.`
                });
            }
            
            next();

        } catch (error) {
            logger.error("Rate Limiter Error:", { error, identifier });
            return next();
        }
    }
}