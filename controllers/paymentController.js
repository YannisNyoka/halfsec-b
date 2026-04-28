import axios from 'axios';
import Order from '../models/Order.js';

const YOCO_API = 'https://payments.yoco.com/api';

// ── Create Yoco checkout session ───────────────────────────────────────────────
export const createCheckoutSession = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'Order ID is required.' });
    }

    // Fetch order and verify it belongs to this user
    const order = await Order.findOne({
      _id: orderId,
      user: req.user.id,
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Order is already paid.' });
    }

    const amountInCents = Math.round(order.total * 100);

    // Create Yoco checkout session
    const response = await axios.post(
      `${YOCO_API}/checkouts`,
      {
        amount: amountInCents,
        currency: 'ZAR',
        cancelUrl: `${process.env.CLIENT_URL}/checkout?cancelled=true&orderId=${order._id}`,
        successUrl: `${process.env.CLIENT_URL}/orders/${order._id}?paid=true`,
        failureUrl: `${process.env.CLIENT_URL}/checkout?failed=true&orderId=${order._id}`,
        metadata: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          checksum: order._id.toString(),
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.YOCO_SECRET_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': order._id.toString(),
        },
      }
    );

    // Save checkout ID on order for webhook verification
    order.paymentReference = response.data.id;
    await order.save();

    res.status(200).json({
      checkoutUrl: response.data.redirectUrl,
      checkoutId: response.data.id,
    });

  } catch (error) {
    console.error('Yoco checkout error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to create payment session. Please try again.',
    });
  }
};

// ── Yoco webhook — payment confirmation ────────────────────────────────────────
export const yocoWebhook = async (req, res) => {
  try {
    const event = typeof req.body === 'string' 
  ? JSON.parse(req.body) 
  : Buffer.isBuffer(req.body) 
    ? JSON.parse(req.body.toString()) 
    : req.body;

    console.log('Yoco webhook event:', event.type);

    if (event.type === 'payment.succeeded') {
      const orderId = event.payload?.metadata?.orderId;

      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && order.paymentStatus !== 'paid') {
          order.paymentStatus = 'paid';
          order.orderStatus = 'confirmed';
          order.paidAt = new Date();
          await order.save();
          console.log(`Order ${order.orderNumber} marked as paid via webhook`);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ message: 'Webhook error.' });
  }
};

// ── Verify payment after redirect ──────────────────────────────────────────────
export const verifyPayment = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      user: req.user.id,
    });

    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }

    // If already marked paid (by webhook) just return success
    if (order.paymentStatus === 'paid') {
      return res.status(200).json({ paid: true, order });
    }

    // Check with Yoco if payment went through
    if (order.paymentReference) {
      try {
        const response = await axios.get(
          `${YOCO_API}/checkouts/${order.paymentReference}`,
          {
            headers: {
              'Authorization': `Bearer ${process.env.YOCO_SECRET_KEY}`,
            },
          }
        );

        if (response.data.status === 'complete') {
          order.paymentStatus = 'paid';
          order.orderStatus = 'confirmed';
          order.paidAt = new Date();
          await order.save();
          return res.status(200).json({ paid: true, order });
        }
      } catch (yocoErr) {
        console.error('Yoco verification error:', yocoErr.message);
      }
    }

    res.status(200).json({ paid: false, order });
  } catch (error) {
    res.status(500).json({ message: 'Server error.' });
  }
};

// ── Get Yoco public key ────────────────────────────────────────────────────────
export const getPublicKey = (req, res) => {
  res.status(200).json({
    publicKey: process.env.YOCO_PUBLIC_KEY,
  });
};