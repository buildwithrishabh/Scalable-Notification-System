import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";

// 1. Production format: Structured JSON with timestamps & error stacks
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
  winston.format.errors({ stack: true }), // Stack trace retain karta hai
  winston.format.splat(),
  winston.format.json()
);

// 2. Development format: Colorized, human-readable terminal output
const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
    return `[${timestamp}] ${level}: ${message} ${metaStr} ${stack ? `\n${stack}` : ""}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  defaultMeta: {
    service: "notification-service",
    environment: process.env.NODE_ENV || "development",
  },
  format: isProduction ? productionFormat : developmentFormat,
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
  exitOnError: false, // unhandled exceptions par immediately hard-crash hone se pehle log hone deta hai
});

export default logger;
