import mongoose from 'mongoose';

const priceAlertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    targetPrice: { type: Number, required: true },
    triggered: { type: Boolean, default: false },
    triggeredAt: { type: Date, default: null },
    triggeredPrice: { type: Number, default: null },
  },
  { timestamps: true }
);

// One alert per user per product
priceAlertSchema.index({ user: 1, product: 1 }, { unique: true });

export default mongoose.model('PriceAlert', priceAlertSchema);