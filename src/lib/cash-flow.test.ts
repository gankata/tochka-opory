import { describe, expect, it } from "vitest";
import { buildCashFlowForecast } from "./cash-flow";

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
});
