import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { Resend } from 'resend';
import { AccessKey } from '../models/AccessKey';

/**
 * Handles incoming webhooks from Stan Store (via Zapier) upon purchase.
 * Generates a unique, single-use activation token, stores it in MongoDB,
 * and emails the customer their personalized activation link via Resend.
 */
export async function handleStanStoreWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const webhookSecret =
      (req.headers['x-webhook-secret'] as string) ||
      (req.query.secret as string) ||
      (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '');

    const expectedSecret = process.env.STAN_WEBHOOK_SECRET;

    if (!expectedSecret || webhookSecret !== expectedSecret) {
      res.status(401).json({ message: 'Unauthorized: Invalid or missing webhook secret' });
      return;
    }

    const body = req.body || {};
    const rawEmail = body.email || body.customer_email || body['Customer Email'] || body.buyer_email || '';
    const rawName = body.name || body.customer_name || body['Customer Name'] || body.first_name || '';

    if (typeof rawEmail !== 'string' || !rawEmail.trim()) {
      res.status(400).json({ message: 'Customer email is required in webhook payload' });
      return;
    }

    const email = rawEmail.trim().toLowerCase();
    const customerName = typeof rawName === 'string' ? rawName.trim() : '';

    // Generate secure 32-byte hex activation token
    const token = crypto.randomBytes(32).toString('hex');

    // 30-day expiration window for activation
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const accessKey = await AccessKey.create({
      token,
      email,
      customerName: customerName || undefined,
      expiresAt,
      source: 'stan-store',
    });

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    const activationLink = `${frontendUrl}/register?token=${token}&email=${encodeURIComponent(email)}`;

    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: 'Welcome to MoneyFlow 360 — Activate Your Account',
          html: `
            <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #2F2D29; background-color: #FAF6EE; border-radius: 12px; border: 1px solid #E2D8C8;">
              <span style="display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #587D9F; background-color: #E8F0F7; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px;">MoneyFlow 360</span>
              <h1 style="color: #2F2D29; font-size: 24px; font-weight: 700; margin: 0 0 12px;">Welcome to MoneyFlow 360${customerName ? `, ${customerName}` : ''}!</h1>
              <p style="font-size: 15px; line-height: 1.5; color: #5E5950; margin: 0 0 16px;">
                Thank you for your Stan Store purchase. Your budget planner is ready to unlock.
              </p>
              <p style="font-size: 15px; line-height: 1.5; color: #5E5950; margin: 0 0 24px;">
                Click the button below to create your password and activate your account:
              </p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${activationLink}" style="display: inline-block; background-color: #6C92B5; color: #FFFDF8; font-size: 15px; font-weight: 600; text-decoration: none; padding: 13px 28px; border-radius: 8px;">
                  Activate My Account →
                </a>
              </div>
              <p style="font-size: 13px; line-height: 1.4; color: #847E73; margin: 24px 0 0;">
                Or copy and paste this link into your browser:<br />
                <a href="${activationLink}" style="color: #587D9F; word-break: break-all;">${activationLink}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #E2D8C8; margin: 24px 0 16px;" />
              <p style="font-size: 12px; color: #847E73; margin: 0;">
                MoneyFlow 360 By Leah Blue • Every paycheck accounted for. Every dollar with a purpose.
              </p>
            </div>
          `,
        });
      } catch (emailErr) {
        console.error('Error sending Stan Store activation email via Resend:', emailErr);
      }
    }

    res.status(201).json({
      success: true,
      message: 'Activation link generated and sent to customer',
      token: accessKey.token,
      email: accessKey.email,
      activationLink,
    });
  } catch (error) {
    next(error);
  }
}
