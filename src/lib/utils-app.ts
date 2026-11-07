import type { Payment, Reminder, Settings, Workspace } from "@/types";
import { currencyCodes } from "@contracts/currencies";
import { normalizeOperationCategory } from "@contracts/operationCategories";
import { lastRussianWorkingDay, nextSalaryPayment, upcomingSalaryPayments } from "@/lib/working-days";

export const todayISO = (date = new Date()) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
export const roundMoney = (value: number) => {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};
export const parseDecimal = (value: string) => value.trim() === "" ? Number.NaN : Number(value.trim().replace(",", "."));
export const parseDay = (value: string) => new Date(`${value}T12:00:00`);
export const money = (value: number, currency = "₽") => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)} ${currency}`;

export type Transaction = Workspace["transactions"][number];

export function operationCurrency(transaction: Transaction) {
  if (transaction.currency && transaction.currency !== "RUB") return transaction.currency;
  if (transaction.type === "Обмен" && transaction.amountUsd != null) return "USD";
  return transaction.currency || "RUB";
}

export function operationAmount(transaction: Transaction) {
  if (transaction.originalAmount != null) return transaction.originalAmount;
  const currency = operationCurrency(transaction);
  if (transaction.type === "Обмен") return transaction.amountUsd ?? 0;
  if (currency === "RUB") return transaction.amountRub;
  const rate = transaction.exchangeRate;
  return rate && rate > 0 ? transaction.amountRub / rate : 0;
}

export const decimal = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
export const formatDate = (value: string | Date, withYear = true) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(typeof value === "string" ? parseDay(value) : value);
export const formatDateTime = (value: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
export const toInputDateTime = (value: Date) => {
  const d = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export function paymentAmount(p: Payment, upper = false) {
  if (p.amount != null) return p.amount;
  if (p.minAmount != null || p.maxAmount != null) return upper ? (p.maxAmount ?? p.minAmount ?? 0) : ((p.minAmount ?? 0) + (p.maxAmount ?? 0)) / 2;
  return 0;
}
export const paymentMonthly = (p: Payment) => paymentAmount(p) / Math.max(1, p.intervalMonths);

export function lastWorkingDay(year: number, month: number) {
  return lastRussianWorkingDay(year, month);
}
export function nextSalary(settings: Settings, from = new Date()) {
  return nextSalaryPayment(settings.salaryDay, from).date;
}
const isoFromDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function calculateWorkspace(data: Workspace, now = new Date()) {
  const s = data.settings!;
  const today = todayISO(now);
  const month = today.slice(0, 7);
  const actualTransactions = data.transactions.filter((t) => t.operationDate <= today);
  const futureTransactions = data.transactions.filter((t) => t.operationDate > today);
  const relevant = actualTransactions.filter((t) => t.operationDate >= s.startDate);
  const balances: Record<string, number> = {
    ...(s.currencyBalances ?? {}),
    RUB: roundMoney(s.cashRub + s.cardRub),
    USD: s.cashUsd,
  };

  for (const transaction of relevant) {
    if (transaction.type === "Обмен") {
      const currency = operationCurrency(transaction);
      balances.RUB = roundMoney((balances.RUB ?? 0) + transaction.amountRub);
      if (currency !== "RUB") {
        balances[currency] = roundMoney((balances[currency] ?? 0) + operationAmount(transaction));
      }
      continue;
    }

    const currency = operationCurrency(transaction);
    const direction = transaction.type === "Расход" ? -1 : 1;
    balances[currency] = roundMoney(
      (balances[currency] ?? 0) + direction * Math.abs(operationAmount(transaction)),
    );
  }

  const currentRates: Record<string, number> = {
    ...(s.currencyRates ?? {}),
    RUB: 1,
    USD: s.usdRate,
  };
  const currencyBalances = Object.entries(balances)
    .filter(([code, amount]) => code === "RUB" || Math.abs(amount) > 0.000001)
    .map(([code, amount]) => ({
      code,
      amount: roundMoney(amount),
      rate: currentRates[code],
      rubEquivalent: currentRates[code] > 0 ? roundMoney(amount * currentRates[code]) : null,
    }))
    .sort((a, b) => {
      const aIndex = currencyCodes.indexOf(a.code as (typeof currencyCodes)[number]);
      const bIndex = currencyCodes.indexOf(b.code as (typeof currencyCodes)[number]);
      return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
    });
  const missingRateCurrencies = currencyBalances
    .filter((balance) => balance.code !== "RUB" && !(balance.rate > 0))
    .map((balance) => balance.code);
  const bookRub = roundMoney(balances.RUB ?? 0);
  const bookUsd = roundMoney(balances.USD ?? 0);
  const totalRub = roundMoney(currencyBalances.reduce(
    (sum, balance) => sum + (balance.rubEquivalent ?? 0),
    0,
  ));
  const monthTx = actualTransactions.filter((t) => t.operationDate.startsWith(month));
  const monthIncome = roundMoney(monthTx.filter((t) => t.type === "Доход").reduce((sum, t) => sum + t.amountRub, 0));
  const monthExpense = roundMoney(monthTx.filter((t) => t.type === "Расход").reduce((sum, t) => sum + t.amountRub, 0));
  const activePayments = data.payments.filter((p) => s.mode === "Обычный" || p.required);
  const fixedMonthly = roundMoney(activePayments.reduce((sum, p) => sum + paymentMonthly(p), 0));
  const requiredFixed = roundMoney(data.payments.filter((p) => p.required).reduce((sum, p) => sum + paymentMonthly(p), 0));
  const envelopePlan = (name: string) => {
    const normalized = normalizeOperationCategory(name);
    const e = data.envelopes.find((item) => normalizeOperationCategory(item.name) === normalized);
    return e?.monthlyLimit ?? e?.estimatedAmount ?? 0;
  };
  const variableMonthly = roundMoney(data.envelopes.reduce((sum, e) => {
    const base = e.monthlyLimit ?? e.estimatedAmount ?? 0;
    return sum + (s.mode === "Экономия" ? base * (1 - s.savingPercent / 100) : base);
  }, 0));
  const requiredVariable = roundMoney(data.envelopes.filter((e) => e.required).reduce((sum, e) => sum + (e.monthlyLimit ?? e.estimatedAmount ?? 0), 0));
  const mandatoryMonthly = roundMoney(requiredFixed + requiredVariable);
  const reserveTarget = roundMoney(mandatoryMonthly * s.reserveMonths);
  const allocatedGoals = roundMoney(data.goals.reduce((sum, g) => sum + g.savedAmount, 0));
  const reserveBase = roundMoney(totalRub - allocatedGoals);
  const freeOverReserve = roundMoney(reserveBase - reserveTarget);
  const reserveGap = roundMoney(Math.max(0, -freeOverReserve));
  const spendableRub = Math.max(0, freeOverReserve);
  const salarySchedule = upcomingSalaryPayments(s.salaryDay, now, 2);
  const salaryPayment = salarySchedule[0];
  const salary = salaryPayment.date;
  const salaryDaysLeft = Math.max(0, Math.ceil((salary.getTime() - parseDay(today).getTime()) / 86400000));
  const daysToSalary = Math.max(1, salaryDaysLeft);
  const monthExpenses = monthTx.filter((t) => t.type === "Расход");
  const recordedPaymentIds = data.payments
    .filter((payment) => payment.intervalMonths === 1 && monthExpenses.some((transaction) =>
      normalizeOperationCategory(transaction.category) === normalizeOperationCategory(payment.name),
    ))
    .map((payment) => payment.id);
  let knownBeforeSalary = 0;
  let possibleBeforeSalary = 0;
  activePayments.filter((p) => !p.paidCycle && !recordedPaymentIds.includes(p.id)).forEach((p) => {
    let due: string | null = p.nextDate;
    if (!due && p.dayOfMonth && p.intervalMonths === 1) {
      const candidate = new Date(now.getFullYear(), now.getMonth(), p.dayOfMonth, 12);
      if (isoFromDate(candidate) < today) candidate.setMonth(candidate.getMonth() + 1);
      due = isoFromDate(candidate);
    }
    if (due && due >= today && due <= isoFromDate(salary)) knownBeforeSalary += paymentAmount(p, true);
    else if (!due) possibleBeforeSalary += paymentAmount(p, true);
  });
  knownBeforeSalary = roundMoney(knownBeforeSalary);
  possibleBeforeSalary = roundMoney(possibleBeforeSalary);
  const dailyVariable = variableMonthly / 30.4;
  const forecastAfterSalary = roundMoney(bookRub - knownBeforeSalary - possibleBeforeSalary - dailyVariable * daysToSalary);
  const envelopeCategories = new Set(data.envelopes.map((e) => normalizeOperationCategory(e.name)));
  const monthVariableSpent = roundMoney(monthExpenses
    .filter((t) => envelopeCategories.has(normalizeOperationCategory(t.category)))
    .reduce((sum, t) => sum + t.amountRub, 0));
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12);
  const daysLeft = Math.max(1, Math.round((nextMonth.getTime() - parseDay(today).getTime()) / 86400000));
  const variableRemaining = roundMoney(variableMonthly - monthVariableSpent);
  const canSpendToday = roundMoney(Math.max(0, variableRemaining / daysLeft));
  const completedMonthIncomes = Object.entries(actualTransactions.filter((t) => t.type === "Доход" && t.operationDate.slice(0, 7) < month).reduce<Record<string, number>>((acc, t) => {
    const key = t.operationDate.slice(0, 7); acc[key] = roundMoney((acc[key] ?? 0) + t.amountRub); return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b)).slice(-s.statsMonths).map(([, value]) => value);
  const incomeForecast = !completedMonthIncomes.length ? 0 : s.incomeStrategy === "Худший месяц" ? Math.min(...completedMonthIncomes) : s.incomeStrategy === "Среднее за 3 месяца" ? completedMonthIncomes.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, completedMonthIncomes.length) : completedMonthIncomes.reduce((a, b) => a + b, 0) / completedMonthIncomes.length;
  return {
    bookRub, bookUsd, totalRub, currencyBalances, currentRates, missingRateCurrencies,
    actualTransactions, futureTransactions, monthIncome, monthExpense, fixedMonthly, variableMonthly,
    mandatoryMonthly, reserveTarget, allocatedGoals, reserveBase, reserveGap, spendableRub, freeOverReserve,
    runway: mandatoryMonthly ? Math.max(0, reserveBase) / mandatoryMonthly : 0, salary, salaryPayment, salarySchedule, salaryDaysLeft, daysToSalary,
    knownBeforeSalary, possibleBeforeSalary, forecastAfterSalary, dailyVariable: roundMoney(dailyVariable),
    daysLeft, monthVariableSpent, variableRemaining, canSpendToday, recordedPaymentIds,
    incomeForecast, savingsCapacity: roundMoney(incomeForecast - fixedMonthly - variableMonthly), envelopePlan,
  };
}

export function downloadBlob(content: BlobPart, filename: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCsv(rows: Array<Array<string | number | null | undefined>>) {
  return "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";")).join("\r\n");
}
const icsEscape = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
const icsDate = (date: Date) => date.toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}/, "");
export function remindersToIcs(reminders: Reminder[]) {
  const events = reminders.filter((r) => r.enabled).map((r) => [
    "BEGIN:VEVENT", `UID:${r.uid}`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(r.startAt)}`,
    `SUMMARY:${icsEscape(r.title)}`, `DESCRIPTION:${icsEscape(r.description ?? "")}`,
    r.recurrence ? `RRULE:${r.recurrence}` : "", "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(r.title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT",
  ].filter(Boolean).join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Tochka Opory//RU//", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Точка опоры — напоминания", ...events, "END:VCALENDAR"].join("\r\n");
}

