import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { IUser, User } from '../models/User';

const SALT_ROUNDS = 10;

function signAuthToken(user: IUser): string {
  if (!env.jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions['expiresIn'],
  };

  return jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      hasPaidAccess: user.hasPaidAccess,
    },
    env.jwtSecret,
    options,
  );
}

function serializeUser(user: IUser) {
  return {
    id: user._id.toString(),
    email: user.email,
    hasPaidAccess: user.hasPaidAccess,
  };
}

/**
 * Registers a new user after verifying the Stan Store access key.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password, accessKey } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters long' });
      return;
    }

    const expectedAccessKey = process.env.STAN_STORE_ACCESS_KEY;
    if (!expectedAccessKey) {
      res.status(500).json({ message: 'STAN_STORE_ACCESS_KEY is not configured' });
      return;
    }

    if (typeof accessKey !== 'string' || accessKey !== expectedAccessKey) {
      res.status(403).json({
        message: 'Invalid access key. Access is only available with a valid Stan Store purchase.',
      });
      return;
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      res.status(409).json({ message: 'An account with this email already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,
      hasPaidAccess: true,
    });

    const token = signAuthToken(user);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Authenticates an existing user by email and password and returns a JWT token.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      res.status(400).json({ message: 'Email and password are required' });
      return;
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid email or password' });
      return;
    }

    const token = signAuthToken(user);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

