import { db } from "../../config/database.js";
import { redis } from "../../config/redis.js";

export const renderTemplate = async (type, channel, variables = {}) => {
  const cacheKey = `template:${type}:${channel}`;
  let template = await redis.get(cacheKey);

  if (!template) {
    const query = `select subject , content from templates where type = $1 and channel = $2`;
    const result = await db.query(query, [type, channel]);
    if (result.rows.length === 0) return null;

    template = JSON.stringify(result.rows[0]);
    await redis.set(cacheKey, template, "EX", 3600); // cache for 1 hour
  }

  const { subject, content } = JSON.parse(template);

  const compile = (str) =>
    str.replace(/\{\{(.*?)\}\}/g, (_, key) => variables[key.trim()] || "");

  return {
    subject: subject ? compile(subject) : "",
    content: compile(content),
  };
};
