import pg from "pg";
import dotenv from "dotenv";
import { logger } from "../observability/logger.js";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgrespassword",
  database: process.env.DB_NAME || "notification_db",
});

const migrationQuery = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    
    -- 1. users table
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      phone varchar(20),
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- 2. user notification preferences table
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
      email_enabled BOOLEAN DEFAULT true,
      push_enabled BOOLEAN DEFAULT true,
      sms_enabled BOOLEAN DEFAULT false,
      in_app_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 3. Notification parent table 
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      data JSONB DEFAULT '{}'::jsonb,
      priority VARCHAR(20) DEFAULT 'NORMAL',
      status VARCHAR(20) DEFAULT 'PENDING',
      idempotency_key VARCHAR(120),
      scheduled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency ON notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;

    -- 4. Notification deliveries table (channel specific state)
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING',
      attempts INT DEFAULT 0,
      provider_message_id VARCHAR(255),
      last_error TEXT,
      sent_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_deliveries_notification_id ON notification_deliveries(notification_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_status ON notification_deliveries(status);

    -- 5. Dead Letter Queue (failed jobs audit log)
    CREATE TABLE IF NOT EXISTS dead_letter_notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      delivery_id UUID REFERENCES notification_deliveries(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL,
      payload JSONB NOT NULL,
      failure_reason TEXT NOT NULL,
      resolved BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 6. user_devices table (for FCM Push Notifications)
    CREATE TABLE IF NOT EXISTS user_devices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      device_token TEXT NOT NULL UNIQUE,
      device_type VARCHAR(20) DEFAULT 'WEB',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_devices_active ON user_devices(user_id, is_active);
`;

async function runMigration() {
  try {
    logger.info("[Migration] Starting PostgreSQL schema migration...");
    await pool.query(migrationQuery);
    logger.info("[Migration] All tables and indexes created successfully!");
    process.exit(0);
  } catch (error) {
    logger.error("[Migration] failed:", { error: error.message || error });
    process.exit(1);
  }
}

runMigration();