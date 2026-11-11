import mongoose from 'mongoose';
import { env } from './env';

let listenersRegistered = false;

/**
 * Connects to MongoDB using the configured URI and logs clear diagnostics on error.
 */
export async function connectDB(): Promise<boolean> {
  if (!env.mongodbUri) {
    console.error('MongoDB connection error: MONGODB_URI is not defined in .env');
    return false;
  }

  if (!listenersRegistered) {
    mongoose.connection.on('error', (error) => {
      console.error('MongoDB runtime error:', error instanceof Error ? error.message : error);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    listenersRegistered = true;
  }

  try {
    const conn = await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(
      `MongoDB connected successfully: ${conn.connection.host}/${conn.connection.name}`,
    );
    return true;
  } catch (error) {
    const err = error as Error;
    console.error('MongoDB connection failed:', err.name, '-', err.message);
    if (err.name === 'MongooseServerSelectionError') {
      console.error(
        'MongoDB Hint: Ensure your current IP is whitelisted in MongoDB Atlas Network Access (or allow 0.0.0.0/0 for development/Render) and check MONGODB_URI in .env.',
      );
    }
    return false;
  }
}
