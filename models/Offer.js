import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    offerPrice: { type: Number, required: true, min: 1 },
    originalPrice: { type: Number, required: true },
    message: { type: String, trim: true, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired', 'withdrawn'],
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
    },
    respondedAt: { type: Date, default: null },
    sellerNote: { type: String, trim: true, maxlength: 500, default: '' },
    // If accepted, link to the order placed at the offer price
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
  },
  { timestamps: true }
);

offerSchema.index({ product: 1, buyer: 1 });
offerSchema.index({ seller: 1, status: 1 });
offerSchema.index({ buyer: 1, status: 1 });
offerSchema.index({ expiresAt: 1, status: 1 });

export default mongoose.model('Offer', offerSchema);