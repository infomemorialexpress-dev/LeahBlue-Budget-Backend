import { Request, Response } from 'express';
import mongoose from 'mongoose';

/**
 * Extracts the authenticated user's ID from the request or sends a 401 response.
 */
export function requireUserId(req: Request, res: Response): string | null {
  if (!req.user?.id) {
    res.status(401).json({ message: 'Unauthorized' });
    return null;
  }

  return req.user.id;
}

/**
 * Validates a route `:id` parameter as a MongoDB ObjectId, sending 400 if invalid.
 */
export function requireValidId(id: string | string[] | undefined, res: Response): string | null {
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid record ID' });
    return null;
  }

  return id;
}

/**
 * Handles Mongoose validation errors with a 400 response, returning true if handled.
 */
export function handleValidationError(error: unknown, res: Response): boolean {
  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: error.message });
    return true;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: `Invalid value for ${error.path}` });
    return true;
  }

  return false;
}

/**
 * Picks only defined properties from a request body object using an allowlist of keys.
 */
export function pickDefinedFields<T extends string>(
  source: Record<string, unknown> | undefined,
  allowedKeys: readonly T[],
): Partial<Record<T, unknown>> {
  const result: Partial<Record<T, unknown>> = {};
  if (!source || typeof source !== 'object') {
    return result;
  }

  for (const key of allowedKeys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result;
}
