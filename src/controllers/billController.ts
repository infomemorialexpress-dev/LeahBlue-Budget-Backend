import { NextFunction, Request, Response } from 'express';
import { Bill } from '../models/Bill';
import {
  handleValidationError,
  pickDefinedFields,
  requireUserId,
  requireValidId,
} from '../utils/controllerHelpers';
import {
  clampDayToMonth,
  resolveEffectiveDateForMonth,
  roundCurrency,
} from '../utils/financeUtils';

const BILL_FIELDS = ['name', 'amount', 'dueDate', 'frequency', 'category', 'isPaid'] as const;

function normalizeBillPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };
  if (normalized.amount !== undefined) {
    const num = Number(normalized.amount);
    if (Number.isFinite(num)) {
      normalized.amount = roundCurrency(num);
    }
  }
  return normalized;
}

/**
 * Lists all bills belonging to the authenticated user, including `effectiveDueDay` and
 * `effectiveDueDate` clamped to the last valid day of the current month.
 */
export async function getBills(
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

    const bills = await Bill.find({ userId }).sort({ dueDate: 1, name: 1 });
    const payload = bills.map((bill) => {
      const effectiveDueDay = clampDayToMonth(bill.dueDate, year, month);
      const effectiveDueDate = resolveEffectiveDateForMonth(bill.dueDate, year, month);
      return {
        ...bill.toObject(),
        effectiveDueDay,
        effectiveDueDate: effectiveDueDate.toISOString(),
      };
    });

    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

/**
 * Creates a new bill for the authenticated user.
 */
export async function createBill(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const payload = normalizeBillPayload(pickDefinedFields(req.body, BILL_FIELDS));
    const bill = await Bill.create({ ...payload, userId });

    res.status(201).json(bill);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Updates a bill owned by the authenticated user.
 */
export async function updateBill(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const rawUpdates = pickDefinedFields(req.body, BILL_FIELDS);
    if (Object.keys(rawUpdates).length === 0) {
      res.status(400).json({ message: 'No valid fields provided for update' });
      return;
    }

    const updates = normalizeBillPayload(rawUpdates);

    const bill = await Bill.findOneAndUpdate(
      { _id: id, userId },
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!bill) {
      res.status(404).json({ message: 'Bill not found' });
      return;
    }

    res.status(200).json(bill);
  } catch (error) {
    if (handleValidationError(error, res)) return;
    next(error);
  }
}

/**
 * Deletes a bill owned by the authenticated user.
 */
export async function deleteBill(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const bill = await Bill.findOneAndDelete({ _id: id, userId });
    if (!bill) {
      res.status(404).json({ message: 'Bill not found' });
      return;
    }

    res.status(200).json({ message: 'Bill deleted successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Marks a bill owned by the authenticated user as paid (or toggles if `isPaid` is provided).
 */
export async function markBillAsPaid(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const id = requireValidId(req.params.id, res);
    if (!id) return;

    const isPaid = typeof req.body?.isPaid === 'boolean' ? req.body.isPaid : true;

    const bill = await Bill.findOneAndUpdate(
      { _id: id, userId },
      { $set: { isPaid } },
      { new: true, runValidators: true },
    );

    if (!bill) {
      res.status(404).json({ message: 'Bill not found' });
      return;
    }

    res.status(200).json(bill);
  } catch (error) {
    next(error);
  }
}
