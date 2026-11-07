import { describe, expect, it } from "vitest";
import type { Envelope, Goal, Payment, Settings, Transaction, Workspace } from "@/types";
import { calculateWorkspace, parseDecimal, roundMoney } from "@/lib/utils-app";

const now = new Date(2026, 10, 2, 12);
const stamps = { createdAt: new Date("2026-11-01T12:00:00"), updatedAt: new Date("2026-11-01T12:00:00") };

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    id: 1,
    userId: 1,
    startDate: "2026-11-01",
    cashRub: 1000,
    cardRub: 0,
    cashUsd: 0,
    usdRate: 80,
    reserveMonths: 3,
    salaryDay: 15,
    mode: "Обычный",
    savingPercent: 30,
    trackingDays: 14,
    incomeStrategy: "Худший месяц",
    statsMonths: 6,
    walletDays: 3,
    largeExpenseThreshold: 10000,
    currencyRates: {},
    currencyBalances: {},
    ...stamps,
    ...patch,
  };
}

function transaction(
  id: number,
  type: Transaction["type"],
  amountRub: number,
  operationDate: string,
  patch: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    userId: 1,
    operationDate,
    type,
    category: type === "Доход" ? "Доход" : "Прочее",
    amountRub,
    amountUsd: null,
    currency: "RUB",
    originalAmount: amountRub,
    exchangeRate: 1,
    note: null,
    source: "Тест",
    importBatchId: null,
    externalId: null,
    clientId: null,
    ...stamps,
    ...patch,
  };
}

function payment(id: number, name: string, amount: number, patch: Partial<Payment> = {}): Payment {
  return {
    id,
    userId: 1,
    name,
    amount,
    minAmount: null,
    maxAmount: null,
    intervalMonths: 1,
    required: true,
    sourceType: "Данные пользователя",
    dayOfMonth: null,
    nextDate: null,
    paidCycle: false,
    note: null,
    ...stamps,
    ...patch,
  };
}

function envelope(id: number, name: string, monthlyLimit: number, patch: Partial<Envelope> = {}): Envelope {
  return {
    id,
    userId: 1,
    name,
    required: false,
    estimatedAmount: null,
    monthlyLimit,
    sortOrder: id,
    note: null,
    ...stamps,
    ...patch,
  };
}

function goal(id: number, savedAmount: number): Goal {
  return { id, userId: 1, name: "Цель", targetAmount: 1000, savedAmount, targetDate: null, ...stamps };
}

function workspace(patch: Partial<Workspace> = {}): Workspace {
  return {
    settings: settings(),
    transactions: [],
    payments: [],
    envelopes: [],
    goals: [],
    moods: [],
    options: [],
    notes: [],
    reminders: [],
    reconciliations: [],
    ...patch,
  };
}

describe("финансовые расчёты", () => {
  it("сводит валютные остатки независимо и не включает будущее или историю до стартовой даты", () => {
    const result = calculateWorkspace(workspace({
      settings: settings({ cashUsd: 100 }),
      transactions: [
        transaction(1, "Доход", 100.1, "2026-11-01"),
        transaction(2, "Расход", 30.2, "2026-11-02"),
        transaction(3, "Расход", 830, "2026-11-02", { currency: "USD", originalAmount: 10, exchangeRate: 83 }),
        transaction(4, "Расход", 500, "2026-11-03"),
        transaction(5, "Доход", 9999, "2026-10-31"),
      ],
    }), now);

    expect(result.bookRub).toBe(1069.9);
    expect(result.bookUsd).toBe(90);
    expect(result.totalRub).toBe(8269.9);
    expect(result.monthIncome).toBe(100.1);
    expect(result.monthExpense).toBe(860.2);
    expect(result.actualTransactions.map((item) => item.id)).toEqual([1, 2, 3, 5]);
    expect(result.futureTransactions.map((item) => item.id)).toEqual([4]);
  });

  it("различает нехватку запаса, свободные деньги и отложенное на цели", () => {
    const result = calculateWorkspace(workspace({
      settings: settings({ reserveMonths: 2 }),
      payments: [payment(1, "Аренда", 1000)],
      envelopes: [envelope(1, "Еда", 500, { required: true })],
      goals: [goal(1, 200)],
    }), now);

    expect(result.mandatoryMonthly).toBe(1500);
    expect(result.reserveTarget).toBe(3000);
    expect(result.reserveBase).toBe(800);
    expect(result.freeOverReserve).toBe(-2200);
    expect(result.spendableRub).toBe(0);
    expect(result.reserveGap).toBe(2200);
    expect(result.runway).toBeCloseTo(0.5333, 4);
  });

  it("сопоставляет категории конвертов без учёта регистра и пробелов", () => {
    const result = calculateWorkspace(workspace({
      envelopes: [envelope(1, " Еда ", 3000)],
      transactions: [
        transaction(1, "Расход", 300.2, "2026-11-02", { category: "еда" }),
        transaction(2, "Расход", 1000, "2026-11-03", { category: "ЕДА" }),
      ],
    }), now);

    expect(result.monthVariableSpent).toBe(300.2);
    expect(result.variableRemaining).toBe(2699.8);
    expect(result.daysLeft).toBe(29);
    expect(result.canSpendToday).toBe(93.1);
    expect(result.envelopePlan("ЕДА")).toBe(3000);
  });

  it("не резервирует повторно ежемесячный платёж, уже внесённый как расход", () => {
    const result = calculateWorkspace(workspace({
      settings: settings({ cashRub: 10000 }),
      payments: [payment(1, "Интернет", 1000), payment(2, "Телефон", 500)],
      transactions: [transaction(1, "Расход", 995, "2026-11-01", { category: " интернет " })],
    }), now);

    expect(result.recordedPaymentIds).toEqual([1]);
    expect(result.knownBeforeSalary).toBe(0);
    expect(result.possibleBeforeSalary).toBe(500);
    expect(result.forecastAfterSalary).toBe(8505);
  });

  it("учитывает обмен в двух валютах без изменения исторического курса", () => {
    const result = calculateWorkspace(workspace({
      settings: settings({ cashRub: 10000 }),
      transactions: [transaction(1, "Обмен", -8250, "2026-11-01", {
        category: "Покупка валюты",
        currency: "USD",
        originalAmount: 100,
        amountUsd: 100,
        exchangeRate: 82.5,
      })],
    }), now);

    expect(result.bookRub).toBe(1750);
    expect(result.bookUsd).toBe(100);
    expect(result.totalRub).toBe(9750);
  });
});

describe("денежный ввод", () => {
  it("поддерживает русскую запятую и не превращает очистку поля в ноль на этапе ввода", () => {
    expect(parseDecimal("81,25")).toBe(81.25);
    expect(parseDecimal("81.25")).toBe(81.25);
    expect(Number.isNaN(parseDecimal(""))).toBe(true);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(roundMoney(-0.001), -0)).toBe(false);
  });
});
