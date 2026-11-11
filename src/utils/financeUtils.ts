const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Converts a dollar amount to integer cents using half-up rounding to avoid
 * IEEE-754 floating-point drift.
 */
export function toCents(amount: number): number {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Math.sign(numeric) * Number.EPSILON) * 100);
}

/**
 * Converts integer cents back to a 2-decimal dollar number.
 */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Rounds a dollar value precisely to 2 decimal places.
 */
export function roundCurrency(amount: number): number {
  return fromCents(toCents(amount));
}

/**
 * Precisely sums an array of dollar amounts in integer cents.
 */
export function sumCurrency(amounts: readonly number[]): number {
  const totalCents = amounts.reduce((sum, value) => sum + toCents(value), 0);
  return fromCents(totalCents);
}

/**
 * Precisely subtracts `b` from `a` in integer cents.
 */
export function subtractCurrency(a: number, b: number): number {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Calculates a 0-100 percentage rounded to 2 decimal places using integer-cent ratios.
 */
export function calculatePercentage(part: number, total: number): number {
  const totalCents = toCents(total);
  if (totalCents <= 0) return 0;
  const partCents = Math.max(0, toCents(part));
  const rawPercent = (partCents / totalCents) * 100;
  return Math.min(100, Math.round((rawPercent + Number.EPSILON) * 100) / 100);
}

/**
 * Returns the number of days in a given UTC year and 0-indexed month.
 */
export function getDaysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Clamps a day-of-month (1-31) to the last valid day of the specified UTC month.
 */
export function clampDayToMonth(day: number, year: number, month: number): number {
  const maxDay = getDaysInUtcMonth(year, month);
  return Math.min(Math.max(1, Math.trunc(day)), maxDay);
}

/**
 * Builds a UTC midnight Date/epoch ms for (year, month, day), falling back to the
 * last valid day of that month if `day` exceeds the month's length (e.g. 31st in Feb/Apr).
 */
export function buildClampedUtcDateMs(year: number, month: number, day: number): number {
  return Date.UTC(year, month, clampDayToMonth(day, year, month));
}

export function buildClampedUtcDate(year: number, month: number, day: number): Date {
  return new Date(buildClampedUtcDateMs(year, month, day));
}

/**
 * Parses a date input (`YYYY-MM-DD`, ISO string, or Date) into a UTC midnight Date,
 * clamping month-end days like `2026-02-31` to `2026-02-28` instead of overflowing.
 */
export function parseAndClampUtcDate(value: unknown): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const ymdMatch = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(trimmed);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const monthIndex = Number(ymdMatch[2]) - 1;
    const day = Number(ymdMatch[3]);
    if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
    return buildClampedUtcDate(year, monthIndex, day);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
}

/**
 * Resolves the effective UTC date in a given month for a monthly day-of-month (1-31).
 */
export function resolveEffectiveDateForMonth(
  dayOfMonth: number,
  year: number,
  month: number,
): Date {
  return buildClampedUtcDate(year, month, dayOfMonth);
}

/**
 * Returns the UTC Sunday-Saturday week boundaries containing the given UTC date.
 */
export function getUtcWeekBounds(referenceDate: Date): {
  weekStartMs: number;
  weekEndMs: number;
  todayStartMs: number;
  todayEndMs: number;
} {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const date = referenceDate.getUTCDate();
  const dayOfWeek = referenceDate.getUTCDay();

  const todayStartMs = Date.UTC(year, month, date);
  const todayEndMs = todayStartMs + MS_PER_DAY - 1;
  const weekStartMs = todayStartMs - dayOfWeek * MS_PER_DAY;
  const weekEndMs = weekStartMs + 7 * MS_PER_DAY - 1;

  return { weekStartMs, weekEndMs, todayStartMs, todayEndMs };
}

