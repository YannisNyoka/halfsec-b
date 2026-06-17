import mongoose from 'mongoose';

const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ user: 1 });

export default mongoose.model('PushSubscription', pushSubscriptionSchema);