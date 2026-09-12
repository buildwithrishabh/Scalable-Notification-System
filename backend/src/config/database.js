import pg from "pg";
import dotenv from "dotenv";
import { logger } from "../observability/logger.js";
dotenv.config();

const { Pool } = pg;

export const db = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgrespassword",
  database: process.env.DB_NAME || "notification_db",
  max: 20, // Connection pool limit
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on("error", (err) => {
  logger.error("[Postgres Pool Error]:", { err });
});
