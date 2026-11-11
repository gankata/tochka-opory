import { describe, expect, it } from "vitest";
import type { Payment, Transaction, Workspace } from "@/types";
import { buildFinancialCalendar, paymentDateForMonth } from "./financial-calendar";

const stamps = { createdAt: new Date("2026-11-01T12:00:00"), updatedAt: new Date("2026-11-01T12:00:00") };

function transaction(id: number, category: string, date = "2026-11-05"): Transaction {
  return {
    id, userId: 1, operationDate: date, type: "Расход", category, amountRub: 1200,
    amountUsd: null, currency: "RUB", originalAmount: 1200, exchangeRate: 1,
    note: null, source: "Тест", importBatchId: null, externalId: null, clientId: null, ...stamps,
  };
}

function payment(id: number, name: string, patch: Partial<Payment> = {}): Payment {
  return {
    id, userId: 1, name, amount: 1200, minAmount: null, maxAmount: null,
    intervalMonths: 1, required: true, sourceType: "Данные пользователя",
    dayOfMonth: 5, nextDate: null, paidCycle: false, note: null, ...stamps, ...patch,
  };
}

function workspace(patch: Partial<Workspace> = {}): Workspace {
  return {
    settings: {
      id: 1, userId: 1, startDate: "2026-01-01", cashRub: 0, cardRub: 0,
      cashUsd: 0, usdRate: 80, reserveMonths: 3, salaryDay: 15, secondSalaryDay: null, incomeSchedule: "twice", mode: "Обычный",
      savingPercent: 30, trackingDays: 14, incomeStrategy: "Худший месяц", statsMonths: 6,
      walletDays: 3, largeExpenseThreshold: 10000, currencyRates: {}, currencyBalances: {}, ...stamps,
    },
    transactions: [], payments: [], envelopes: [], goals: [], moods: [], options: [], notes: [],
    incomeSources: [
      { id: 1, userId: 1, name: "Первая зарплата", dayOfMonth: 15, sortOrder: 0, ...stamps },
      { id: 2, userId: 1, name: "Вторая зарплата", dayOfMonth: null, sortOrder: 1, ...stamps },
    ],
    reminders: [], reconciliations: [], ...patch,
  };
}

describe("финансовый календарь", () => {
  it("группирует фактические операции и добавляет обе зарплатные даты без суммы", () => {
    const result = buildFinancialCalendar(workspace({ transactions: [transaction(1, "Еда")] }), "2026-11", "2026-11-10");
    expect(result.byDay["2026-11-05"].map((event) => event.kind)).toEqual(["expense"]);
    expect(result.byDay["2026-11-13"][0].kind).toBe("salary");
    expect(result.byDay["2026-11-30"][0].kind).toBe("salary");
    expect(result.events.filter((event) => event.kind === "salary").every((event) => event.amountRub === null)).toBe(true);
    expect(result.monthExpense).toBe(1200);
  });

  it("не дублирует платёж, если расход той же категории уже внесён", () => {
    const result = buildFinancialCalendar(workspace({
      transactions: [transaction(1, " аренда ")], payments: [payment(1, "Аренда")],
    }), "2026-11", "2026-11-10");
    expect(result.events.filter((event) => event.kind === "payment")).toHaveLength(0);
    expect(result.events.filter((event) => event.kind === "expense")).toHaveLength(1);
  });

  it("paidCycle скрывает только текущий цикл и не стирает прошлые месяцы", () => {
    const data = workspace({ payments: [payment(1, "Аренда", { paidCycle: true })] });
    expect(buildFinancialCalendar(data, "2026-11", "2026-11-10").events.some((event) => event.kind === "payment")).toBe(false);
    expect(buildFinancialCalendar(data, "2026-10", "2026-11-10").events.some((event) => event.kind === "payment")).toBe(true);
  });

  it("соблюдает интервал редкого платежа и не выдумывает дату без якоря", () => {
    const quarterly = payment(1, "Страховка", { dayOfMonth: 7, nextDate: "2026-11-07", intervalMonths: 3 });
    expect(paymentDateForMonth(quarterly, "2027-02")).toBe("2027-02-07");
    expect(paymentDateForMonth(quarterly, "2026-12")).toBeNull();
    expect(paymentDateForMonth(payment(2, "Без периода", { intervalMonths: 3 }), "2026-11")).toBeNull();
  });

  it("отдельно перечисляет платежи, которые невозможно поставить на календарь", () => {
    const result = buildFinancialCalendar(workspace({
      payments: [payment(1, "Без даты", { dayOfMonth: null })],
    }), "2026-11", "2026-11-10");
    expect(result.undatedPayments.map((item) => item.name)).toEqual(["Без даты"]);
    expect(result.events.some((event) => event.kind === "payment")).toBe(false);
  });

  it("показывает пользовательские дни двух выплат", () => {
    const data = workspace({ incomeSources: [
      { id: 1, userId: 1, name: "Аванс", dayOfMonth: 10, sortOrder: 0, ...stamps },
      { id: 2, userId: 1, name: "Зарплата", dayOfMonth: 25, sortOrder: 1, ...stamps },
    ] });
    const result = buildFinancialCalendar(data, "2026-11", "2026-11-01");
    expect(result.salaries.map((salary) => salary.isoDate)).toEqual(["2026-11-10", "2026-11-25"]);
  });

  it("использует названия всех регулярных источников и не присваивает им суммы", () => {
    const data = workspace({ incomeSources: [
      { id: 1, userId: 1, name: "Зарплата", dayOfMonth: 15, sortOrder: 0, ...stamps },
      { id: 2, userId: 1, name: "Аренда квартиры", dayOfMonth: 5, sortOrder: 1, ...stamps },
      { id: 3, userId: 1, name: "Гонорар", dayOfMonth: null, sortOrder: 2, ...stamps },
    ] });
    const result = buildFinancialCalendar(data, "2026-11", "2026-11-01");

    expect(result.salaries.map(({ label, isoDate }) => ({ label, isoDate }))).toEqual([
      { label: "Аренда квартиры", isoDate: "2026-11-05" },
      { label: "Зарплата", isoDate: "2026-11-13" },
      { label: "Гонорар", isoDate: "2026-11-30" },
    ]);
    expect(result.events.filter((event) => event.kind === "salary").map((event) => event.amountRub)).toEqual([null, null, null]);
  });

  it("не создаёт зарплатные события для нерегулярного дохода, но сохраняет фактические поступления", () => {
    const data = workspace({ transactions: [{ ...transaction(1, "Подработка"), type: "Доход", amountRub: 2500, originalAmount: 2500 }] });
    data.settings = { ...data.settings!, incomeSchedule: "irregular" };
    const result = buildFinancialCalendar(data, "2026-11", "2026-11-10");
    expect(result.salaries).toEqual([]);
    expect(result.events.some((event) => event.kind === "salary")).toBe(false);
    expect(result.monthIncome).toBe(2500);
  });
});
