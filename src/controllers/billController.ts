import { NextFunction, Request, Response } from 'express';
import { Bill, BillFrequency } from '../models/Bill';
import { Expense } from '../models/Expense';
import {
  handleValidationError,
  pickDefinedFields,
  requireUserId,
  requireValidId,
} from '../utils/controllerHelpers';
import {
  buildClampedUtcDate,
  clampDayToMonth,
  resolveEffectiveDateForMonth,
  roundCurrency,
} from '../utils/financeUtils';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeNextBillingCycle(
  dueDay: number,
  frequency: BillFrequency,
  now: Date = new Date(),
): { nextDueDay: number; nextDueDate: Date } {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const todayStartMs = Date.UTC(currentYear, currentMonth, now.getUTCDate());

  if (frequency === 'monthly') {
    let nextYear = currentYear;
    let nextMonth = currentMonth + 1;
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    const nextDueDay = clampDayToMonth(dueDay, nextYear, nextMonth);
    const nextDueDate = buildClampedUtcDate(nextYear, nextMonth, nextDueDay);
    return { nextDueDay, nextDueDate };
  }

  if (frequency === 'weekly' || frequency === 'biweekly') {
    const stepMs = (frequency === 'weekly' ? 7 : 14) * MS_PER_DAY;
    const currentEffectiveDay = clampDayToMonth(dueDay, currentYear, currentMonth);
    const currentCycleDate = buildClampedUtcDate(currentYear, currentMonth, currentEffectiveDay);
    let nextDateMs = currentCycleDate.getTime() + stepMs;
    while (nextDateMs <= todayStartMs) {
      nextDateMs += stepMs;
    }
    const nextDate = new Date(nextDateMs);
    const nextDueDay = nextDate.getUTCDate();
    return { nextDueDay, nextDueDate: nextDate };
  }

  if (frequency === 'yearly') {
    const nextYear = currentYear + 1;
    const nextDueDay = clampDayToMonth(dueDay, nextYear, currentMonth);
    const nextDueDate = buildClampedUtcDate(nextYear, currentMonth, nextDueDay);
    return { nextDueDay, nextDueDate };
  }

  const clamped = clampDayToMonth(dueDay, currentYear, currentMonth);
  return { nextDueDay: clamped, nextDueDate: buildClampedUtcDate(currentYear, currentMonth, clamped) };
}

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
    const todayStartMs = Date.UTC(year, month, now.getUTCDate());

    const bills = await Bill.find({ userId }).sort({ dueDate: 1, name: 1 });
    const payload = bills.map((bill) => {
      const effectiveDueDay = clampDayToMonth(bill.dueDate, year, month);
      const effectiveDueDate = resolveEffectiveDateForMonth(bill.dueDate, year, month);
      const isOverdue = !bill.isPaid && effectiveDueDate.getTime() < todayStartMs;
      return {
        ...bill.toObject(),
        effectiveDueDay,
        effectiveDueDate: effectiveDueDate.toISOString(),
        isOverdue,
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

    // Unlink any existing expenses created from this bill so historical expense records are preserved
    await Expense.updateMany({ billId: id, userId }, { $set: { billId: null } });

    res.status(200).json({ message: 'Bill deleted successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Marks a bill owned by the authenticated user as paid or unpaid.
 * When marking as paid:
 *  1. Automatically creates a linked Expense document.
 *  2. Logs payment into bill.paymentHistory and updates lastPaidDate.
 *  3. For recurring bills, advances bill.dueDate to the next billing cycle and resets isPaid to false.
 *  4. For one-time bills, sets isPaid to true.
 * When unmarking as unpaid / undoing:
 *  - Deletes the linked Expense and updates payment history.
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

    const bill = await Bill.findOne({ _id: id, userId });
    if (!bill) {
      res.status(404).json({ message: 'Bill not found' });
      return;
    }

    const isMarkingPaid = typeof req.body?.isPaid === 'boolean' ? req.body.isPaid : true;
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const todayStartMs = Date.UTC(year, month, now.getUTCDate());

    if (isMarkingPaid) {
      // 1. Create linked Expense
      const expense = await Expense.create({
        userId,
        billId: bill._id,
        amount: bill.amount,
        category: bill.category || 'Bills',
        description: bill.name,
        date: now,
      });

      // 2. Record payment history and lastPaidDate
      bill.lastPaidDate = now;
      if (!bill.paymentHistory) {
        bill.paymentHistory = [];
      }
      bill.paymentHistory.push({
        paidAt: now,
        amount: bill.amount,
        expenseId: expense._id,
      });

      let rolledForward = false;
      let nextDueDate: Date | null = null;

      // 3. Recurring roll-forward vs one-time
      if (bill.frequency !== 'one-time') {
        const { nextDueDay, nextDueDate: computedNextDate } = computeNextBillingCycle(
          bill.dueDate,
          bill.frequency,
          now,
        );
        bill.dueDate = nextDueDay;
        bill.isPaid = false; // Reset for next cycle
        nextDueDate = computedNextDate;
        rolledForward = true;
      } else {
        bill.isPaid = true;
      }

      await bill.save();

      const effectiveDueDay = clampDayToMonth(bill.dueDate, year, month);
      const effectiveDueDate =
        nextDueDate || resolveEffectiveDateForMonth(bill.dueDate, year, month);

      res.status(200).json({
        ...bill.toObject(),
        effectiveDueDay,
        effectiveDueDate: effectiveDueDate.toISOString(),
        isOverdue: false,
        rolledForward,
        nextDueDate: nextDueDate ? nextDueDate.toISOString() : effectiveDueDate.toISOString(),
        message: rolledForward
          ? `Bill paid, recorded in Expenses, and rolled forward to next due date.`
          : 'Bill marked as paid and recorded in Expenses.',
      });
      return;
    } else {
      // Unmarking as paid / undoing payment
      if (bill.frequency === 'one-time') {
        bill.isPaid = false;
        // Delete linked Expense
        await Expense.deleteMany({ billId: bill._id, userId });
        if (bill.paymentHistory && bill.paymentHistory.length > 0) {
          bill.paymentHistory.pop();
          bill.lastPaidDate =
            bill.paymentHistory.length > 0
              ? bill.paymentHistory[bill.paymentHistory.length - 1].paidAt
              : undefined;
        }
      } else {
        // Recurring: undo the most recent payment
        if (bill.paymentHistory && bill.paymentHistory.length > 0) {
          const lastPayment = bill.paymentHistory.pop();
          if (lastPayment?.expenseId) {
            await Expense.deleteOne({ _id: lastPayment.expenseId, userId });
          }
          bill.lastPaidDate =
            bill.paymentHistory.length > 0
              ? bill.paymentHistory[bill.paymentHistory.length - 1].paidAt
              : undefined;
        }
      }

      await bill.save();

      const effectiveDueDay = clampDayToMonth(bill.dueDate, year, month);
      const effectiveDueDate = resolveEffectiveDateForMonth(bill.dueDate, year, month);
      const isOverdue = !bill.isPaid && effectiveDueDate.getTime() < todayStartMs;

      res.status(200).json({
        ...bill.toObject(),
        effectiveDueDay,
        effectiveDueDate: effectiveDueDate.toISOString(),
        isOverdue,
        message: 'Bill payment undone and expense removed.',
      });
      return;
    }
  } catch (error) {
    next(error);
  }
}
