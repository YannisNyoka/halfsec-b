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
  ${order.buyerProtectionFee > 0 ? `
  <tr>
    <td style="padding:6px 0;font-size:14px;color:#666;">
      Buyer Protection Fee
      <span style="font-size:11px;color:#999;">ⓘ</span>
    </td>
    <td style="padding:6px 0;font-size:14px;color:#1a1a1a;text-align:right;">R${order.buyerProtectionFee.toLocaleString()}</td>
  </tr>
  ` : ''}
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

${order.buyerProtectionFee > 0 ? `
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px 20px;margin-bottom:28px;">
  <div style="font-size:13px;color:#075985;line-height:1.6;">
    <strong>What's the Buyer Protection Fee?</strong><br>
    Your payment is held securely until you confirm you've received your item as described.
    If there's an issue, we're here to help resolve it.
  </div>
</div>
` : ''}

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
    shipped: { emoji: '🚚', title: 'Order shipped!', msg: 'Your order is on its way!' },
    delivered: { emoji: '🎉', title: 'Order delivered!', msg: 'Your order has been delivered. We hope you love it!' },
    cancelled: { emoji: '❌', title: 'Order cancelled', msg: 'Your order has been cancelled.' },
  };

  const info = statusMessages[order.orderStatus];
  if (!info) return;

  const trackingSection = order.trackingNumber ? `
    <div style="background:#f5f5f0;border-radius:10px;padding:16px 20px;margin:16px 0;border:1px solid #e0ddd8;">
      <div style="font-size:12px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">
        Shipping details
      </div>
      ${order.courierName ? `<div style="font-size:14px;color:#1a1a1a;margin-bottom:6px;"><strong>Courier:</strong> ${order.courierName}</div>` : ''}
      <div style="font-size:14px;color:#1a1a1a;margin-bottom:6px;">
        <strong>Tracking:</strong>
        <span style="font-family:monospace;letter-spacing:1px;color:#d4820a;margin-left:8px;">
          ${order.trackingNumber}
        </span>
      </div>
      ${order.estimatedDelivery ? `
        <div style="font-size:14px;color:#1a1a1a;">
          <strong>Estimated delivery:</strong>
          ${new Date(order.estimatedDelivery).toLocaleDateString('en-ZA', {
            weekday: 'long', day: 'numeric', month: 'long',
          })}
        </div>
      ` : ''}
    </div>
  ` : '';

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      ${info.emoji} ${info.title}
    </h2>
    <p style="margin:0 0 16px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${userName}, ${info.msg}
    </p>

    <div style="background:#f5f5f0;border-radius:10px;padding:16px 20px;margin-bottom:16px;border:1px solid #e0ddd8;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#888;">Order number</td>
          <td style="font-size:12px;color:#888;text-align:right;">Total</td>
        </tr>
        <tr>
          <td style="font-size:18px;font-weight:800;color:#d4820a;padding-top:4px;">
            ${order.orderNumber}
          </td>
          <td style="font-size:18px;font-weight:800;color:#d4820a;text-align:right;padding-top:4px;">
            R${order.total.toLocaleString()}
          </td>
        </tr>
      </table>
    </div>

    ${trackingSection}

    <div style="text-align:center;margin-top:24px;">
      <a href="${process.env.CLIENT_URL}/orders/${order._id}"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        Track your order →
      </a>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `${info.emoji} ${info.title} — ${order.orderNumber} | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Admin: low stock alert ─────────────────────────────────────────────────────
export const sendLowStockAlert = async (product) => {
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      ⚠️ Low stock alert
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;">
      A product on Halfsec is running low on stock.
    </p>

    <div style="background:#fff8ed;border:1px solid #fde68a;border-radius:10px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#888;padding-bottom:4px;">Product</td>
          <td style="font-size:12px;color:#888;padding-bottom:4px;text-align:right;">Stock remaining</td>
        </tr>
        <tr>
          <td style="font-size:18px;font-weight:700;color:#1a1a1a;">${product.name}</td>
          <td style="font-size:24px;font-weight:800;color:${product.stock === 0 ? '#e05252' : '#d97706'};text-align:right;">
            ${product.stock}
          </td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL}/admin/products/edit/${product._id}"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        Update stock →
      </a>
    </div>
  `;

  return sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `⚠️ Low stock: "${product.name}" has ${product.stock} left | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Seller: application received ─────────────────────────────────────────────────
export const sendSellerApplicationReceived = async (userEmail, userName) => {
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      Application received! 📋
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${userName}, thanks for applying to sell on Halfsec. We'll review your application
      and get back to you within 1-2 business days.
    </p>
  `;
  return sendEmail({
    to: userEmail,
    subject: 'Seller application received | Halfsec',
    html: emailWrapper(content),
  });
};

