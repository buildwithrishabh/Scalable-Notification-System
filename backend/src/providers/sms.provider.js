import dotenv from "dotenv";
import { logger } from "../observability/logger.js";

dotenv.config();

export const sendSms = async ({ to, text }) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken) {
    throw new Error(
      "[Twilio Provider] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN is missing in environment variables.",
    );
  }

  if (!fromNumber) {
    throw new Error(
      "[Twilio Provider] TWILIO_PHONE_NUMBER is missing in environment variables.",
    );
  }

  if (!to || !text) {
    throw new Error("[Twilio Provider] Both 'to' (recipient phone number) and 'text' body are required.");
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

  const bodyParams = new URLSearchParams({
    To: to,
    From: fromNumber,
    Body: text,
  });

  const response = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.message ||
      `Twilio request failed with HTTP status ${response.status}`;
    logger.error(`[Twilio Provider] Failed to send SMS to ${to}:`, {
      errorMessage,
      status: response.status,
      code: data?.code,
      to,
    });
    throw new Error(`[Twilio Provider] ${errorMessage}`);
  }

  logger.info(`[Twilio Provider] SMS sent successfully to ${to}`, {
    messageSid: data.sid,
    to,
    status: data.status,
  });

  return {
    success: true,
    messageId: data.sid,
    provider: "twilio",
  };
};
