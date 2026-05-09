import 'dotenv/config';
import connectDB from '../config/db.js';
import Order from '../models/Order.js';

const migrate = async () => {
  await connectDB();

  const orders = await Order.find({ timeline: { $size: 0 } });
  console.log(`Migrating ${orders.length} orders...`);

  for (const order of orders) {
    order.timeline = [{
      status: order.orderStatus,
      message: `Order ${order.orderStatus}.`,
      timestamp: order.updatedAt || order.createdAt,
    }];
    await order.save();
  }

  console.log('Migration complete.');
  process.exit(0);
};

migrate().catch((e) => { console.error(e); process.exit(1); });