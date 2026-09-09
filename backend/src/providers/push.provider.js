export const sendPush = async ({ deviceToken, title, body, data }) => {
  console.log(`[PushProvider] Sending FCM Push: "${title}" to token: ${deviceToken}`);
  await new Promise((res) => setTimeout(res, 100));
  return { success: true, messageId: `fcm_${Date.now()}` };
};
