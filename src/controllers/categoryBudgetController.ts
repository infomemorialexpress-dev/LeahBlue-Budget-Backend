import { NextFunction, Request, Response } from 'express';
import { CategoryBudget } from '../models/CategoryBudget';
import {
  handleValidationError,
  pickDefinedFields,
  requireUserId,
  requireValidId,
} from '../utils/controllerHelpers';

function roundCurrency(value: number): number {
  return Math.round(Number(value || 0) * 100) / 100;
}

function parsePayload(body: Record<string, unknown>) {
  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : typeof body.category === 'string' && body.category.trim()
        ? body.category.trim()
        : '';

  const rawTarget =
    body.monthlyTarget !== undefined ? body.monthlyTarget : body.targetAmount;
  const monthlyTarget =
    rawTarget !== undefined && Number.isFinite(Number(rawTarget))
      ? Math.max(0, roundCurrency(Number(rawTarget)))
      : 0;

  return { name, monthlyTarget };
}

/**
 * Lists all category budgets for the authenticated user.
 */
export async function getCategoryBudgets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const budgets = await CategoryBudget.find({ userId }).sort({ createdAt: 1 });
    res.status(200).json(budgets);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates a new category budget for the authenticated user.
 */
export async function createCategoryBudget(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { name, monthlyTarget } = parsePayload(req.body ?? {});
    if (!name) {
      res.status(400).json({ message: 'Category budget name is required' });
      return;
    }

    const budget = await CategoryBudget.create({
      userId,
      name,
      monthlyTarget,
    });

    res.status(201).json(budget);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Updates an existing category budget by ID.
 */
export async function updateCategoryBudget(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const { name, monthlyTarget } = parsePayload(req.body ?? {});
    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (req.body?.monthlyTarget !== undefined || req.body?.targetAmount !== undefined) {
      updates.monthlyTarget = monthlyTarget;
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: 'No valid fields provided for update' });
      return;
    }

    const budget = await CategoryBudget.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!budget) {
      res.status(404).json({ message: 'Category budget not found' });
      return;
    }

    res.status(200).json(budget);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Deletes a category budget by ID.
 */
export async function deleteCategoryBudget(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const budget = await CategoryBudget.findOneAndDelete({ _id: id, userId });
    if (!budget) {
      res.status(404).json({ message: 'Category budget not found' });
      return;
    }

    res.status(200).json({ message: 'Category budget deleted successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Bulk syncs the entire list of category budgets for the authenticated user.
 * Replaces existing items with the provided array atomically/cleanly.
 */
export async function syncCategoryBudgets(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const rawBudgets = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.budgets)
        ? req.body.budgets
        : null;

    if (!rawBudgets) {
      res.status(400).json({ message: 'budgets must be an array' });
      return;
    }

    const cleaned = (rawBudgets as Record<string, unknown>[])
      .map((item: Record<string, unknown>) => parsePayload(item))
      .filter((item: { name: string; monthlyTarget: number }) => Boolean(item.name))
      .map((item: { name: string; monthlyTarget: number }) => ({ ...item, userId }));

    await CategoryBudget.deleteMany({ userId });
    const inserted = cleaned.length > 0 ? await CategoryBudget.insertMany(cleaned) : [];

    res.status(200).json(inserted);
  } catch (error) {
    next(error);
  }
}
