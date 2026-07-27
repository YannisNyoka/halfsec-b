import mongoose from 'mongoose';
import User from '../../models/User.js';
import Order from '../../models/Order.js';
import Category from '../../models/Category.js';
import Product from '../../models/Product.js';
import Cart from '../../models/Cart.js';

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

export const createProduct = async ({ sellerId = null, price = 100, stock = 10, overrides = {} } = {}) => {
  const category = await Category.create({ name: `Category ${new mongoose.Types.ObjectId()}` });
  return Product.create({
    name: 'Test Product',
    description: 'A fine test product.',
    price,
    category: category._id,
    seller: sellerId,
    condition: 'good',
    stock,
    images: [{ url: 'http://img.test/p.jpg', publicId: 'test-public-id' }],
    ...overrides,
  });
};

export const createCartForUser = (userId, items) =>
  Cart.create({
    user: userId,
    items: items.map(({ product, quantity = 1, priceAtAdd }) => ({
      product: product._id,
      quantity,
      priceAtAdd: priceAtAdd ?? product.price,
    })),
  });
