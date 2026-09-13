import dotenv from "dotenv";
import { startEmailWorker } from "./workers/email.worker.js";
import { startPushWorker } from "./workers/push.worker.js";
import { startInAppWorker } from "./workers/inapp.worker.js";
import { startSmsWorker } from "./workers/sms.worker.js";
import { logger } from "./observability/logger.js";

dotenv.config();

logger.info("=========================================");
logger.info("⚙️  Starting BullMQ Background Workers...");
logger.info("=========================================");


const emailWorker = startEmailWorker();
const pushWorker = startPushWorker();
const inAppWorker = startInAppWorker();
const smsWorker = startSmsWorker();

logger.info("✅ All workers initialized and listening for jobs:");
logger.info("   - Email Worker (Queue: email-queue, Concurrency: 10)");
logger.info("   - Push Worker  (Queue: push-queue,  Concurrency: 15)");
logger.info("   - In-App Worker(Queue: inapp-queue, Concurrency: 25)");
logger.info("   - SMS Worker   (Queue: sms-queue,   Concurrency: 10)");
logger.info("=========================================");


// Gracefull shutdown for bullmq worker
const shutdown = async (signal) => {
    logger.info(`[Worker] Received ${signal}. Closing all BullMq workers....`);

    try {
        await Promise.all([
            emailWorker.close(),
            pushWorker.close(),
            inAppWorker.close(),
            smsWorker.close(),
        ]);

        logger.info(`[Worker] All workers shut down gracefully.`);
        process.exit(0);
    } catch (error){
        logger.error(`[Worker] Error shutting down: ${error.message}`);
        process.exit(1);
    }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));