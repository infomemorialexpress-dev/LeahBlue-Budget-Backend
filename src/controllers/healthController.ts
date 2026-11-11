import { Request, Response } from 'express';
import mongoose from 'mongoose';

export function getHealth(_req: Request, res: Response): void {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(200).json({
    status: 'ok',
    database: dbReady ? 'connected' : 'disconnected',
  });
}

