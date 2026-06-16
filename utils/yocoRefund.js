// ── Process a refund via Yoco API ────────────────────────────────────────────────
// Docs: https://developer.yoco.com/online/api-reference/refunds
export const processYocoRefund = async (checkoutId, amountInCents, reason) => {
  try {
    const response = await fetch(`https://payments.yoco.com/api/checkouts/${checkoutId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.YOCO_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: amountInCents, // amount in cents
        reason: reason || 'Dispute resolved in buyer\'s favor',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Yoco refund failed:', data);
      return { success: false, error: data.message || 'Refund failed' };
    }

    return { success: true, refund: data };
  } catch (error) {
    console.error('Yoco refund error:', error.message);
    return { success: false, error: error.message };
  }
};