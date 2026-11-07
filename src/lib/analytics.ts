import type { Transaction } from "@/types";
import { normalizeOperationCategory } from "@contracts/operationCategories";
import { parseDay, roundMoney, todayISO } from "@/lib/utils-app";

export type AnalyticsKind = "expense" | "income";
export type AnalyticsPeriod = "month" | "3m" | "6m" | "12m" | "all" | "custom";
export type AnalyticsGroup = "day" | "week" | "month";

export type AnalyticsRange = {
  start: string;
  end: string;
  days: number;
};

export type AnalyticsBucket = {
  key: string;
  label: string;
  fullLabel: string;
  total: number;
  count: number;
};

export type AnalyticsCategory = {
  name: string;
  total: number;
  share: number;
  count: number;
  average: number;
  latestDate: string;
  transactions: Transaction[];
};

export type AnalyticsModel = {
  kind: AnalyticsKind;
  range: AnalyticsRange;
  previousRange: AnalyticsRange;
  transactions: Transaction[];
  previousTransactions: Transaction[];
  buckets: AnalyticsBucket[];
  categories: AnalyticsCategory[];
  total: number;
  previousTotal: number;
  change: number;
  changePercent: number | null;
  count: number;
  previousCount: number;
  average: number;
  monthlyAverage: number;
};

export type AnalyticsOptions = {
  kind: AnalyticsKind;
  period: AnalyticsPeriod;
  group: AnalyticsGroup;
  customStart?: string;
  customEnd?: string;
  today?: string;
};

export const MAX_ANALYTICS_BUCKETS = 500;

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function shiftAnalyticsDays(value: string, amount: number) {
  const date = parseDay(value);
  date.setDate(date.getDate() + amount);
  return isoDate(date);
}

function firstOfMonth(value: string, offset = 0) {
  const date = parseDay(value);
  return isoDate(new Date(date.getFullYear(), date.getMonth() + offset, 1, 12));
}

function validDay(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = parseDay(value);
  return Number.isFinite(parsed.getTime()) && isoDate(parsed) === value ? value : fallback;
}

export function makeAnalyticsRange(startValue: string, endValue: string): AnalyticsRange {
  let start = startValue;
  let end = endValue;
  if (start > end) [start, end] = [end, start];
  const days = Math.max(1, Math.round((parseDay(end).getTime() - parseDay(start).getTime()) / 86_400_000) + 1);
  return { start, end, days };
}

export function resolveAnalyticsRange(
  period: AnalyticsPeriod,
  transactions: Transaction[],
  today = todayISO(),
  customStart?: string,
  customEnd?: string,
): AnalyticsRange {
  const current = validDay(today, todayISO());
  if (period === "custom") {
    return makeAnalyticsRange(validDay(customStart, current), validDay(customEnd, current));
  }
  if (period === "all") {
    const earliest = transactions
      .filter((transaction) => transaction.operationDate <= current)
      .map((transaction) => transaction.operationDate)
      .sort()[0] ?? current;
    return makeAnalyticsRange(earliest, current);
  }
  const offsets: Record<Exclude<AnalyticsPeriod, "all" | "custom">, number> = {
    month: 0,
    "3m": -2,
    "6m": -5,
    "12m": -11,
  };
  return makeAnalyticsRange(firstOfMonth(current, offsets[period]), current);
}

export function previousAnalyticsRange(range: AnalyticsRange): AnalyticsRange {
  return makeAnalyticsRange(shiftAnalyticsDays(range.start, -range.days), shiftAnalyticsDays(range.start, -1));
}

export function filterAnalyticsTransactions(
  transactions: Transaction[],
  kind: AnalyticsKind,
  range: AnalyticsRange,
  today = todayISO(),
) {
  const operationType = kind === "expense" ? "Расход" : "Доход";
  return transactions
    .filter((transaction) =>
      transaction.type === operationType &&
      transaction.operationDate >= range.start &&
      transaction.operationDate <= range.end &&
      transaction.operationDate <= today &&
      Number.isFinite(transaction.amountRub)
    )
    .sort((a, b) => b.operationDate.localeCompare(a.operationDate) || b.id - a.id);
}

function mondayFor(value: string) {
  const date = parseDay(value);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return isoDate(date);
}

const shortDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const fullDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const shortMonth = new Intl.DateTimeFormat("ru-RU", { month: "short" });
const fullMonth = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });

function bucketStarts(range: AnalyticsRange, group: AnalyticsGroup) {
  const starts: string[] = [];
  if (group === "day") {
    for (let offset = 0; offset < range.days; offset++) starts.push(shiftAnalyticsDays(range.start, offset));
  } else if (group === "week") {
    let cursor = mondayFor(range.start);
    while (cursor <= range.end) {
      starts.push(cursor);
      cursor = shiftAnalyticsDays(cursor, 7);
    }
  } else {
    let cursor = firstOfMonth(range.start);
    while (cursor <= range.end) {
      starts.push(cursor);
      const date = parseDay(cursor);
      cursor = isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 1, 12));
    }
  }
  if (starts.length > MAX_ANALYTICS_BUCKETS) {
    throw new RangeError(`Слишком много интервалов: ${starts.length}. Выберите более крупную группировку.`);
  }
  return starts;
}

