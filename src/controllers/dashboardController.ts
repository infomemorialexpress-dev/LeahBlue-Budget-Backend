import { NextFunction, Request, Response } from 'express';
import { Bill, IBill } from '../models/Bill';
import { Expense } from '../models/Expense';
import { Goal } from '../models/Goal';
import { IIncome, Income, PaySchedule } from '../models/Income';
import { requireUserId } from '../utils/controllerHelpers';
import {
  buildClampedUtcDateMs,
  calculatePercentage,
  fromCents,
  getUtcWeekBounds,
  roundCurrency,
  sumCurrency,
  toCents,
} from '../utils/financeUtils';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MONTHLY_INCOME_MULTIPLIERS: Record<PaySchedule, number> = {
  weekly: 52 / 12,
  biweekly: 26 / 12,
  'twice-monthly': 2,
  monthly: 1,
};

/**
 * Counts how many paychecks from an income source occur within `[rangeStartMs, rangeEndMs]` (inclusive).
 */
function countPaychecksInRange(
  income: IIncome,
  rangeStartMs: number,
  rangeEndMs: number,
): number {
  const anchor = income.nextPayDate;
  const anchorDay = anchor.getUTCDate();

  if (income.paySchedule === 'weekly' || income.paySchedule === 'biweekly') {
    const stepMs = (income.paySchedule === 'weekly' ? 7 : 14) * MS_PER_DAY;
    let cursorMs = Date.UTC(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth(),
      anchor.getUTCDate(),
    );

    if (cursorMs < rangeStartMs) {
      cursorMs += Math.ceil((rangeStartMs - cursorMs) / stepMs) * stepMs;
    } else if (cursorMs > rangeStartMs) {
      cursorMs -= Math.floor((cursorMs - rangeStartMs) / stepMs) * stepMs;
    }

    let count = 0;
    while (cursorMs <= rangeEndMs) {
      if (cursorMs >= rangeStartMs) count += 1;
      cursorMs += stepMs;
    }
    return count;
  }

  const startDate = new Date(rangeStartMs);
  const endDate = new Date(rangeEndMs);
  const startMonthIndex = startDate.getUTCFullYear() * 12 + startDate.getUTCMonth();
  const endMonthIndex = endDate.getUTCFullYear() * 12 + endDate.getUTCMonth();

  let count = 0;
  for (let mIdx = startMonthIndex; mIdx <= endMonthIndex; mIdx += 1) {
    const y = Math.floor(mIdx / 12);
    const m = mIdx % 12;

    if (income.paySchedule === 'monthly') {
      const payMs = buildClampedUtcDateMs(y, m, anchorDay);
      if (payMs >= rangeStartMs && payMs <= rangeEndMs) count += 1;
    } else {
      const firstDay = anchorDay <= 15 ? anchorDay : anchorDay - 15;
      const secondDay = firstDay + 15;
      const firstMs = buildClampedUtcDateMs(y, m, firstDay);
      const secondMs = buildClampedUtcDateMs(y, m, secondDay);
      if (firstMs >= rangeStartMs && firstMs <= rangeEndMs) count += 1;
      if (secondMs >= rangeStartMs && secondMs <= rangeEndMs) count += 1;
    }
  }

  return count;
}

/**
 * Resolves the next upcoming paycheck UTC date (>= todayStartMs) for an income source.
 */
function resolveNextPayDateMs(income: IIncome, todayStartMs: number): number {
  const anchor = income.nextPayDate;
  const anchorMs = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate(),
  );

  if (anchorMs >= todayStartMs) {
    return anchorMs;
  }

  if (income.paySchedule === 'weekly' || income.paySchedule === 'biweekly') {
    const stepMs = (income.paySchedule === 'weekly' ? 7 : 14) * MS_PER_DAY;
    const stepsForward = Math.ceil((todayStartMs - anchorMs) / stepMs);
    return anchorMs + stepsForward * stepMs;
  }

  const today = new Date(todayStartMs);
  const y = today.getUTCFullYear();
  let m = today.getUTCMonth();
  const anchorDay = anchor.getUTCDate();

  if (income.paySchedule === 'twice-monthly') {
    const firstDay = anchorDay <= 15 ? anchorDay : anchorDay - 15;
    const secondDay = firstDay + 15;

    for (let offset = 0; offset < 3; offset += 1) {
      const firstCandidate = buildClampedUtcDateMs(y, m + offset, firstDay);
      if (firstCandidate >= todayStartMs) return firstCandidate;

      const secondCandidate = buildClampedUtcDateMs(y, m + offset, secondDay);
      if (secondCandidate >= todayStartMs) return secondCandidate;
    }
  }

  while (true) {
    const candidate = buildClampedUtcDateMs(y, m, anchorDay);
    if (candidate >= todayStartMs) return candidate;
    m += 1;
  }
}

