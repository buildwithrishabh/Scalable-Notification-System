export const sendSms = async ({ to, text }) => {
  console.log(`[SmsProvider] Sending SMS to: ${to} | Text: "${text}"`);
  await new Promise((res) => setTimeout(res, 150));
  return { success: true, messageId: `sms_${Date.now()}` };
};
