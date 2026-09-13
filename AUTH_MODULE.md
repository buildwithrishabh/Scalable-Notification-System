# Authentication Module Documentation

A complete, production-grade guide and specification for the **Authentication (Access Token + httpOnly Refresh Token)** module in the **Scalable Notification System**.

---

## Table of Contents

1. [Overview & Architecture](#1-overview--architecture)
2. [Token Strategy (Access Token + httpOnly Refresh Token)](#2-token-strategy)
3. [Database Schema (`users`)](#3-database-schema-users)
4. [Module Directory Structure](#4-module-directory-structure)
5. [Authentication & Token Flows](#5-authentication--token-flows)
   - [Registration Flow](#registration-flow)
   - [Login Flow](#login-flow)
   - [Silent Token Refresh Flow](#silent-token-refresh-flow)
   - [Logout Flow](#logout-flow)
   - [WebSocket JWT Authentication Flow](#websocket-jwt-authentication-flow)
6. [Complete Source Code Implementation](#6-complete-source-code-implementation)
   - [1. Auth Service (`src/modules/auth/auth.service.js`)](#1-auth-service-srcmodulesauthauthservicejs)
   - [2. Auth Controller (`src/modules/auth/auth.controller.js`)](#2-auth-controller-srcmodulesauthauthcontrollerjs)
   - [3. Auth Routes (`src/modules/auth/auth.routes.js`)](#3-auth-routes-srcmodulesauthauthroutesjs)
   - [4. Auth Middleware (`src/middlewares/auth.middleware.js`)](#4-auth-middleware-srcmiddlewaresauthmiddlewarejs)
   - [5. Express App Integration (`src/app.js`)](#5-express-app-integration-srcappjs)
7. [API Reference & cURL Testing](#7-api-reference--curl-testing)
8. [Security & Production Hardening](#8-security--production-hardening)

---

## 1. Overview & Architecture

In the **Scalable Notification System**, authentication provides secure user identity and multi-tenant data isolation:

1. **Data Isolation**: Ensures each user can only access their own notifications, delivery statuses, unread counts, device tokens, and preference configurations.
2. **Short-Lived Access Tokens**: Protects API communication against token theft with 15-minute validity.
3. **httpOnly Cookie Refresh Tokens**: Long-lived (7-day) tokens stored in `httpOnly`, `secure`, `sameSite` cookies immune to JavaScript XSS access.
4. **WebSocket Real-time Handshake**: Authenticates socket connections via short-lived Access Token before subscribing to private notification rooms (`room:user:<userId>`).

```
                    +------------------------------------+
                    |         Client / Browser           |
                    +-----------------+------------------+
                                      |
                      POST /api/auth/register or /login
                                      |
                                      v
                    +------------------------------------+
                    |       Auth Controller / Service    |
                    |   - Validate input (Joi)           |
                    |   - Hash / Compare password(bcrypt)|
                    |   - Issue Access Token (15m, JSON) |
                    |   - Issue Refresh Token (7d, Cookie|
                    +-----------------+------------------+
                                      |
                        +-------------+-------------+
                        |                           |
                        v                           v
              +-------------------+       +-------------------------------+
              |    PostgreSQL     |       |    Client Receives:           |
              |  `users` table    |       |   - JSON: `accessToken` (15m) |
              |  + preferences    |       |   - Cookie: `refreshToken`    |
              +-------------------+       |     (httpOnly, secure, 7d)    |
                                          +---------------+---------------+
                                                          |
                   +--------------------------------------+--------------------------------------+
                   |                                                                             |
      Header: `Authorization: Bearer <accessToken>`                            Handshake: `{ token: <accessToken> }`
                   |                                                                             |
                   v                                                                             v
     +---------------------------+                                                 +---------------------------+
     |   Express REST Endpoints  |                                                 |    Socket.IO WebSocket    |
     |   - `authenticate` guard  |                                                 |   - Handshake token check |
     |   - Attaches `req.user`   |                                                 |   - Join `room:user:<id>` |
     +---------------------------+                                                 +---------------------------+
                   |
        (If token expired: 401)
                   v
     +---------------------------+
     |   POST /api/auth/refresh  |
     |   (Cookie sent by browser)|
     |   -> New Access Token     |
     +---------------------------+
```

---

## 2. Token Strategy

| Token | Validity | Transport Mechanism | Target Use |
|---|---|---|---|
| **Access Token** | **15 minutes** | Response JSON body (`Authorization: Bearer <token>`) | REST API headers & WebSocket connection handshake |
| **Refresh Token** | **7 days** | `httpOnly`, `secure`, `sameSite` Cookie | Automatic silent token renewal via `POST /api/auth/refresh` |

### Cookie Configuration:
```javascript
{
  httpOnly: true,                                       // Inaccessible from JavaScript (XSS Protection)
  secure: process.env.NODE_ENV === "production",        // HTTPS only in production
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax", // CSRF Protection
  maxAge: 7 * 24 * 60 * 60 * 1000                       // 7 Days
}
```

---

## 3. Database Schema (`users`)

The `users` table in PostgreSQL (`src/scripts/migrate.js`):

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

---

## 4. Module Directory Structure

```text
backend/src/
├── modules/
│   └── auth/
│       ├── auth.controller.js      # Handles HTTP request/response & httpOnly cookies
│       ├── auth.routes.js          # Route endpoints, rate limiting, and Joi middleware
│       └── auth.service.js         # Core business logic, password hashing & JWT generation
├── middlewares/
│   ├── auth.middleware.js          # `authenticate` JWT verification guard
│   └── validation.middleware.js    # Joi schema validation wrapper
└── validators/
    └── index.js                    # Contains `registerUserSchema` & `loginUserSchema`
```

---

## 5. Authentication & Token Flows

### Registration Flow
1. Client sends `POST /api/auth/register` with `{ name, email, password }`.
2. Input is validated using Joi (`registerUserSchema`).
3. Checks if `email` exists in DB; throws `409 Conflict` if registered.
4. Hashes password using `bcrypt` (10 rounds).
5. In an atomic transaction, inserts user record and automatically inserts default notification preferences (`email_enabled=true`, `push_enabled=true`, `sms_enabled=false`, `in_app_enabled=true`).
6. Generates `accessToken` (15m) and `refreshToken` (7d).
7. Sets `refreshToken` in `httpOnly` cookie and returns `accessToken` + user details in JSON response.

### Login Flow
1. Client sends `POST /api/auth/login` with `{ email, password }`.
2. Looks up user by normalized lowercase email. Returns generic `401 Unauthorized` if not found.
3. Compares password hash via `bcrypt.compare`.
4. Issues `accessToken` and `refreshToken`.
5. Sets `refreshToken` in `httpOnly` cookie and returns `accessToken` in JSON response.

### Silent Token Refresh Flow
1. Client detects `401 Unauthorized` on an API call.
2. Client sends `POST /api/auth/refresh` (browser automatically attaches the `refreshToken` cookie).
3. Server verifies `refreshToken` and confirms user exists.
4. Server responds with a fresh `accessToken`.

### Logout Flow
1. Client calls `POST /api/auth/logout`.
2. Server clears the `refreshToken` cookie (`res.clearCookie('refreshToken')`).

---

## 6. Complete Source Code Implementation

### 1. Auth Service (`src/modules/auth/auth.service.js`)

```javascript
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../../config/database.js";
import { logger } from "../../observability/logger.js";

const SALT_ROUNDS = 10;

export const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET || "default_jwt_secret_key",
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "15m" }
  );
};

export const generateRefreshToken = (user) => {
  return jwt.sign(
    { id: user.id },
    process.env.REFRESH_TOKEN_SECRET || `${process.env.JWT_SECRET || "default_jwt_secret_key"}_refresh`,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d" }
  );
};

export const registerUser = async ({ name, email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await db.query(
    "SELECT id FROM users WHERE email = $1",
    [normalizedEmail]
  );

  if (existingUser.rows.length > 0) {
    const error = new Error("User with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const insertUserQuery = `
      INSERT INTO users (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, created_at;
    `;
    const userResult = await client.query(insertUserQuery, [
      name.trim(),
      normalizedEmail,
      passwordHash,
    ]);
    const newUser = userResult.rows[0];

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

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = email.toLowerCase().trim();

  const result = await db.query(
    "SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1",
    [normalizedEmail]
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
      created_at: user.created_at,
    },
    accessToken,
    refreshToken,
  };
};

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
      "SELECT id, name, email FROM users WHERE id = $1",
      [decoded.id]
    );

    if (result.rows.length === 0) {
      const error = new Error("User no longer exists");
      error.statusCode = 401;
      throw error;
    }

    const user = result.rows[0];
    const newAccessToken = generateAccessToken(user);

    return { accessToken: newAccessToken, user };
  } catch (err) {
    const error = new Error("Invalid or expired refresh token");
    error.statusCode = 401;
    throw error;
  }
};

export const getUserProfile = async (userId) => {
  const result = await db.query(
    "SELECT id, name, email, created_at, updated_at FROM users WHERE id = $1",
    [userId]
  );

  if (result.rows.length === 0) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return result.rows[0];
};
```

---

### 2. Auth Controller (`src/modules/auth/auth.controller.js`)

```javascript
import * as authService from "./auth.service.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const setRefreshTokenCookie = (res, token) => {
  res.cookie("refreshToken", token, COOKIE_OPTIONS);
};

export const registerHandler = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.registerUser({
      name,
      email,
      password,
    });

    setRefreshTokenCookie(res, refreshToken);

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: { user, accessToken },
    });
  } catch (error) {
    next(error);
  }
};

export const loginHandler = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.loginUser({
      email,
      password,
    });

    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      success: true,
      message: "User logged in successfully",
      data: { user, accessToken },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshHandler = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    const { accessToken, user } = await authService.refreshAccessToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: "Access token refreshed successfully",
      data: { accessToken, user },
    });
  } catch (error) {
    next(error);
  }
};

export const logoutHandler = async (req, res, next) => {
  try {
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getProfileHandler = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const user = await authService.getUserProfile(userId);

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};
```

---

### 3. Auth Routes (`src/modules/auth/auth.routes.js`)

```javascript
import { Router } from "express";
import {
  registerHandler,
  loginHandler,
  refreshHandler,
  logoutHandler,
  getProfileHandler,
} from "./auth.controller.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { registerUserSchema, loginUserSchema } from "../../validators/index.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { slidingWindowRateLimiter } from "../../middlewares/rateLimiter.middleware.js";

const router = Router();

// Rate limiter for auth endpoints: 20 requests per minute per IP
const authRateLimiter = slidingWindowRateLimiter({
  windowSeconds: 60,
  maxRequests: 20,
});

router.post("/register", authRateLimiter, validate(registerUserSchema), registerHandler);
router.post("/login", authRateLimiter, validate(loginUserSchema), loginHandler);
router.post("/refresh", refreshHandler);
router.post("/logout", logoutHandler);
router.get("/me", authenticate, getProfileHandler);

export default router;
```

---

### 4. Auth Middleware (`src/middlewares/auth.middleware.js`)

```javascript
import jwt from "jsonwebtoken";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Unauthorized: Missing or invalid token format",
    });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "default_jwt_secret_key"
    );
    req.user = decoded; // { id, email, iat, exp }
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or expired access token",
    });
  }
};
```

---

### 5. Express App Integration (`src/app.js`)

```javascript
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./modules/auth/auth.routes.js";
import notificationRoutes from "./modules/notification/notification.routes.js";
import preferencesRoutes from "./modules/preferences/preferences.routes.js";
import devicesRoutes from "./modules/devices/devices.routes.js";

export const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Routes
  app.use("/api/auth", authRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/preferences", preferencesRoutes);
  app.use("/api/devices", devicesRoutes);

  return app;
};
```

---

## 7. API Reference & cURL Testing

### 1. Register User
- **Endpoint**: `POST /api/auth/register`
- **Body**:
  ```json
  {
    "name": "Rishabh",
    "email": "rishabh@example.com",
    "password": "Password123!"
  }
  ```
- **cURL**:
  ```bash
  curl -i -X POST http://localhost:4000/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name":"Rishabh","email":"rishabh@example.com","password":"Password123!"}'
  ```
- **Response (`201 Created`)**:
  - `Set-Cookie: refreshToken=eyJ...; Path=/; HttpOnly; SameSite=Lax`
  ```json
  {
    "success": true,
    "message": "User registered successfully",
    "data": {
      "user": {
        "id": "c3e9812e-a50d-45db-9c3f-c637ef81e291",
        "name": "Rishabh",
        "email": "rishabh@example.com",
        "created_at": "2026-09-13T22:15:00.000Z"
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

---

### 2. Login User
- **Endpoint**: `POST /api/auth/login`
- **cURL**:
  ```bash
  curl -i -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"rishabh@example.com","password":"Password123!"}'
  ```

---

### 3. Refresh Access Token
- **Endpoint**: `POST /api/auth/refresh`
- **cURL**:
  ```bash
  curl -X POST http://localhost:4000/api/auth/refresh \
    --cookie "refreshToken=YOUR_REFRESH_TOKEN_COOKIE"
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "message": "Access token refreshed successfully",
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1Ni...",
      "user": {
        "id": "c3e9812e-a50d-45db-9c3f-c637ef81e291",
        "name": "Rishabh",
        "email": "rishabh@example.com"
      }
    }
  }
  ```

---

### 4. Logout User
- **Endpoint**: `POST /api/auth/logout`
- **cURL**:
  ```bash
  curl -i -X POST http://localhost:4000/api/auth/logout
  ```
- **Response (`200 OK`)**:
  - `Set-Cookie: refreshToken=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

---

## 8. Security & Production Hardening

| Feature | Implementation | Benefit |
|---|---|---|
| **Short-Lived Access Token** | 15 Minutes expiry | Reduces attack window if access token is intercepted |
| **httpOnly Cookie Refresh Token** | Inaccessible to JavaScript | Immune to XSS-based token theft |
| **Brute-Force Protection** | `slidingWindowRateLimiter(60s, 20req)` | Stops credential stuffing on `/login` and `/register` |
| **Atomic Database Transaction** | PostgreSQL `BEGIN...COMMIT` | Guarantees user and default notification preferences are created atomically |
| **Salted Password Hashing** | `bcrypt` (10 rounds) | Resists rainbow table and offline dictionary attacks |
| **WebSocket Guard** | Short-lived Access Token in handshake | Ensures only verified users subscribe to real-time notification streams |
