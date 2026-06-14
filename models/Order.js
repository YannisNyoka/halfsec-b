import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
    name: { type: String, required: true },      // snapshot
    image: { type: String, required: true },     // snapshot
    price: { type: Number, required: true },     // snapshot
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }

  
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Add this as a new top-level field on the Order schema:
subOrders: [
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        image: String,
        price: Number,
        quantity: Number,
      },
    ],
    subtotal: { type: Number, required: true },
    escrowStatus: {
      type: String,
      enum: ['held', 'released', 'refunded', 'disputed'],
      default: 'held',
    },
  },
],
    orderNumber: {
      type: String,
    },
    items: [orderItemSchema],
    shippingAddress: {
      name: { type: String, required: true },
      street: { type: String, required: true },
      city: { type: String, required: true },
      province: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, required: true, default: 'South Africa' },
      phone: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      enum: ['card', 'eft', 'payfast', 'yoco'],
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    orderStatus: {
      type: String,
      enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'pending',
    },
    itemsTotal: { type: Number, required: true },
    shippingCost: { type: Number, required: true, default: 0 },
    discountAmount: {
  type: Number,
  default: 0,
},
buyerProtectionFee: {
  type: Number,
  default: 0,
},

couponCode: {
  type: String,
  default: null,
},
    total: { type: Number, required: true },
    notes: { type: String, trim: true, maxlength: 500 },
    paidAt: Date,
    deliveredAt: Date,
    trackingNumber: {
  type: String,
  trim: true,
  default: null,
},
courierName: {
  type: String,
  trim: true,
  default: null,
},
estimatedDelivery: {
  type: Date,
  default: null,
},
timeline: [
  {
    status: { type: String, required: true },
    message: { type: String, trim: true },
    timestamp: { type: Date, default: Date.now },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
],
    paymentReference: {
  type: String,
},
  },
  { timestamps: true }
);

// Auto-generate order number before saving
orderSchema.pre('save', async function () {
  if (!this.orderNumber) {
    const count = await mongoose.models.Order.countDocuments();
    this.orderNumber = `HS-${String(count + 1).padStart(5, '0')}`;
  }
 
});

// Indexes
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ orderNumber: 1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;