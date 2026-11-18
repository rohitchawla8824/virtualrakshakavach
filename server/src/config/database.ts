import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export async function connectDatabase() {
  if (!env.MONGODB_URI) {
    logger.warn('MONGODB_URI is not configured; database-dependent features are unavailable.');
    return false;
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    autoIndex: env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 10_000,
  });
  logger.info({ database: mongoose.connection.name }, 'MongoDB connection established');
  return true;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
