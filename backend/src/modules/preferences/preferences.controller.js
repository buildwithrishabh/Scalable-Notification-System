import {
  getUserPreferences,
  updateUserPreference,
} from "./preferences.service.js";

export const getMyPreferences = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const prefs = await getUserPreferences(userId);
    res.json({ success: true, data: prefs });
  } catch (error) {
    next(error);
  }
};

export const updatePreferences = async (req, res, next) => {
  try {
    const { email_enabled, push_enabled, sms_enabled, in_app_enabled } = req.body;
    const userId = req.user.id;
    const prefs = await updateUserPreference(
      userId,
      {email_enabled,
      push_enabled,
      sms_enabled,
      in_app_enabled}
    );
    res.json({ success: true, data: prefs });
  } catch (error) {
    next(error);
  }
};