// ── Seller: approved ─────────────────────────────────────────────────────────────
export const sendSellerApprovalEmail = async (userEmail, userName) => {
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      You're approved! 🎉
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${userName}, great news — your seller application has been approved.
      You can now list items on Halfsec.
    </p>
    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL}/seller"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        Go to seller dashboard →
      </a>
    </div>
  `;
  return sendEmail({
    to: userEmail,
    subject: 'You\'re approved to sell on Halfsec! 🎉',
    html: emailWrapper(content),
  });
};

// ── Buyer: review reminder (2 days before auto-release) ─────────────────────────
export const sendReviewReminderEmail = async (order, sub, userEmail, userName) => {
  const itemNames = sub.items.map((i) => i.name).join(', ');

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      How's your order? 👀
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${userName}, it's been a few days since your order
      <strong>${order.orderNumber}</strong> (${itemNames}) was delivered.
    </p>

    <div style="background:#fff8ed;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:13px;color:#92400e;line-height:1.6;">
        If everything looks good, please confirm receipt so we can release payment to the seller.
        If there's an issue, you can raise it instead — but please act within
        <strong>2 days</strong>, or the payment will be automatically released.
      </div>
    </div>

    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL}/orders/${order._id}"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        Review my order →
      </a>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `Please review your order ${order.orderNumber} | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Seller: funds released ───────────────────────────────────────────────────────
