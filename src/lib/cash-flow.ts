import type { Payment, Transaction } from "@/types";
import { parseDay, roundMoney, todayISO } from "./utils-app";

export type CashFlowPoint = { date: string; label: string; balance: number; income: number; expense: number };
const localIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const addDays = (value: string, days: number) => { const date = parseDay(value); date.setDate(date.getDate() + days); return localIso(date); };

export function buildCashFlowForecast(transactions: Transaction[], payments: Payment[], startingBalance: number, today = todayISO(), days = 90) {
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const end = addDays(today, safeDays);
  const events = new Map<string, { income: number; expense: number }>();
  const add = (date: string, income: number, expense: number) => {
    if (date <= today || date > end) return;
    const current = events.get(date) ?? { income: 0, expense: 0 };
    current.income += income; current.expense += expense; events.set(date, current);
  };
  for (const transaction of transactions) {
    if (transaction.type === "Обмен" || transaction.operationDate <= today) continue;
    add(transaction.operationDate, transaction.type === "Доход" ? Math.abs(transaction.amountRub) : 0, transaction.type === "Расход" ? Math.abs(transaction.amountRub) : 0);
  }
  for (const payment of payments) {
    if (!payment.nextDate || !Number.isFinite(payment.amount)) continue;
    let date = payment.nextDate;
    let guard = 0;
    while (date <= end && guard < 24) {
      add(date, 0, Math.abs(payment.amount ?? 0));
      const current = parseDay(date);
      const next = new Date(current.getFullYear(), current.getMonth() + Math.max(1, payment.intervalMonths), 1, 12);
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0, 12).getDate();
      next.setDate(Math.min(current.getDate(), lastDay));
      date = localIso(next); guard += 1;
    }
  }
  let balance = startingBalance;
  const points: CashFlowPoint[] = [];
  for (let offset = 0; offset <= safeDays; offset += 1) {
    const date = addDays(today, offset);
    const event = events.get(date) ?? { income: 0, expense: 0 };
    balance = roundMoney(balance + event.income - event.expense);
    points.push({ date, label: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(parseDay(date)), balance, ...event });
  }
  return { points, end, lowest: points.reduce((lowest, point) => point.balance < lowest.balance ? point : lowest, points[0]) };
}
