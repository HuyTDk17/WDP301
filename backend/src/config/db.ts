import mongoose from 'mongoose';
import env from './env';

/**
 * Kết nối tới MongoDB. App không khởi động được nếu không kết nối thành công.
 */
export const connectDatabase = async (): Promise<void> => {
  mongoose.set('strictQuery', true);

  await mongoose.connect(env.mongodbUri);

  console.log(`🗄️  MongoDB đã kết nối: ${mongoose.connection.name}`);
};

export default mongoose;