export const sendFundsReleasedToSellerEmail = async (sellerEmail, sellerName, order, sub) => {
  const itemNames = sub.items.map((i) => i.name).join(', ');

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      Funds released! 💰
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${sellerName}, the buyer for order <strong>${order.orderNumber}</strong>
      (${itemNames}) has confirmed receipt — or the review window has passed.
    </p>

    <div style="background:#f5f5f0;border-radius:10px;padding:16px 20px;margin-bottom:24px;border:1px solid #e0ddd8;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">
        Amount added to your balance
      </div>
      <div style="font-size:24px;font-weight:800;color:#16a34a;">
        R${sub.subtotal.toLocaleString()}
      </div>
    </div>

    <p style="margin:0;font-size:14px;color:#666;line-height:1.6;">
      This amount is now part of your payout balance. You can view your balance
      and payout history in your seller dashboard.
    </p>

    <div style="text-align:center;margin-top:20px;">
      <a href="${process.env.CLIENT_URL}/seller"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        View seller dashboard →
      </a>
    </div>
  `;

  return sendEmail({
    to: sellerEmail,
    subject: `Funds released for order ${order.orderNumber} | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Admin: dispute received ──────────────────────────────────────────────────────
export const sendDisputeReceivedEmail = async (order, sub) => {
  const itemNames = sub.items.map((i) => i.name).join(', ');

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      New dispute raised ⚠️
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      A buyer has raised a dispute for order <strong>${order.orderNumber}</strong> (${itemNames}).
    </p>

    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Reason</div>
      <div style="font-size:15px;font-weight:700;color:#c0392b;margin-bottom:10px;">${sub.dispute.reason}</div>
      <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">Description</div>
      <div style="font-size:14px;color:#1a1a1a;line-height:1.6;">${sub.dispute.description}</div>
    </div>

    <div style="text-align:center;">
      <a href="${process.env.CLIENT_URL}/admin/disputes"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        Review dispute →
      </a>
    </div>
  `;

  return sendEmail({
    to: process.env.ADMIN_EMAIL,
    subject: `⚠️ Dispute raised — order ${order.orderNumber} | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Buyer & Seller: dispute resolved ─────────────────────────────────────────────
export const sendDisputeResolvedEmail = async (order, sub, resolution) => {
  const itemNames = sub.items.map((i) => i.name).join(', ');
  const buyerWon = resolution === 'refunded_to_buyer';

  // Email to buyer
  const buyerContent = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      Dispute resolved
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${order.user.name}, we've reviewed your dispute for order
      <strong>${order.orderNumber}</strong> (${itemNames}).
    </p>

    <div style="background:${buyerWon ? '#f0fdf4' : '#f5f5f0'};border:1px solid ${buyerWon ? '#bbf7d0' : '#e0ddd8'};border-radius:10px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:15px;font-weight:700;color:${buyerWon ? '#16a34a' : '#1a1a1a'};">
        ${buyerWon
          ? `A refund of R${sub.subtotal.toLocaleString()} will be processed to your original payment method.`
          : `After review, we've released payment to the seller for this item.`
        }
      </div>
      ${sub.dispute.adminNotes ? `
        <div style="font-size:13px;color:#666;margin-top:10px;line-height:1.6;">
          ${sub.dispute.adminNotes}
        </div>
      ` : ''}
    </div>

    <p style="margin:0;font-size:14px;color:#666;">
      If you have any questions about this decision, please reply to this email.
    </p>
  `;

  await sendEmail({
    to: order.user.email,
    subject: `Dispute resolved — order ${order.orderNumber} | Halfsec`,
    html: emailWrapper(buyerContent),
  });

  // Email to seller (if applicable)
  if (sub.seller) {
    try {
      const User = (await import('../models/User.js')).default;
      const seller = await User.findById(sub.seller).select('name email');
      if (seller) {
        const sellerContent = `
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
            Dispute resolved
          </h2>
          <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
            Hi ${seller.name}, a dispute for order <strong>${order.orderNumber}</strong>
            (${itemNames}) has been resolved.
          </p>

          <div style="background:${buyerWon ? '#fef2f2' : '#f0fdf4'};border:1px solid ${buyerWon ? '#fecaca' : '#bbf7d0'};border-radius:10px;padding:16px 20px;margin-bottom:24px;">
            <div style="font-size:15px;font-weight:700;color:${buyerWon ? '#c0392b' : '#16a34a'};">
              ${buyerWon
                ? `The buyer has been refunded R${sub.subtotal.toLocaleString()} for this item. This amount will not be added to your payout balance.`
                : `R${sub.subtotal.toLocaleString()} has been added to your payout balance.`
              }
            </div>
            ${sub.dispute.adminNotes ? `
              <div style="font-size:13px;color:#666;margin-top:10px;line-height:1.6;">
                ${sub.dispute.adminNotes}
              </div>
            ` : ''}
          </div>
        `;
        await sendEmail({
          to: seller.email,
          subject: `Dispute resolved — order ${order.orderNumber} | Halfsec`,
          html: emailWrapper(sellerContent),
        });
      }
    } catch {}
  }
};

// ── Seller: payout processed ─────────────────────────────────────────────────────
export const sendPayoutProcessedEmail = async (sellerEmail, sellerName, payout) => {
  const itemsHtml = payout.subOrders.map((s) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:13px;color:#1a1a1a;">
        Order item
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f0ede8;font-size:13px;font-weight:600;color:#16a34a;text-align:right;">
        R${s.amount.toLocaleString()}
      </td>
    </tr>
  `).join('');

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      Payout sent! 🏦
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${sellerName}, we've processed a payout to your bank account.
    </p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:12px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px;">
        Amount paid
      </div>
      <div style="font-size:28px;font-weight:800;color:#16a34a;">
        R${payout.amount.toLocaleString()}
      </div>
      ${payout.reference ? `
        <div style="font-size:12px;color:#888;margin-top:8px;">
          Reference: ${payout.reference}
        </div>
      ` : ''}
    </div>

    <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1a1a1a;text-transform:uppercase;letter-spacing:0.5px;">
      Included in this payout
    </h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${itemsHtml}
    </table>

    ${payout.notes ? `
      <div style="background:#f5f5f0;border-radius:10px;padding:14px 20px;margin-bottom:24px;border:1px solid #e0ddd8;">
        <div style="font-size:13px;color:#666;line-height:1.6;">${payout.notes}</div>
      </div>
    ` : ''}

    <p style="margin:0;font-size:13px;color:#888;">
      Allow 1-2 business days for the funds to reflect in your account.
    </p>
  `;

  return sendEmail({
    to: sellerEmail,
    subject: `Payout of R${payout.amount.toLocaleString()} sent | Halfsec`,
    html: emailWrapper(content),
  });
};

// ── Password reset ───────────────────────────────────────────────────────────────
export const sendPasswordResetEmail = async (userEmail, userName, resetUrl) => {
  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;">
      Reset your password
    </h2>
    <p style="margin:0 0 24px;font-size:15px;color:#666;line-height:1.6;">
      Hi ${userName}, we received a request to reset your Halfsec password.
      Click the button below to choose a new one. This link expires in 1 hour.
    </p>

    <div style="text-align:center;margin-bottom:24px;">
      <a href="${resetUrl}"
        style="display:inline-block;background:#f5a623;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;text-decoration:none;">
        Reset my password →
      </a>
    </div>

    <p style="margin:0;font-size:13px;color:#888;line-height:1.6;">
      If you didn't request this, you can safely ignore this email — your password won't be changed.
    </p>
  `;

  return sendEmail({
    to: userEmail,
    subject: 'Reset your Halfsec password',
    html: emailWrapper(content),
  });
};