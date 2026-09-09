import { Queue } from 'bullmq';
import { redisConfig } from '../config/redis.js';
import { QUEUES } from './queue.constants.js';

export const emailQueue = new Queue(QUEUES.EMAIL , {
    connection:redisConfig
});

export const pushQueue = new Queue(QUEUES.PUSH , {
    connection:redisConfig
});

export const smsQueue = new Queue(QUEUES.SMS , {
    connection:redisConfig
});

export const inAppQueue = new Queue(QUEUES.IN_APP , {
    connection:redisConfig
});

export const queueMap = {
    EMAIL: emailQueue,
    PUSH: pushQueue,
    SMS: smsQueue,
    IN_APP: inAppQueue
};