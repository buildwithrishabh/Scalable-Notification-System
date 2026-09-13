import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../../config/database.js";
import { logger } from "../../observability/logger.js";

const SALT_ROUNDS = 10;

/**
 * Generate short-lived Access Token (15m)
 */
export const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
    },
  );
};

/**
 * Generate long-lived Refresh Token (7d)
 */
export const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
    },
  );
};

/**
 * Register a new user and seed default notification preferences
 */
export const registerUser = async ({ name, email, phone, password }) => {
  const normalizedEmail = email.toLowerCase().trim();
  const formattedPhone = phone ? phone.trim() : null;

  // Check if user already exists
  const existingUser = await db.query(
    `SELECT id FROM users WHERE email = $1`,
    [normalizedEmail],
  );

  if (existingUser.rows.length > 0) {
    const error = new Error("User with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Atomic transaction: insert user + insert default preferences
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const insertUserQuery = `
      INSERT INTO users (name, email, phone, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, phone, created_at;
    `;

    const userResult = await client.query(insertUserQuery, [
      name.trim(),
      normalizedEmail,
      formattedPhone,
      passwordHash,
    ]);

    const newUser = userResult.rows[0];

    // Seed default notification preferences for the user
    const insertPrefQuery = `
      INSERT INTO notification_preferences (user_id, email_enabled, push_enabled, sms_enabled, in_app_enabled)
      VALUES ($1, true, true, false, true)
      ON CONFLICT (user_id) DO NOTHING;
    `;
    await client.query(insertPrefQuery, [newUser.id]);

    await client.query("COMMIT");

    const accessToken = generateAccessToken(newUser);
    const refreshToken = generateRefreshToken(newUser);

    logger.info(`[Auth] User registered successfully: ${newUser.id} (${newUser.email})`);

    return {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        created_at: newUser.created_at,
      },
      accessToken,
      refreshToken,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Login user with email and password
 */
export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const result = await db.query(
    "SELECT id, name, email, phone, password_hash, created_at FROM users WHERE email = $1",
    [normalizedEmail],
  );

  if (result.rows.length === 0) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  delete user.password_hash;
  logger.info(`[Auth] User logged in: ${user.id} (${user.email})`);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
    },
    accessToken,
    refreshToken,
  };
};

/**
 * Verify Refresh Token and issue fresh Access Token
 */
export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) {
    const error = new Error("Refresh token missing");
    error.statusCode = 401;
    throw error;
  }

  try {
    const secret =
      process.env.REFRESH_TOKEN_SECRET ||
      `${process.env.JWT_SECRET || "default_jwt_secret_key"}_refresh`;

    const decoded = jwt.verify(refreshToken, secret);

    const result = await db.query(
      "SELECT id, name, email, phone FROM users WHERE id = $1",
      [decoded.id],
    );

    if (result.rows.length === 0) {
      const error = new Error("User no longer exists");
      error.statusCode = 401;
      throw error;
    }

    const user = result.rows[0];
    const newAccessToken = generateAccessToken(user);

    return {
      accessToken: newAccessToken,
      user,
    };
  } catch (err) {
    const error = new Error("Invalid or expired refresh token");
    error.statusCode = 401;
    throw error;
  }
};

/**
 * Get profile for authenticated user
 */
export const getUserProfile = async (userId) => {
  const result = await db.query(
    "SELECT id, name, email, phone, created_at, updated_at FROM users WHERE id = $1",
    [userId],
  );

  if (result.rows.length === 0) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
};
