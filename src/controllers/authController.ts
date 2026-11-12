import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextFunction, Request, Response } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Resend } from 'resend';
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

/**
 * Sends a password reset email via Resend if the user account exists.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body ?? {};

    if (typeof email !== 'string') {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(200).json({
        message: 'If an account exists, a reset link has been sent to your email.',
      });
      return;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 hour

    user.resetPasswordToken = token;
    user.resetPasswordExpires = expires;
    await user.save();

    const resendApiKey = process.env.RESEND_API_KEY || env.resendApiKey;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not configured');
      res.status(500).json({ message: 'Email service is not configured' });
      return;
    }

    const resend = new Resend(resendApiKey);
    const frontendBase = (
      process.env.FRONTEND_URL ||
      env.frontendUrl ||
      'https://leah-blue-budget.vercel.app'
    ).replace(/\/$/, '');
    const resetUrl = `${frontendBase}/reset-password/${token}`;
    const fromAddress =
      process.env.RESEND_FROM_EMAIL || env.resendFromEmail || 'onboarding@resend.dev';

    await resend.emails.send({
      from: fromAddress,
      to: user.email,
      subject: 'Reset Your MoneyFlow 360 Password',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background-color: #fcfbf9; border: 1px solid #e6e2da; border-radius: 12px; color: #22201d;">
          <h2 style="color: #22201d; margin-top: 0;">Reset Your Password</h2>
          <p style="color: #5a564f; font-size: 15px; line-height: 1.5;">
            You requested to reset your password for your <strong>MoneyFlow 360</strong> account. Click the button below to set a new password:
          </p>
          <p style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #4a7b9d; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Reset Password</a>
          </p>
          <p style="color: #5a564f; font-size: 13px; line-height: 1.4;">
            This link is valid for 1 hour. If you did not make this request, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e6e2da; margin: 24px 0;" />
          <p style="color: #8c887f; font-size: 12px; word-break: break-all;">
            If the button doesn't work, copy and paste this URL into your browser:<br />
            <a href="${resetUrl}" style="color: #4a7b9d;">${resetUrl}</a>
          </p>
        </div>
      `,
    });

    res.status(200).json({
      message: 'If an account exists, a reset link has been sent to your email.',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Resets the user's password using the token sent via email.
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { token } = req.params;
    const { password } = req.body ?? {};

    if (!token || typeof password !== 'string') {
      res.status(400).json({ message: 'Token and new password are required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ message: 'Password must be at least 6 characters long' });
      return;
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ message: 'Invalid or expired password reset link' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.status(200).json({
      message: 'Password reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
}