/**
 * Resolves the next occurrence (>= todayStartMs) of a monthly bill due day (1-31),
 * falling back to the last valid day of shorter months (e.g. 31st -> 30th or 28th/29th).
 */
function resolveNextBillDueDateMs(
  dueDay: number,
  todayYear: number,
  todayMonth: number,
  todayStartMs: number,
): number {
  const thisMonthCandidate = buildClampedUtcDateMs(todayYear, todayMonth, dueDay);
  if (thisMonthCandidate >= todayStartMs) {
    return thisMonthCandidate;
  }

  return buildClampedUtcDateMs(todayYear, todayMonth + 1, dueDay);
}

function serializeUpcomingBill(bill: IBill, dueMs: number) {
  return {
    _id: bill._id,
    name: bill.name,
    amount: roundCurrency(bill.amount),
    dueDate: bill.dueDate,
    frequency: bill.frequency,
    category: bill.category,
    isPaid: bill.isPaid,
    nextDueDate: new Date(dueMs).toISOString(),
  };
}

/**
 * Estimates monthly income using the same cadence multipliers as the Budget Planner:
 * weekly * 52/12, biweekly * 26/12, twice-monthly * 2, monthly * 1.
 */
function calculateEstimatedMonthlyIncome(incomes: IIncome[]): number {
  const totalCents = incomes.reduce((sumCents, income) => {
    const multiplier = MONTHLY_INCOME_MULTIPLIERS[income.paySchedule] ?? 1;
    return sumCents + Math.round(toCents(income.amount) * multiplier);
  }, 0);

  return fromCents(totalCents);
}

/**
 * Filters unpaid bills whose month-end-adjusted due date falls before the user's earliest next pay date.
 */
function computeUpcomingBills(
  incomes: IIncome[],
  unpaidBills: IBill[],
  year: number,
  month: number,
  todayStartMs: number,
) {
  const earliestNextPayDateMs =
    incomes.length > 0
      ? Math.min(...incomes.map((inc) => resolveNextPayDateMs(inc, todayStartMs)))
      : null;

  const upcomingBills =
    earliestNextPayDateMs === null
      ? []
      : unpaidBills
          .map((bill) => ({
            bill,
            dueMs: resolveNextBillDueDateMs(bill.dueDate, year, month, todayStartMs),
          }))
          .filter(({ dueMs }) => dueMs < earliestNextPayDateMs)
          .sort((a, b) => a.dueMs - b.dueMs)
          .map(({ bill, dueMs }) => serializeUpcomingBill(bill, dueMs));

  const upcomingBillsTotal = sumCurrency(upcomingBills.map((bill) => bill.amount));

  return { earliestNextPayDateMs, upcomingBills, upcomingBillsTotal };
}

function calculateRemainingBudget(
  currentMonthIncome: number,
  currentMonthExpenses: number,
  upcomingUnpaidBillsTotal: number,
  totalSavingsContributions: number,
): number {
  return fromCents(
    toCents(currentMonthIncome) -
      toCents(currentMonthExpenses) -
      toCents(upcomingUnpaidBillsTotal) -
      toCents(totalSavingsContributions),
  );
}

/**
 * Computes current-month income, expenses, upcoming bills, savings contributions,
 * remaining budget, and category breakdown for the authenticated user.
 */