export function nextReminder(reminder: Reminder, now = new Date()): Date | null {
  const start = reminder.startAt;
  if (!reminder.recurrence) return start >= now ? start : null;
  if (reminder.recurrence.includes("FREQ=DAILY")) {
    const d = new Date(now); d.setHours(start.getHours(), start.getMinutes(), 0, 0); if (d < now) d.setDate(d.getDate() + 1); return d;
  }
  if (reminder.recurrence.includes("FREQ=WEEKLY")) {
    const match = reminder.recurrence.match(/BYDAY=([A-Z,]+)/); const map: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const days = (match?.[1]?.split(",") ?? ["SU"]).map((d) => map[d]);
    const candidates = days.map((day) => { const d = new Date(now); d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7)); d.setHours(start.getHours(), start.getMinutes(), 0, 0); if (d < now) d.setDate(d.getDate() + 7); return d; });
    return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
  }
  if (reminder.recurrence.includes("FREQ=MONTHLY")) {
    const match = reminder.recurrence.match(/BYMONTHDAY=([\d,]+)/); const days = (match?.[1]?.split(",") ?? [String(start.getDate())]).map(Number);
    const candidates: Date[] = [];
    for (let offset = 0; offset < 2; offset++) for (const day of days) {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, day, start.getHours(), start.getMinutes()); if (d >= now) candidates.push(d);
    }
    return candidates.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }
  return start >= now ? start : null;
}

export const moodColor = (score: number) => score <= 2 ? "#b9514c" : score <= 4 ? "#cf8052" : score <= 6 ? "#c2a356" : score <= 8 ? "#6c9a7d" : "#347563";
