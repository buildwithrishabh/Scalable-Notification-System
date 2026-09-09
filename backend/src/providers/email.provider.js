import dotenv from "dotenv";

dotenv.config();

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export const sendEmail = async ({ to, toName, subject, html, text }) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName =
    process.env.BREVO_SENDER_NAME || "Scalable Notification System";

  if (!apiKey) {
    throw new Error(
      "[Brevo Provider] BREVO_API_KEY is missing in environment variables. Please configure it in .env",
    );
  }

  if (!senderEmail) {
    throw new Error(
      "[Brevo Provider] BREVO_SENDER_EMAIL is missing in environment variables. Please set a verified sender email in .env",
    );
  }

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: to,
        ...(toName ? { name: toName } : {}),
      },
    ],
    subject,
    htmlContent: html || `<p>${text || subject}</p>`,
    ...(text ? { textContent: text } : {}),
  };

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data?.message ||
      data?.code ||
      `Brevo request failed with HTTP status ${response.status}`;
    console.error(
      `[Brevo Provider] Failed to send email to ${to}:`,
      errorMessage,
    );
    throw new Error(`[Brevo Provider] ${errorMessage}`);
  }

  console.log(
    `[Brevo Provider] Email sent successfully to ${to} (Message ID: ${data.messageId})`,
  );

  return {
    success: true,
    messageId: data.messageId,
    provider: "brevo",
  };
};

