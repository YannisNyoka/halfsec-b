// ── Escrow configuration ─────────────────────────────────────────────────────────
export const REVIEW_WINDOW_DAYS = 7;
export const REMINDER_DAY = 5; // send reminder email on this day

export const calculateAutoReleaseDate = (deliveredAt) => {
  const date = new Date(deliveredAt);
  date.setDate(date.getDate() + REVIEW_WINDOW_DAYS);
  return date;
};

export const getDaysRemaining = (autoReleaseAt) => {
  if (!autoReleaseAt) return null;
  const now = new Date();
  const diff = new Date(autoReleaseAt) - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};