// ── Add tracking info (seller) ────────────────────────────────────────────
// PATCH /api/orders/:id/tracking
export const addTracking = async (req, res) => {
  try {
    const { trackingNumber, courierName, estimatedDelivery } = req.body;

    if (!trackingNumber?.trim()) {
      return res.status(400).json({ message: 'Tracking number is required.' });
    }

    // Find the order and verify this seller has items in it
    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    // Seller can only add tracking to orders containing their products
    const sellerHasItems = order.subOrders?.some(
      (sub) => sub.seller?.toString() === req.user.id
    );
    // Also allow if it's a direct order (no subOrders / single seller)
    const isSeller = sellerHasItems || order.items?.some(
      (item) => item.seller?.toString() === req.user.id
    );

    if (!isSeller && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorised.' });
    }

    // Save tracking info
    order.trackingNumber = trackingNumber.trim();
    if (courierName) order.courierName = courierName.trim();
    if (estimatedDelivery) order.estimatedDelivery = new Date(estimatedDelivery);

    // Auto-advance order status to shipped if it hasn't been already
    if (['pending', 'confirmed', 'processing'].includes(order.orderStatus)) {
      order.orderStatus = 'shipped';
      order.timeline = order.timeline || [];
      order.timeline.push({
        status: 'shipped',
        message: `Shipped via ${courierName || 'courier'}. Tracking: ${trackingNumber}`,
        updatedBy: req.user.id,
      });
    }

    await order.save();

    // Notify the buyer via in-app notification + email
    try {
      const { notifyOrderStatus } = await import('../utils/notify.js');
      await notifyOrderStatus(order._id, order.user._id, 'shipped');
    } catch (e) {
      console.error('Notify failed (non-fatal):', e.message);
    }

    try {
      const { sendOrderStatusUpdate } = await import('../utils/email.js');
      if (order.user?.email) {
        sendOrderStatusUpdate(order, order.user.email, order.user.name);
      }
    } catch (e) {
      console.error('Email failed (non-fatal):', e.message);
    }

    res.status(200).json({ message: 'Tracking info saved.', order });
  } catch (error) {
    console.error('ADD TRACKING ERROR:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};