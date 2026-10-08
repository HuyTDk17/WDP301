import app from './app';
import env from './config/env';
import { connectDatabase } from './config/db';

const start = async (): Promise<void> => {
  await connectDatabase();

  const server = app.listen(env.port, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${env.port} (${env.nodeEnv})`);
  });

  const shutdown = (signal: string): void => {
    console.log(`\n${signal} nhận được, đang đóng server...`);
    server.close(() => {
      console.log('Server đã đóng.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((error) => {
  console.error('Không thể khởi động server:', error);
  process.exit(1);
});
