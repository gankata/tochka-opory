import { normalizeOperationCategory } from "@contracts/operationCategories";
import type { Payment, Transaction, Workspace } from "@/types";
import { dateToISO, incomeDatesForMonth, type SalaryPayment } from "@/lib/working-days";
import { paymentAmount, roundMoney } from "@/lib/utils-app";

export type FinancialEventKind = "income" | "expense" | "exchange" | "payment" | "salary";

type EventBase = {
  id: string;
  date: string;
  title: string;
  kind: FinancialEventKind;
  amountRub: number | null;
  future: boolean;
};

export type FinancialEvent = EventBase & (
  | { kind: "income" | "expense" | "exchange"; transaction: Transaction }
  | { kind: "payment"; payment: Payment }
  | { kind: "salary"; salary: SalaryPayment }
);

function monthDistance(from: string, to: string) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return (toYear - fromYear) * 12 + toMonth - fromMonth;
}

export function paymentDateForMonth(payment: Payment, month: string) {
  if (payment.nextDate?.slice(0, 7) === month) return payment.nextDate;
  if (!payment.dayOfMonth) return null;
  if (payment.intervalMonths > 1) {
    if (!payment.nextDate) return null;
    const distance = monthDistance(payment.nextDate.slice(0, 7), month);
    if (distance < 0 || distance % payment.intervalMonths !== 0) return null;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const day = Math.min(payment.dayOfMonth, new Date(year, monthNumber, 0, 12).getDate());
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function buildFinancialCalendar(data: Workspace, month: string, today = dateToISO(new Date())) {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthTransactions = data.transactions.filter((transaction) => transaction.operationDate.startsWith(month));
  const transactionEvents: FinancialEvent[] = monthTransactions.map((transaction) => {
    const kind = transaction.type === "Доход" ? "income" : transaction.type === "Расход" ? "expense" : "exchange";
    return {
      id: `transaction-${transaction.id}`,
      date: transaction.operationDate,
      title: transaction.category,
      kind,
      amountRub: Math.abs(transaction.amountRub),
      future: transaction.operationDate > today,
      transaction,
    };
  });

  const recordedCategories = new Set(monthTransactions
    .filter((transaction) => transaction.type === "Расход")
    .map((transaction) => normalizeOperationCategory(transaction.category)));

  const paymentEvents: FinancialEvent[] = data.payments.flatMap((payment) => {
    const date = paymentDateForMonth(payment, month);
    if (!date) return [];
    if (payment.paidCycle && month === today.slice(0, 7)) return [];
    if (recordedCategories.has(normalizeOperationCategory(payment.name))) return [];
    return [{
      id: `payment-${payment.id}-${date}`,
      date,
      title: payment.name,
      kind: "payment",
      amountRub: paymentAmount(payment),
      future: date > today,
      payment,
    }];
  });

  const salaries = data.settings ? incomeDatesForMonth(year, monthNumber - 1, { ...data.settings, incomeSources: data.incomeSources }) : [];
  const salaryEvents: FinancialEvent[] = salaries.map((salary) => ({
    id: `salary-${salary.kind}-${salary.isoDate}`,
    date: salary.isoDate,
    title: salary.label,
    kind: "salary",
    amountRub: null,
    future: salary.isoDate > today,
    salary,
  }));

  const events = [...transactionEvents, ...paymentEvents, ...salaryEvents]
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, "ru"));
  const byDay = events.reduce<Record<string, FinancialEvent[]>>((result, event) => {
    (result[event.date] ??= []).push(event);
    return result;
  }, {});
  const actual = transactionEvents.filter((event) => !event.future);
  const monthIncome = roundMoney(actual.filter((event) => event.kind === "income").reduce((sum, event) => sum + (event.amountRub ?? 0), 0));
  const monthExpense = roundMoney(actual.filter((event) => event.kind === "expense").reduce((sum, event) => sum + (event.amountRub ?? 0), 0));
  const plannedTotal = roundMoney(paymentEvents.reduce((sum, event) => sum + (event.amountRub ?? 0), 0));
  const undatedPayments = data.payments.filter((payment) => {
    if (!payment.dayOfMonth && !payment.nextDate) return true;
    return payment.intervalMonths > 1 && !payment.nextDate;
  });

  return { events, byDay, monthIncome, monthExpense, plannedTotal, salaries, undatedPayments };
}