export async function getDashboardSummary(
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
    const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const [incomes, expenses, unpaidBills, goals] = await Promise.all([
      Income.find({ userId }),
      Expense.find({
        userId,
        date: { $gte: monthStart, $lte: monthEnd },
      }),
      Bill.find({ userId, isPaid: false }).sort({ dueDate: 1, name: 1 }),
      Goal.find({ userId }),
    ]);

    const currentMonthIncome = calculateEstimatedMonthlyIncome(incomes);

    const categoryMap = new Map<string, { totalCents: number; count: number }>();
    let totalExpensesCents = 0;

    for (const expense of expenses) {
      const expenseCents = toCents(expense.amount);
      totalExpensesCents += expenseCents;
      const categoryName = expense.category.trim() || 'Uncategorized';
      const existing = categoryMap.get(categoryName);
      if (existing) {
        existing.totalCents += expenseCents;
        existing.count += 1;
      } else {
        categoryMap.set(categoryName, { totalCents: expenseCents, count: 1 });
      }
    }

    const currentMonthExpenses = fromCents(totalExpensesCents);

    const expensesByCategory = Array.from(categoryMap.entries())
      .map(([category, stats]) => ({
        category,
        total: fromCents(stats.totalCents),
        count: stats.count,
      }))
      .sort((a, b) => b.total - a.total);

    const { earliestNextPayDateMs, upcomingBills, upcomingBillsTotal } =
      computeUpcomingBills(incomes, unpaidBills, year, month, todayStartMs);

    const totalSavingsContributions = sumCurrency(goals.map((goal) => goal.savedAmount));
    const remainingBudget = calculateRemainingBudget(
      currentMonthIncome,
      currentMonthExpenses,
      upcomingBillsTotal,
      totalSavingsContributions,
    );

    const monthLabel = `${year}-${String(month + 1).padStart(2, '0')}`;

    res.status(200).json({
      month: monthLabel,
      currentMonthIncome,
      currentMonthExpenses,
      upcomingBillsTotal,
      totalSavingsContributions,
      remainingBudget,
      expensesByCategory,
      nextPayDate:
        earliestNextPayDateMs !== null
          ? new Date(earliestNextPayDateMs).toISOString()
          : null,
      upcomingBills,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Computes the Weekly Check-in snapshot: income received this week, bills due in the
 * next 7 days, spending this week, monthly remaining budget, and overall goals progress.
 */
export async function getWeeklyCheckIn(
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
    const { weekStartMs, weekEndMs, todayStartMs, todayEndMs } = getUtcWeekBounds(now);
    const next7DaysEndMs = todayStartMs + 7 * MS_PER_DAY - 1;

    const monthStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const queryStart = new Date(Math.min(monthStart.getTime(), weekStartMs));
    const queryEnd = new Date(Math.max(monthEnd.getTime(), weekEndMs));

    const [incomes, expenses, unpaidBills, goals] = await Promise.all([
      Income.find({ userId }),
      Expense.find({
        userId,
        date: { $gte: queryStart, $lte: queryEnd },
      }),
      Bill.find({ userId, isPaid: false }).sort({ dueDate: 1, name: 1 }),
      Goal.find({ userId }),
    ]);

    const incomeReceivedCents = incomes.reduce((sumCents, income) => {
      const count = countPaychecksInRange(income, weekStartMs, todayEndMs);
      return sumCents + toCents(income.amount) * count;
    }, 0);
    const incomeReceivedThisWeek = fromCents(incomeReceivedCents);

    const billsDueNext7Days = unpaidBills
      .map((bill) => ({
        bill,
        dueMs: resolveNextBillDueDateMs(bill.dueDate, year, month, todayStartMs),
      }))
      .filter(({ dueMs }) => dueMs >= todayStartMs && dueMs <= next7DaysEndMs)
      .sort((a, b) => a.dueMs - b.dueMs)
      .map(({ bill, dueMs }) => serializeUpcomingBill(bill, dueMs));

    const spendingThisWeekCents = expenses.reduce((sumCents, expense) => {
      const ts = expense.date.getTime();
      return ts >= weekStartMs && ts <= weekEndMs ? sumCents + toCents(expense.amount) : sumCents;
    }, 0);
    const spendingThisWeek = fromCents(spendingThisWeekCents);

    const currentMonthIncome = calculateEstimatedMonthlyIncome(incomes);
    const monthStartMs = monthStart.getTime();
    const monthEndMs = monthEnd.getTime();
    const currentMonthExpensesCents = expenses.reduce((sumCents, expense) => {
      const ts = expense.date.getTime();
      return ts >= monthStartMs && ts <= monthEndMs
        ? sumCents + toCents(expense.amount)
        : sumCents;
    }, 0);

    const { upcomingBillsTotal } = computeUpcomingBills(
      incomes,
      unpaidBills,
      year,
      month,
      todayStartMs,
    );

    const totalSaved = sumCurrency(goals.map((g) => g.savedAmount));
    const totalTarget = sumCurrency(goals.map((g) => g.targetAmount));
    const completedGoalsCount = goals.filter(
      (g) => toCents(g.targetAmount) > 0 && toCents(g.savedAmount) >= toCents(g.targetAmount),
    ).length;

    const remainingBudget = calculateRemainingBudget(
      currentMonthIncome,
      fromCents(currentMonthExpensesCents),
      upcomingBillsTotal,
      totalSaved,
    );

    res.status(200).json({
      weekStart: new Date(weekStartMs).toISOString(),
      weekEnd: new Date(weekEndMs).toISOString(),
      incomeReceivedThisWeek,
      billsDueNext7Days,
      billsDueNext7DaysTotal: sumCurrency(billsDueNext7Days.map((b) => b.amount)),
      spendingThisWeek,
      remainingBudget,
      savingsProgress: {
        totalSaved,
        totalTarget,
        percentage: calculatePercentage(totalSaved, totalTarget),
        goalsCount: goals.length,
        completedGoalsCount,
      },
    });
  } catch (error) {
    next(error);
  }
}
