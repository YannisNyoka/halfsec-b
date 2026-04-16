import { body } from 'express-validator';

export const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
];

export const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please enter a valid email.'),

  body('password')
    .notEmpty().withMessage('Password is required.'),
];

export const updateProfileValidator = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters.'),

  body('phone')
    .optional()
    .trim()
    .isMobilePhone().withMessage('Please enter a valid phone number.'),
];

export const changePasswordValidator = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required.'),

  body('newPassword')
    .notEmpty().withMessage('New password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
];

export const categoryValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Category name is required.')
    .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters.'),
];

export const productValidator = [
  body('name').trim().notEmpty().withMessage('Product name is required.'),
  body('description').trim().notEmpty().withMessage('Description is required.'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number.'),
  body('category').notEmpty().withMessage('Category is required.'),
  body('condition')
    .isIn(['like new', 'good', 'fair', 'poor'])
    .withMessage('Invalid condition value.'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer.'),
];

export const orderValidator = [
  body('shippingAddress.name').trim().notEmpty().withMessage('Recipient name is required.'),
  body('shippingAddress.street').trim().notEmpty().withMessage('Street address is required.'),
  body('shippingAddress.city').trim().notEmpty().withMessage('City is required.'),
  body('shippingAddress.province').trim().notEmpty().withMessage('Province is required.'),
  body('shippingAddress.postalCode').trim().notEmpty().withMessage('Postal code is required.'),
  body('shippingAddress.phone').trim().notEmpty().withMessage('Phone number is required.'),
  body('paymentMethod')
    .isIn(['card', 'eft', 'payfast'])
    .withMessage('Invalid payment method.'),
];