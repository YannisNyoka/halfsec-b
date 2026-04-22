import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Shared email wrapper ──────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: `Halfsec <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    if (error) {
      console.error('Email send error:', error);
      return false;
    }
    console.log('Email sent:', data?.id);
    return true;
  } catch (err) {
    console.error('Email error:', err.message);
    return false;  // never throw — email failure shouldn't break the order
  }
};

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
const emailWrapper = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Halfsec</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr><td style="background:#1a1a1a;border-radius:16px 16px 0 0;padding:28px 40px;">
          <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
            half<span style="color:#f5a623;">sec</span>
          </h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#ffffff;padding:40px;border-left:1px solid #e0ddd8;border-right:1px solid #e0ddd8;">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f0ede8;border-radius:0 0 16px 16px;padding:20px 40px;border:1px solid #e0ddd8;border-top:none;">
          <p style="margin:0;font-size:12px;color:#888;text-align:center;">
            Halfsec · Second hand. First class. · South Africa
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`;

// ── Customer: order confirmation ──────────────────────────────────────────────
export const sendOrderConfirmation = async (order, userEmail, userName) => {
  const itemsHtml = order.items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #f0ede8;">
        <div style="font-size:14px;font-weight:600;color:#1a1a1a;">${item.name}</div>
        <div style="font-size:12px;color:#888;margin-top:2px;">Qty: ${item.quantity}</div>
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #f0ede8;text-align:right;font-size:14px;font-weight:700;color:#d4820a;">
        R${(item.price * item.quantity).toLocaleString()}
      </td>
    </tr>
  `).join('');

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      Order confirmed! 🎉
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${userName}, thank you for your order. We've received it and will be in touch soon.
    </p>

    <!-- Order number -->
    <div style="background:#f5f5f0;border-radius:10px;padding:16px 20px;margin-bottom:28px;border:1px solid #e0ddd8;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Order number</div>
      <div style="font-size:20px;font-weight:800;color:#d4820a;">${order.orderNumber}</div>
    </div>

    <!-- Items -->
    <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.5px;">
      Items ordered
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${itemsHtml}
    </table>

    <!-- Totals -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#666;">Subtotal</td>
        <td style="padding:6px 0;font-size:14px;color:#1a1a1a;text-align:right;">R${order.itemsTotal.toLocaleString()}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#666;">Shipping</td>
        <td style="padding:6px 0;font-size:14px;text-align:right;color:${order.shippingCost === 0 ? '#16a34a' : '#1a1a1a'};">
          ${order.shippingCost === 0 ? 'Free' : `R${order.shippingCost}`}
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0 0;font-size:16px;font-weight:700;color:#1a1a1a;border-top:2px solid #1a1a1a;">Total</td>
        <td style="padding:10px 0 0;font-size:16px;font-weight:700;color:#d4820a;text-align:right;border-top:2px solid #1a1a1a;">
          R${order.total.toLocaleString()}
        </td>
      </tr>
    </table>

    <!-- Shipping address -->
    <div style="background:#f5f5f0;border-radius:10px;padding:16px 20px;margin-bottom:28px;border:1px solid #e0ddd8;">
      <div style="font-size:12px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Shipping to</div>
      <div style="font-size:14px;color:#1a1a1a;line-height:1.8;">
        <strong>${order.shippingAddress.name}</strong><br>
        ${order.shippingAddress.street}<br>
        ${order.shippingAddress.city}, ${order.shippingAddress.province} ${order.shippingAddress.postalCode}<br>
        ${order.shippingAddress.country}
      </div>
    </div>

    <!-- Payment method -->
    <div style="background:#fff8ed;border:1px solid #fde68a;border-radius:10px;padding:14px 20px;margin-bottom:28px;">
      <div style="font-size:13px;color:#92400e;">
        <strong>Payment method:</strong> ${order.paymentMethod.toUpperCase()}
        ${order.paymentMethod === 'eft' ? ' — Please complete your EFT payment to confirm your order.' : ''}
      </div>
    </div>

    <p style="margin:0;font-size:14px;color:#666;line-height:1.6;">
      We'll send you another email when your order ships. If you have any questions, just reply to this email.
    </p>
  `;

  return sendEmail({
    to: userEmail,
    subject: `Order confirmed — ${order.orderNumber} | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Admin: new order alert ────────────────────────────────────────────────────
export const sendAdminOrderAlert = async (order, userName, userEmail) => {
  const itemsHtml = order.items.map((item) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:14px;color:#1a1a1a;">
        ${item.name} × ${item.quantity}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ede8;font-size:14px;font-weight:600;color:#d4820a;text-align:right;">
        R${(item.price * item.quantity).toLocaleString()}
      </td>
    </tr>
  `).join('');

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      New order received! 🛍️
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;">
      A new order has been placed on Halfsec.
    </p>

    <!-- Order summary -->
    <div style="background:#f5f5f0;border-radius:10px;padding:20px;margin-bottom:24px;border:1px solid #e0ddd8;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#888;padding-bottom:4px;">Order number</td>
          <td style="font-size:12px;color:#888;padding-bottom:4px;text-align:right;">Total</td>
        </tr>
        <tr>
          <td style="font-size:20px;font-weight:800;color:#d4820a;">${order.orderNumber}</td>
          <td style="font-size:20px;font-weight:800;color:#d4820a;text-align:right;">R${order.total.toLocaleString()}</td>
        </tr>
      </table>
    </div>

    <!-- Customer -->
    <div style="margin-bottom:20px;">
      <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Customer</div>
      <div style="font-size:15px;font-weight:600;color:#1a1a1a;">${userName}</div>
      <div style="font-size:14px;color:#666;">${userEmail}</div>
      <div style="font-size:14px;color:#666;">${order.shippingAddress.phone}</div>
    </div>

    <!-- Items -->
    <div style="margin-bottom:20px;">
      <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Items</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${itemsHtml}
      </table>
    </div>

    <!-- Shipping -->
    <div style="background:#f5f5f0;border-radius:10px;padding:16px 20px;margin-bottom:20px;border:1px solid #e0ddd8;">
      <div style="font-size:12px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Ship to</div>
      <div style="font-size:14px;color:#1a1a1a;line-height:1.7;">
        ${order.shippingAddress.name}<br>
        ${order.shippingAddress.street}<br>
        ${order.shippingAddress.city}, ${order.shippingAddress.province}<br>
        ${order.shippingAddress.postalCode}
      </div>
    </div>

    <!-- Payment -->
    <div style="background:#fff8ed;border:1px solid #fde68a;border-radius:10px;padding:14px 20px;margin-bottom:24px;">
      <div style="font-size:13px;color:#92400e;">
        <strong>Payment:</strong> ${order.paymentMethod.toUpperCase()} · Status: ${order.paymentStatus.toUpperCase()}
      </div>
    </div>

    <!-- Action button -->
    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL}/admin/orders/${order._id}"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        View order in dashboard →
      </a>
    </div>
  `;

  return sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `New order ${order.orderNumber} — R${order.total.toLocaleString()} | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Customer: order status update ─────────────────────────────────────────────
export const sendOrderStatusUpdate = async (order, userEmail, userName) => {
  const statusMessages = {
    confirmed: { emoji: '✅', title: 'Order confirmed', msg: 'Your order has been confirmed and is being prepared.' },
    processing: { emoji: '📦', title: 'Order processing', msg: 'Your order is being packed and prepared for shipping.' },
    shipped: { emoji: '🚚', title: 'Order shipped!', msg: 'Your order is on its way. Expect delivery within 2-5 business days.' },
    delivered: { emoji: '🎉', title: 'Order delivered!', msg: 'Your order has been delivered. We hope you love it!' },
    cancelled: { emoji: '❌', title: 'Order cancelled', msg: 'Your order has been cancelled. If this was unexpected, please contact us.' },
  };

  const info = statusMessages[order.orderStatus];
  if (!info) return;

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      ${info.emoji} ${info.title}
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${userName}, ${info.msg}
    </p>

    <div style="background:#f5f5f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;border:1px solid #e0ddd8;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#888;">Order number</td>
          <td style="font-size:12px;color:#888;text-align:right;">Total</td>
        </tr>
        <tr>
          <td style="font-size:18px;font-weight:800;color:#d4820a;padding-top:4px;">${order.orderNumber}</td>
          <td style="font-size:18px;font-weight:800;color:#d4820a;text-align:right;padding-top:4px;">R${order.total.toLocaleString()}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL}/orders/${order._id}"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        View order details →
      </a>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `${info.emoji} ${info.title} — ${order.orderNumber} | Halfsec`,
    html: emailWrapper(content),
  });
};