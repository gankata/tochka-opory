import { describe, expect, it } from "vitest";
import { buildCashFlowForecast, buildUnconfirmedIncomeSchedule } from "./cash-flow";

describe("прогноз денежного потока", () => {
  it("учитывает будущие операции и повторяющиеся платежи без перезаписи данных", () => {
    const transactions = [{ operationDate: "2026-11-05", type: "Доход", amountRub: 1000 }, { operationDate: "2026-11-06", type: "Расход", amountRub: 100 }] as never;
    const payments = [{ nextDate: "2026-11-10", amount: 300, intervalMonths: 1 }] as never;
    const result = buildCashFlowForecast(transactions, payments, 500, "2026-11-04", 40);
    expect(result.points.find((point) => point.date === "2026-11-05")?.balance).toBe(1500);
    expect(result.points.find((point) => point.date === "2026-11-06")?.balance).toBe(1400);
    expect(result.points.find((point) => point.date === "2026-11-10")?.balance).toBe(1100);
    expect(result.points.find((point) => point.date === "2026-12-10")?.balance).toBe(800);
  });

  it("не использует будущие валютные операции и показывает первый рублёвый дефицит", () => {
    const transactions = [
      { operationDate: "2026-11-05", type: "Расход", amountRub: 700, currency: "RUB" },
      { operationDate: "2026-11-05", type: "Доход", amountRub: 8000, currency: "USD", originalAmount: 100, exchangeRate: 80 },
      { operationDate: "2026-11-06", type: "Расход", amountRub: 830, currency: "USD", originalAmount: 10, exchangeRate: 83 },
      { operationDate: "2026-11-07", type: "Обмен", amountRub: 1600, currency: "USD", originalAmount: -20, exchangeRate: 80 },
    ] as never;
    const result = buildCashFlowForecast(transactions, [], 500, "2026-11-04", 10);

    expect(result.points.find((point) => point.date === "2026-11-05")?.balance).toBe(-200);
    expect(result.points.find((point) => point.date === "2026-11-06")?.balance).toBe(-200);
    expect(result.points.find((point) => point.date === "2026-11-07")?.balance).toBe(-200);
    expect(result.firstNegative?.date).toBe("2026-11-05");
    expect(result.lowest.balance).toBe(-200);
  });

  it("показывает будущие даты выплат без выдумывания их сумм и исключает сегодня", () => {
    const result = buildUnconfirmedIncomeSchedule({ incomeSchedule: "twice", salaryDay: 15, secondSalaryDay: 25 }, "2026-11-13", "2026-12-31");

    expect(result.map((payment) => payment.isoDate)).toEqual(["2026-11-25", "2026-12-15", "2026-12-25"]);
  });

  it("не создаёт плановых дат для нерегулярного дохода и не теряет выплату на границе периода", () => {
    expect(buildUnconfirmedIncomeSchedule({ incomeSchedule: "irregular", salaryDay: 15, secondSalaryDay: null }, "2026-11-13", "2026-12-31")).toEqual([]);
    const monthly = buildUnconfirmedIncomeSchedule({ incomeSchedule: "monthly", salaryDay: 1, secondSalaryDay: null }, "2027-01-31", "2027-05-01");
    expect(monthly.at(-1)?.isoDate).toBe("2027-04-30");
  });
});
