import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    // Sub-orders included in this payout — for traceability
    subOrders: [
      {
        order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        subOrderId: { type: mongoose.Schema.Types.ObjectId },
        amount: Number,
      },
    ],
    method: {
      type: String,
      enum: ['eft', 'other'],
      default: 'eft',
    },
    reference: { type: String, trim: true }, // bank reference number
    notes: { type: String, trim: true },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Payout', payoutSchema);