import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [150, 'Product name cannot exceed 150 characters'],
    },
    slug: {
      type: String,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    originalPrice: {
      type: Number,
      min: [0, 'Original price cannot be negative'],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
      },
    ],
    condition: {
      type: String,
      enum: ['like new', 'good', 'fair', 'poor'],
      required: [true, 'Condition is required'],
    },
    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock cannot be negative'],
      default: 1,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    tags: [{ type: String, lowercase: true, trim: true }],
    sold: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Auto-generate unique slug from name
productSchema.pre('save', async function () {
  if (!this.isModified('name')) return next();

  let slug = this.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  // Ensure slug is unique by appending a short id if needed
  const existing = await mongoose.models.Product.findOne({ slug, _id: { $ne: this._id } });
  if (existing) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }

  this.slug = slug;
  
});

// Indexes for fast queries
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });
productSchema.index({ isActive: 1, stock: 1 });
productSchema.index({ isFeatured: 1 });
productSchema.index({ slug: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;