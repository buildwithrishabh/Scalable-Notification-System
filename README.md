# Scalable Notification System

A high-performance, production-ready distributed notification engine built with **Node.js (ES Modules)**, **PostgreSQL**, and **Redis**.

> **Project Status:** In Active Development  
> **Current Phase:** Core Infrastructure, Database Schema & Distributed Middlewares

---

## 🚀 Overview

The **Scalable Notification System** is designed to process and deliver multi-channel notifications (Email, SMS, Push, In-App WebSockets) at high throughput with low latency, strict idempotency guarantees, sliding-window rate limiting, and fault tolerance.

---

## 🛠 Tech Stack (Current Implementation)

* **Runtime:** Node.js (v20+) with pure ES Modules (`import/export`)
* **Framework:** Express.js
* **Primary Database:** PostgreSQL (Connection Pooling via `pg`)
* **Cache & Distributed State:** Redis (via `ioredis`)
* **Security:** JSON Web Tokens (`jsonwebtoken`) & Role-Based Access Control (RBAC)

---

## 📦 What Has Been Implemented So Far

### 1. Database Schema & Migration (`src/scripts/migrate.js`)
Automated PostgreSQL migration script creating the core normalized schema and optimized indices:
* **`users`**: User identity, roles (`USER`, `ADMIN`), and timestamps.
* **`notification_preferences`**: Granular opt-in/opt-out preferences per user across channels (`email`, `sms`, `push`, `in_app`).
* **`templates`**: Dynamic message templates categorized by type and channel.
* **`notifications`**: Parent notification log with priority, idempotency keys, and scheduled timestamps.
* **`notification_deliveries`**: Delivery tracking per individual channel (status, retry attempts, provider IDs, error logs).
* **`dead_letter_notifications`**: DLQ audit trail for persistent job failures requiring manual/automatic recovery.

### 2. Infrastructure Connection Pools (`src/config/`)
* **PostgreSQL Pool (`database.js`)**: Robust connection pool with configurable limits (`max: 20`), idle timeouts, and connection timeout handling.
* **Redis Clients (`redis.js`)**: Standard caching client alongside isolated `redisPublisher` and `redisSubscriber` instances configured for BullMQ and WebSocket Pub/Sub.

### 3. Authentication & Authorization (`src/middlewares/auth.middleware.js`)
* **`authenticate`**: Verifies Bearer JWT tokens in authorization headers and extracts user payloads (`id`, `email`, `role`).
* **`requireRole(role)`**: Enforces strict Role-Based Access Control (RBAC) for privileged actions.

### 4. Distributed Idempotency (`src/middlewares/idempotency.middleware.js`)
* Implements the **Distributed Lock Pattern** using Redis atomic `SET key NX EX 120` on the `Idempotency-Key` header.
* Prevents duplicate execution from client retries or network replays.
* Hooks into `res.json()` to cache successful `2xx` responses for 1 hour while automatically releasing locks on server errors.
* Employs a fail-open strategy during cache outages to protect critical ingestion paths.

### 5. Sliding Window Rate Limiter (`src/middlewares/rateLimiter.middleware.js`)
* Uses Redis **Sorted Sets (`ZSET`)** for high-precision sliding-window rate limiting.
* Enforces rolling window restrictions per user or client IP.
* Returns standard HTTP headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`) and `429 Too Many Requests` responses.

---

## 📂 Project Structure (Current)

```text
backend/
├── src/
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection pool
│   │   └── redis.js             # Redis client and Pub/Sub instances
│   ├── middlewares/
│   │   ├── auth.middleware.js          # JWT verification & RBAC guard
│   │   ├── idempotency.middleware.js   # Redis-based distributed idempotency
│   │   └── rateLimiter.middleware.js   # Sliding-window rate limiting (ZSET)
│   └── scripts/
│       └── migrate.js           # PostgreSQL schema migration runner
├── .env.example
├── package.json
└── package-lock.json
```

---

## ⚙️ Getting Started

### 1. Prerequisites
* Node.js (>= 18.x)
* PostgreSQL running locally or in Docker
* Redis running locally or in Docker

### 2. Installation
```bash
cd backend
npm install
```

### 3. Environment Variables
Create a `.env` file in the `backend/` directory:
```env
PORT=4000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgrespassword
DB_NAME=notification_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=super_secret_jwt_key_production_grade
JWT_EXPIRES_IN=7d
```

### 4. Run Database Migrations
```bash
npm run migrate
```

---

## 🗺 Roadmap / Upcoming Steps

- [ ] **User Preferences & Template Engine** (Cache-Aside pattern in Redis)
- [ ] **BullMQ Message Queues & Scheduling** (Priority queues per channel)
- [ ] **Multi-Channel Provider Adapters** (Email, SMS, Push, In-App)
- [ ] **Scalable Worker Services & DLQ Processing**
- [ ] **Real-Time Delivery via WebSockets & Redis Pub/Sub**
- [ ] **High-Throughput Ingestion API (`POST /api/notifications` returning 202)**
- [ ] **Prometheus Metrics & Observability**
