import { NextFunction, Request, Response } from 'express';
import { Bill } from '../models/Bill';
import { CategoryBudget } from '../models/CategoryBudget';
import { Goal } from '../models/Goal';
import { Income, PaySchedule } from '../models/Income';
import { PaycheckPlan } from '../models/PaycheckPlan';
import { requireUserId } from '../utils/controllerHelpers';
import {
  buildClampedUtcDateMs,
  clampDayToMonth,
  fromCents,
  resolveEffectiveDateForMonth,
  roundCurrency,
  sumCurrency,
  toCents,
} from '../utils/financeUtils';

const CADENCE_DIVISORS: Record<PaySchedule, number> = {
  weekly: 4,
  biweekly: 2,
  'twice-monthly': 2,
  monthly: 1,
  irregular: 1,
};

const DEFAULT_CATEGORIES = [
  { name: 'Groceries', amount: 200 },
  { name: 'Gas / Transportation', amount: 60 },
  { name: 'Kids & Family', amount: 75 },
  { name: 'Household Essentials', amount: 50 },
];

/**
 * Calculates smart suggested allocations for the user's active/upcoming paycheck.
 */
export async function getPaycheckPlanSuggestion(
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

    const [incomes, allBills, categoryBudgets, goals] = await Promise.all([
      Income.find({ userId }).sort({ nextPayDate: 1 }),
      Bill.find({ userId }).sort({ dueDate: 1, name: 1 }),
      CategoryBudget.find({ userId }).sort({ name: 1 }),
      Goal.find({ userId }),
    ]);

    const primaryIncome = incomes.length > 0 ? incomes[0] : null;
    const paycheckAmount = primaryIncome ? roundCurrency(primaryIncome.amount) : 0;
    const paySchedule: PaySchedule = primaryIncome ? primaryIncome.paySchedule : 'biweekly';
    const payDate = primaryIncome ? primaryIncome.nextPayDate : now;
    const cadenceDivisor = CADENCE_DIVISORS[paySchedule] ?? 2;

    const nextPayDateMs = payDate.getTime();

    // 1. Reserved upcoming & overdue bills before next payday
    const unpaidBills = allBills.filter((bill) => !bill.isPaid);
    const reservedBills = unpaidBills
      .map((bill) => {
        const effectiveDay = clampDayToMonth(bill.dueDate, year, month);
        const thisMonthCandidate = buildClampedUtcDateMs(year, month, effectiveDay);
        const isOverdue = thisMonthCandidate < todayStartMs;
        const dueMs = thisMonthCandidate;
        return {
          _id: bill._id,
          name: bill.name,
          amount: roundCurrency(bill.amount),
          category: bill.category,
          dueDate: bill.dueDate,
          isOverdue,
          dueMs,
        };
      })
      .filter((item) => item.isOverdue || item.dueMs <= nextPayDateMs)
      .sort((a, b) => a.dueMs - b.dueMs)
      .map((item) => ({
        _id: item._id,
        name: item.name,
        amount: item.amount,
        category: item.category,
        dueDate: item.dueDate,
        isOverdue: item.isOverdue,
      }));

    const reservedBillsTotal = sumCurrency(reservedBills.map((b) => b.amount));

    // 2. Category Allocations (scaled by cadence divisor)
    let categoryAllocations: Array<{ name: string; amount: number }> = [];

    if (categoryBudgets.length > 0) {
      categoryAllocations = categoryBudgets.map((cb) => {
        const target = cb.monthlyTarget || 0;
        const perPaycheck = roundCurrency(target / cadenceDivisor);
        return {
          name: cb.name,
          amount: perPaycheck,
        };
      });
    } else {
      categoryAllocations = DEFAULT_CATEGORIES.map((c) => ({
        name: c.name,
        amount: roundCurrency(c.amount),
      }));
    }

    const categoriesTotal = sumCurrency(categoryAllocations.map((c) => c.amount));

    // 3. Savings Allocation (scaled by cadence divisor)
    const monthlySavingsTarget = goals.reduce((sum, g) => {
      const contrib = typeof g.monthlyContribution === 'number' && g.monthlyContribution > 0
        ? g.monthlyContribution
        : (g.targetAmount && g.targetAmount > 0 ? g.targetAmount / 12 : 0);
      return sum + contrib;
    }, 0);

    const savingsAllocation = roundCurrency(monthlySavingsTarget / cadenceDivisor);

    // 4. Safe Buffer / Personal Spending & Unallocated
    const committedCents =
      toCents(reservedBillsTotal) + toCents(categoriesTotal) + toCents(savingsAllocation);
    const availableCents = toCents(paycheckAmount) - committedCents;

    const personalSpending = availableCents > 0 ? fromCents(availableCents) : 0;
    const remainingUnallocated = fromCents(
      toCents(paycheckAmount) - committedCents - toCents(personalSpending),
    );

    res.status(200).json({
      income: primaryIncome
        ? {
            _id: primaryIncome._id,
            sourceName: primaryIncome.sourceName,
            amount: primaryIncome.amount,
            paySchedule: primaryIncome.paySchedule,
            nextPayDate: primaryIncome.nextPayDate.toISOString(),
          }
        : null,
      paycheckAmount,
      payDate: payDate.toISOString(),
      paySchedule,
      reservedBills,
      reservedBillsTotal,
      categoryAllocations,
      savingsAllocation,
      personalSpending,
      remainingUnallocated,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Saves a finalized or adjusted paycheck plan to MongoDB.
 */
export async function createPaycheckPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const {
      incomeId,
      payDate,
      paycheckAmount,
      reservedBillsTotal,
      categoryAllocations,
      savingsAllocation,
      personalSpending,
      remainingUnallocated,
    } = req.body;

    if (paycheckAmount === undefined || Number(paycheckAmount) <= 0) {
      res.status(400).json({ message: 'Paycheck amount must be greater than $0' });
      return;
    }

    const sanitizedCategories = Array.isArray(categoryAllocations)
      ? categoryAllocations.map((item: { name?: unknown; amount?: unknown }) => ({
          name: String(item.name || '').trim() || 'Category',
          amount: Math.max(0, roundCurrency(Number(item.amount) || 0)),
        }))
      : [];

    const targetPayDate = payDate ? new Date(payDate) : new Date();
    const startOfDay = new Date(
      Date.UTC(targetPayDate.getUTCFullYear(), targetPayDate.getUTCMonth(), targetPayDate.getUTCDate()),
    );
    const endOfDay = new Date(
      Date.UTC(
        targetPayDate.getUTCFullYear(),
        targetPayDate.getUTCMonth(),
        targetPayDate.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    // If a plan already exists for this user and this calendar day, update it to prevent duplicates
    const existingPlan = await PaycheckPlan.findOne({
      userId,
      payDate: { $gte: startOfDay, $lte: endOfDay },
    });

    if (existingPlan) {
      existingPlan.incomeId = incomeId || existingPlan.incomeId;
      existingPlan.payDate = targetPayDate;
      existingPlan.paycheckAmount = roundCurrency(Number(paycheckAmount));
      existingPlan.reservedBillsTotal = Math.max(0, roundCurrency(Number(reservedBillsTotal) || 0));
      existingPlan.categoryAllocations = sanitizedCategories;
      existingPlan.savingsAllocation = Math.max(0, roundCurrency(Number(savingsAllocation) || 0));
      existingPlan.personalSpending = Math.max(0, roundCurrency(Number(personalSpending) || 0));
      existingPlan.remainingUnallocated = roundCurrency(Number(remainingUnallocated) || 0);

      await existingPlan.save();
      res.status(200).json(existingPlan);
      return;
    }

    const plan = await PaycheckPlan.create({
      userId,
      incomeId: incomeId || undefined,
      payDate: targetPayDate,
      paycheckAmount: roundCurrency(Number(paycheckAmount)),
      reservedBillsTotal: Math.max(0, roundCurrency(Number(reservedBillsTotal) || 0)),
      categoryAllocations: sanitizedCategories,
      savingsAllocation: Math.max(0, roundCurrency(Number(savingsAllocation) || 0)),
      personalSpending: Math.max(0, roundCurrency(Number(personalSpending) || 0)),
      remainingUnallocated: roundCurrency(Number(remainingUnallocated) || 0),
    });

    res.status(201).json(plan);
  } catch (error) {
    next(error);
  }
}

/**
 * Deletes a saved paycheck plan by ID.
 */
export async function deletePaycheckPlan(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { id } = req.params;
    const plan = await PaycheckPlan.findOneAndDelete({ _id: id, userId });
    if (!plan) {
      res.status(404).json({ message: 'Paycheck plan not found' });
      return;
    }

    res.status(200).json({ message: 'Paycheck plan deleted successfully', id });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves the user's saved paycheck plans, sorted most recent first.
 */
export async function getPaycheckPlans(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const plans = await PaycheckPlan.find({ userId }).sort({ createdAt: -1 }).limit(20);
    res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
}