export function analyticsBucketCount(range: AnalyticsRange, group: AnalyticsGroup) {
  if (group === "day") return range.days;
  if (group === "week") return Math.floor((range.days + ((parseDay(range.start).getDay() + 6) % 7) - 1) / 7) + 1;
  const start = parseDay(firstOfMonth(range.start));
  const end = parseDay(firstOfMonth(range.end));
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
}

export function analyticsGroupAvailable(range: AnalyticsRange, group: AnalyticsGroup) {
  return analyticsBucketCount(range, group) <= MAX_ANALYTICS_BUCKETS;
}

function bucketKey(value: string, group: AnalyticsGroup) {
  return group === "month" ? value.slice(0, 7) : value;
}

function bucketLabels(start: string, group: AnalyticsGroup) {
  const date = parseDay(start);
  if (group === "day") return { label: shortDay.format(date).replace(".", ""), fullLabel: fullDay.format(date) };
  if (group === "month") return { label: shortMonth.format(date).replace(".", ""), fullLabel: fullMonth.format(date) };
  const end = parseDay(shiftAnalyticsDays(start, 6));
  return {
    label: `${new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date).replace(".", "")} — ${shortDay.format(end).replace(".", "")}`,
    fullLabel: `${fullDay.format(date)} — ${fullDay.format(end)}`,
  };
}

export function buildAnalyticsBuckets(
  transactions: Transaction[],
  range: AnalyticsRange,
  group: AnalyticsGroup,
): AnalyticsBucket[] {
  const grouped = new Map<string, { total: number; count: number }>();
  for (const transaction of transactions) {
    const key = bucketKey(group === "week" ? mondayFor(transaction.operationDate) : transaction.operationDate, group);
    const current = grouped.get(key) ?? { total: 0, count: 0 };
    current.total += Math.abs(transaction.amountRub);
    current.count += 1;
    grouped.set(key, current);
  }
  return bucketStarts(range, group).map((start) => {
    const key = bucketKey(start, group);
    const value = grouped.get(key) ?? { total: 0, count: 0 };
    return { key, ...bucketLabels(start, group), total: roundMoney(value.total), count: value.count };
  });
}

export function buildAnalyticsCategories(transactions: Transaction[]): AnalyticsCategory[] {
  const grouped = new Map<string, { name: string; transactions: Transaction[] }>();
  for (const transaction of transactions) {
    const rawName = transaction.category.trim().replace(/\s+/g, " ") || "Без категории";
    const name = rawName.charAt(0).toLocaleUpperCase("ru-RU") + rawName.slice(1);
    const key = normalizeOperationCategory(name) || "без категории";
    const current = grouped.get(key) ?? { name, transactions: [] };
    current.transactions.push(transaction);
    grouped.set(key, current);
  }
  const grandTotal = transactions.reduce((sum, transaction) => sum + Math.abs(transaction.amountRub), 0);
  return Array.from(grouped.values()).map(({ name, transactions: items }) => {
    const total = roundMoney(items.reduce((sum, transaction) => sum + Math.abs(transaction.amountRub), 0));
    return {
      name,
      total,
      share: grandTotal > 0 ? total / grandTotal * 100 : 0,
      count: items.length,
      average: items.length ? roundMoney(total / items.length) : 0,
      latestDate: items.reduce((latest, transaction) => transaction.operationDate > latest ? transaction.operationDate : latest, ""),
      transactions: [...items].sort((a, b) => b.operationDate.localeCompare(a.operationDate) || b.id - a.id),
    };
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru"));
}

export function buildAnalyticsModel(transactions: Transaction[], options: AnalyticsOptions): AnalyticsModel {
  const today = options.today ?? todayISO();
  const range = resolveAnalyticsRange(options.period, transactions, today, options.customStart, options.customEnd);
  const previousRange = previousAnalyticsRange(range);
  const selected = filterAnalyticsTransactions(transactions, options.kind, range, today);
  const previousTransactions = filterAnalyticsTransactions(transactions, options.kind, previousRange, today);
  const total = roundMoney(selected.reduce((sum, transaction) => sum + Math.abs(transaction.amountRub), 0));
  const previousTotal = roundMoney(previousTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amountRub), 0));
  const start = parseDay(range.start);
  const end = parseDay(range.end);
  const touchedMonths = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;
  return {
    kind: options.kind,
    range,
    previousRange,
    transactions: selected,
    previousTransactions,
    buckets: buildAnalyticsBuckets(selected, range, options.group),
    categories: buildAnalyticsCategories(selected),
    total,
    previousTotal,
    change: roundMoney(total - previousTotal),
    changePercent: previousTotal > 0 ? (total - previousTotal) / previousTotal * 100 : null,
    count: selected.length,
    previousCount: previousTransactions.length,
    average: selected.length ? roundMoney(total / selected.length) : 0,
    monthlyAverage: roundMoney(total / Math.max(1, touchedMonths)),
  };
}
