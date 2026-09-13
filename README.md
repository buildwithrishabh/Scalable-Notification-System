# Scalable Notification System

A high-performance, production-ready distributed notification engine built with **Node.js (ES Modules)**, **Express**, **PostgreSQL**, **Redis**, **BullMQ**, and **WebSockets**.

---

## 🚀 Overview

The **Scalable Notification System** processes and delivers multi-channel notifications (Email, SMS, Push, In-App WebSockets) at high throughput with low latency, strict idempotency guarantees, sliding-window rate limiting, and fault tolerance with Dead Letter Queues (DLQ).

---

## 🛠 Tech Stack

* **Runtime:** Node.js (v20+) with pure ES Modules (`import/export`)
* **Framework:** Express.js
* **Primary Database:** PostgreSQL (Connection Pooling via `pg`)
* **Cache & Message Broker:** Redis (via `ioredis` & `BullMQ`)
* **Security:** JSON Web Tokens (Access Token + httpOnly Refresh Token Cookies) & Bcrypt
* **Real-time Delivery:** Socket.IO + Redis Pub/Sub
* **Observability:** Winston Structured Logger & Prometheus Metrics (`prom-client`)

---

## 📦 Key Architecture & Features

### 1. Database Schema (`src/scripts/migrate.js`)
* **`users`**: User identity and credentials.
* **`notification_preferences`**: Granular opt-in/opt-out preferences per user across channels (`email`, `sms`, `push`, `in_app`).
* **`notifications`**: Parent notification audit log with priority, idempotency keys, and scheduled timestamps.
* **`notification_deliveries`**: Delivery tracking per individual channel (status, retry attempts, provider IDs, error logs).
* **`dead_letter_notifications`**: DLQ audit trail for persistent job failures requiring manual/automatic recovery.
* **`user_devices`**: Device registration tokens for FCM Push notifications.

### 2. Authentication Module (`/api/auth`)
* Short-lived **Access Tokens** (15m, Bearer header) + Secure **Refresh Tokens** (7d, `httpOnly` cookie).
* Atomic registration with default channel preference initialization.

### 3. Distributed Idempotency & Rate Limiting
* **Distributed Lock Pattern** using Redis atomic `SET NX EX` on `Idempotency-Key` headers.
* **Sliding-Window Rate Limiting** using Redis Sorted Sets (`ZSET`).

### 4. BullMQ Multi-Channel Queues & Workers
* 4 Channel Queues: `email-queue`, `sms-queue`, `push-queue`, `inapp-queue`.
* Providers: Brevo (Email), Twilio (SMS), Firebase Cloud Messaging (Push).
* Automatic exponential backoff retries and Dead Letter Queue (DLQ) capture.

### 5. Real-Time WebSockets
* Private user rooms (`room:user:<userId>`) with JWT handshake authentication and Redis Pub/Sub broadcasting.

---

## 📂 Project Structure

```text
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection pool
│   │   ├── firebase.js          # Firebase Admin SDK
│   │   └── redis.js             # Redis client and Pub/Sub instances
│   ├── middlewares/
│   │   ├── auth.middleware.js          # JWT verification guard
│   │   ├── idempotency.middleware.js   # Redis-based distributed idempotency
│   │   ├── rateLimiter.middleware.js   # Sliding-window rate limiting (ZSET)
│   │   └── validation.middleware.js    # Joi request validation
│   ├── modules/
│   │   ├── auth/                # Auth controller, routes, service
│   │   ├── devices/             # FCM device token registration
│   │   ├── notification/        # Ingestion API, queries & DLQ retries
│   │   └── preferences/         # User channel opt-in/opt-out preferences
│   ├── observability/
│   │   ├── logger.js            # Winston structured logger
│   │   └── metrics.js           # Prometheus custom metrics
│   ├── providers/               # Email (Brevo), SMS (Twilio), Push (FCM)
│   ├── queues/                  # BullMQ producers and registry
│   ├── scripts/
│   │   └── migrate.js           # PostgreSQL schema migration runner
│   ├── websockets/
│   │   └── socket.server.js     # Socket.IO & Redis Pub/Sub adapter
│   ├── workers/                 # Email, SMS, Push, In-App queue workers
│   ├── app.js                   # Express application setup
│   ├── server.js                # HTTP & WebSocket API entrypoint
│   └── worker.runner.js         # Worker entrypoint
├── package.json
└── package-lock.json
```

---

## ⚙️ Getting Started

### 1. Installation
```bash
cd backend
npm install
```

### 2. Run Migrations
```bash
npm run migrate
```

### 3. Start Application
```bash
# Start API Gateway & WebSockets
npm run dev

# Start Background Queue Workers (in a separate terminal)
npm run dev:worker
```
