import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../models/User.js';
import connectDB from '../config/db.js';

const seedAdmin = async () => {
  await connectDB();

  const existing = await User.findOne({ email: 'admin@halfsec.com' });
  if (existing) {
    console.log('Admin already exists.');
    process.exit(0);
  }

  await User.create({
    name: 'Halfsec Admin',
    email: 'admin@halfsec.com',
    password: 'Admin1234!',   // change this after first login
    role: 'admin',
  });

  console.log('Admin created: admin@halfsec.com / Admin1234!');
  process.exit(0);
};

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});