import dotenv from 'dotenv';

dotenv.config();

interface Env {
  nodeEnv: string;
  port: number;
  mongodbUri: string;
  bcryptRounds: number;
  accessTokenSecret: string;
  accessTokenTtlMinutes: number;
}

const readSecret = (name: string, fallback: string): string => {
  const value = process.env[name];
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required env: ${name}`);
  }
  return fallback;
};

const env: Env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  mongodbUri:
    process.env.MONGODB_URI ||
    'mongodb://localhost:27017/datsan247?replicaSet=rs0',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
  accessTokenSecret: readSecret('ACCESS_TOKEN_SECRET', 'dev-access-token-secret'),
  accessTokenTtlMinutes: parseInt(process.env.ACCESS_TOKEN_TTL_MINUTES || '10080', 10),
};

export default env;
