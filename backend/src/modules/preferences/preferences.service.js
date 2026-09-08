import { db } from "../../config/database.js";
import { redis } from "../../config/redis.js";

export const getUserPreferences = async (userId) => {
  const cacheKey = `preferences:${userId}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const query = `select email_enabled , push_enabled , sms_enabled , in_app_enabled from notification_preferences where user_id = $1`;
  const result = await db.query(query, [userId]);

  let prefs = result.rows[0];
  if (!prefs) {
    prefs = {
      email_enabled: true,
      push_enabled: true,
      sms_enabled: false,
      in_app_enabled: true,
    };
  }

  // cache for 30 minutes
  await redis.set(cacheKey, JSON.stringify(prefs) , "EX" , 1800);
  return prefs;
};

export const updateUserPreference = async (
  userId,
  { email_enabled, push_enabled, sms_enabled, in_app_enabled },
) => {
  const query = `insert into notification_preferences (user_id , email_enabled , push_enabled , sms_enabled , in_app_enabled)
    values ($1 , $2 , $3 , $4 , $5 )
    on conflict (user_id) do update set
    email_enabled = excluded.email_enabled,
    push_enabled = excluded.push_enabled,
    sms_enabled = excluded.sms_enabled,
    in_app_enabled = excluded.in_app_enabled
    returning *;`;

  const result = await db.query(query, [
    userId,
    email_enabled,
    push_enabled,
    sms_enabled,
    in_app_enabled,
  ]);

  // invalidate redis cache
  await redis.del(`preferences:${userId}`);
  return result.rows[0];
};
