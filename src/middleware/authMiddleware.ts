import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../models/User';

export interface AuthUser {
  id: string;
  email: string;
  hasPaidAccess: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface TokenPayload extends JwtPayload {
  userId?: string;
}

/**
 * Verifies the Bearer JWT token and attaches the authenticated user to `req.user`.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Authorization token is required' });
      return;
    }

    if (!env.jwtSecret) {
      res.status(500).json({ message: 'JWT_SECRET is not configured' });
      return;
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      res.status(401).json({ message: 'Authorization token is required' });
      return;
    }

    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;
    if (!decoded.userId) {
      res.status(401).json({ message: 'Invalid authorization token' });
      return;
    }

    const user = await User.findById(decoded.userId).select('_id email hasPaidAccess');
    if (!user) {
      res.status(401).json({ message: 'User not found for authorization token' });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      hasPaidAccess: user.hasPaidAccess,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.status(401).json({ message: 'Invalid or expired authorization token' });
      return;
    }

    next(error);
  }
}

