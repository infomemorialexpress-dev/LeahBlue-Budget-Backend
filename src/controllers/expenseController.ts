import { NextFunction, Request, Response } from 'express';
import { Expense } from '../models/Expense';
import {
  handleValidationError,
  pickDefinedFields,
  requireUserId,
  requireValidId,
} from '../utils/controllerHelpers';

const EXPENSE_FIELDS = ['description', 'amount', 'category', 'date', 'note'] as const;

/**
 * Lists all expense records belonging to the authenticated user.
 */
export async function getExpenses(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const expenses = await Expense.find({ userId }).sort({ date: -1 });
    res.status(200).json(expenses);
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves a single expense record owned by the authenticated user.
 */
export async function getExpenseById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const expense = await Expense.findOne({ _id: id, userId });
    if (!expense) {
      res.status(404).json({ message: 'Expense record not found' });
      return;
    }

    res.status(200).json(expense);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates a new expense record for the authenticated user.
 */
export async function createExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const payload = pickDefinedFields(req.body, EXPENSE_FIELDS);
    const expense = await Expense.create({ ...payload, userId });

    res.status(201).json(expense);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Updates an expense record owned by the authenticated user.
 */
export async function updateExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const updates = pickDefinedFields(req.body, EXPENSE_FIELDS);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ message: 'No valid fields provided for update' });
      return;
    }

    const expense = await Expense.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!expense) {
      res.status(404).json({ message: 'Expense record not found' });
      return;
    }

    res.status(200).json(expense);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Deletes an expense record owned by the authenticated user.
 */
export async function deleteExpense(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const expense = await Expense.findOneAndDelete({ _id: id, userId });
    if (!expense) {
      res.status(404).json({ message: 'Expense record not found' });
      return;
    }

    res.status(200).json({ message: 'Expense record deleted successfully' });
  } catch (error) {
    next(error);
  }
}

