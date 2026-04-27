import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
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
      enum: ['card', 'eft', 'payfast'],
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
    total: { type: Number, required: true },
    notes: { type: String, trim: true, maxlength: 500 },
    paidAt: Date,
    deliveredAt: Date,
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