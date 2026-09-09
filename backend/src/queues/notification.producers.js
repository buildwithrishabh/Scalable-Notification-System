import { queueMap } from "./queue.registry.js";

export const dispatchToQueue = async ({
  channel,
  deliveryId,
  notificationId,
  userId,
  payload,
  scheduledAt,
}) => {
  const queue = queueMap[channel.toUpperCase()];

  if (!queue) {
    throw new Error(`Queue not found of channel: ${channel}`);
  }

  const jobOptions = {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
    removeOnComplete: { count: 500 }, // keep last 500 completed jobs in redis
    removeOnFail: false, // do not delete failed jobs so we can inspect them
  };

  // Support scheduled jobs ("send later");
  if (scheduledAt) {
    const delay = new Date(scheduledAt).getTime() - Date.now();
    if (delay > 0) {
      jobOptions.delay = delay;
    }
  }

  // Adding job to queue
  const job = await queue.add(
    `send:${channel.toLowerCase()}`,
    {
      deliveryId,
      notificationId,
      userId,
      payload,
    },
    jobOptions,
  );

  return job.id;
};

