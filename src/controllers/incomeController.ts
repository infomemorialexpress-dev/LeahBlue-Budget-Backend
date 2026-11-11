import { NextFunction, Request, Response } from 'express';
import { Income } from '../models/Income';
import {
  handleValidationError,
  pickDefinedFields,
  requireUserId,
  requireValidId,
} from '../utils/controllerHelpers';
import {
  parseAndClampUtcDate,
  resolveEffectiveDateForMonth,
  roundCurrency,
} from '../utils/financeUtils';

const INCOME_FIELDS = ['sourceName', 'amount', 'paySchedule', 'nextPayDate'] as const;

function normalizeIncomePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };

  if (normalized.amount !== undefined) {
    const num = Number(normalized.amount);
    if (Number.isFinite(num)) {
      normalized.amount = roundCurrency(num);
    }
  }

  if (normalized.nextPayDate !== undefined) {
    const clampedDate = parseAndClampUtcDate(normalized.nextPayDate);
    if (clampedDate) {
      normalized.nextPayDate = clampedDate;
    }
  }

  return normalized;
}

/**
 * Lists all income records belonging to the authenticated user, including the
 * month-end-clamped `effectivePayDate` for the current month.
 */
export async function getIncomes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();

    const incomes = await Income.find({ userId }).sort({ nextPayDate: 1 });
    const payload = incomes.map((income) => {
      const effectivePayDate = resolveEffectiveDateForMonth(
        income.nextPayDate.getUTCDate(),
        year,
        month,
      );
      return {
        ...income.toObject(),
        effectivePayDate: effectivePayDate.toISOString(),
      };
    });

    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves a single income record owned by the authenticated user.
 */
export async function getIncomeById(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const income = await Income.findOne({ _id: id, userId });
    if (!income) {
      res.status(404).json({ message: 'Income record not found' });
      return;
    }

    res.status(200).json(income);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates a new income record for the authenticated user, clamping month-end dates
 * (e.g. 31st in a 30-day or 28-day month) to the last valid day of the month.
 */
export async function createIncome(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const payload = normalizeIncomePayload(pickDefinedFields(req.body, INCOME_FIELDS));
    const income = await Income.create({ ...payload, userId });

    res.status(201).json(income);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Updates an income record owned by the authenticated user.
 */
export async function updateIncome(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const rawUpdates = pickDefinedFields(req.body, INCOME_FIELDS);
    if (Object.keys(rawUpdates).length === 0) {
      res.status(400).json({ message: 'No valid fields provided for update' });
      return;
    }

    const updates = normalizeIncomePayload(rawUpdates);

    const income = await Income.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!income) {
      res.status(404).json({ message: 'Income record not found' });
      return;
    }

    res.status(200).json(income);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Deletes an income record owned by the authenticated user.
 */
export async function deleteIncome(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const income = await Income.findOneAndDelete({ _id: id, userId });
    if (!income) {
      res.status(404).json({ message: 'Income record not found' });
      return;
    }

    res.status(200).json({ message: 'Income record deleted successfully' });
  } catch (error) {
    next(error);
  }
}
