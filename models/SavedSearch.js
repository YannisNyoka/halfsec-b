import mongoose from 'mongoose';

const savedSearchSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: { type: String, trim: true, maxlength: 100 },
    filters: {
      search: { type: String, default: '' },
      category: { type: String, default: '' },
      conditions: [{ type: String }],
      minPrice: { type: Number, default: 0 },
      maxPrice: { type: Number, default: 0 },
      sort: { type: String, default: 'newest' },
      inStock: { type: Boolean, default: false },
    },
    alertEnabled: { type: Boolean, default: true },
    lastAlertedAt: { type: Date, default: null },
    lastResultCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

savedSearchSchema.index({ user: 1 });

export default mongoose.model('SavedSearch', savedSearchSchema);