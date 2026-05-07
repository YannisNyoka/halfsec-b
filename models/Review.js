import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required.'],
      min: 1,
      max: 5,
    },
    title: {
      type: String,
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters.'],
    },
    body: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review cannot exceed 1000 characters.'],
    },
    verified: {
      type: Boolean,
      default: false, // true if user purchased the product
    },
    helpful: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// One review per user per product
reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, createdAt: -1 });

const Review = mongoose.model('Review', reviewSchema);
export default Review;