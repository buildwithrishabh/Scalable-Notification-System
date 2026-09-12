import client from "prom-client";

// Collect default system metrics (CPU, RAM, Event Loop lag)
client.collectDefaultMetrics({ prefix: "notification_service_" });

export const notificationsReceivedCounter = new client.Counter({
  name: "notification_received_total",
  help: "Total notifications ingested by the API",
  labelNames: ["channel"],
});

export const notificationsDeliveredCounter = new client.Counter({
  name: "notification_delivered_total",
  help: "Total notifications successfully delivered to providers",
  labelNames: ["channel", "status"],
});

export const metricsRegistry = client.register;
