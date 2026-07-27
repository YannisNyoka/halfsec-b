import mongoose from 'mongoose';
import User from '../../models/User.js';
import Order from '../../models/Order.js';

export const createUser = (overrides = {}) =>
  User.create({
    name: 'Test User',
    email: `user-${new mongoose.Types.ObjectId()}@test.com`,
    password: 'password123',
    ...overrides,
  });

export const createOrder = async ({ buyerId, sellerId, subOrder = {}, order = {} }) =>
  Order.create({
    user: buyerId,
    subOrders: [{
      seller: sellerId,
      items: [{ product: new mongoose.Types.ObjectId(), name: 'Test Item', image: 'http://img.test/1.jpg', price: 100, quantity: 1 }],
      subtotal: 100,
      escrowStatus: 'held',
      ...subOrder,
    }],
    items: [{ product: new mongoose.Types.ObjectId(), seller: sellerId, name: 'Test Item', image: 'http://img.test/1.jpg', price: 100, quantity: 1 }],
    shippingAddress: {
      name: 'Test Buyer', street: '1 Main Rd', city: 'Cape Town',
      province: 'Western Cape', postalCode: '8000', country: 'South Africa', phone: '0821234567',
    },
    paymentMethod: 'yoco',
    paymentStatus: 'paid',
    orderStatus: 'delivered',
    itemsTotal: 100,
    shippingCost: 0,
    total: 100,
    ...order,
  });
