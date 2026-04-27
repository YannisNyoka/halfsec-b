import axios from 'axios';
import Order from '../models/Order.js';

const YOCO_API = 'https://payments.yoco.com/api';

// ── Create Yoco charge ─────────────────────────────────────────────────────────
export const createCharge = async (req, res) => {
  try {
    const { token, orderId } = req.body;

    if (!token || !orderId) {
      return res.status(400).json({ message: 'Token and order ID are required.' });
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

    // Amount in cents (Yoco requires cents)
    const amountInCents = Math.round(order.total * 100);

    // Charge via Yoco API
    const response = await axios.post(
      `${YOCO_API}/charges`,
      {
        token,
        amountInCents,
        currency: 'ZAR',
        metadata: {
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
        },
      },
      {
        headers: {
          'X-Auth-Secret-Key': process.env.YOCO_SECRET_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    // Yoco charge succeeded
    if (response.data.status === 'successful') {
      // Update order payment status
      order.paymentStatus = 'paid';
      order.orderStatus = 'confirmed';
      order.paidAt = new Date();
      order.paymentReference = response.data.id;
      await order.save();

      return res.status(200).json({
        message: 'Payment successful.',
        order,
        charge: response.data,
      });
    }

    // Yoco returned a non-successful status
    return res.status(400).json({
      message: 'Payment was not successful. Please try again.',
    });

  } catch (error) {
    console.error('Yoco charge error:', error.response?.data || error.message);

    const yocoError = error.response?.data;

    // Handle specific Yoco errors
    if (yocoError?.errorCode === 'card_declined') {
      return res.status(400).json({ message: 'Your card was declined. Please try a different card.' });
    }
    if (yocoError?.errorCode === 'insufficient_funds') {
      return res.status(400).json({ message: 'Insufficient funds on your card.' });
    }
    if (yocoError?.errorCode === 'expired_card') {
      return res.status(400).json({ message: 'Your card has expired.' });
    }

    return res.status(500).json({ message: 'Payment failed. Please try again.' });
  }
};

// ── Get Yoco public key (safe to expose) ──────────────────────────────────────
export const getPublicKey = async (req, res) => {
  res.status(200).json({
    publicKey: process.env.YOCO_PUBLIC_KEY,
  });
};