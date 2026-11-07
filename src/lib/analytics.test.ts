import { describe, expect, it } from "vitest";
import type { Transaction } from "@/types";
import {
  analyticsBucketCount,
  analyticsGroupAvailable,
  buildAnalyticsBuckets,
  buildAnalyticsModel,
  makeAnalyticsRange,
  previousAnalyticsRange,
  resolveAnalyticsRange,
} from "./analytics";

const stamps = { createdAt: new Date("2026-11-01T12:00:00"), updatedAt: new Date("2026-11-01T12:00:00") };

function transaction(
  id: number,
  date: string,
  amountRub: number,
  patch: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    userId: 1,
    operationDate: date,
    type: "Расход",
    category: "Еда",
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

const options = {
  kind: "expense" as const,
  period: "custom" as const,
  group: "day" as const,
  customStart: "2026-11-01",
  customEnd: "2026-11-30",
  today: "2026-11-04",
};

describe("финансовая аналитика", () => {
  it("исключает обмены и будущее, а иностранную валюту считает по исторической сумме в рублях", () => {
    const model = buildAnalyticsModel([
      transaction(1, "2026-11-01", -1500),
      transaction(2, "2026-11-02", 8000, { currency: "USD", originalAmount: 100, exchangeRate: 80 }),
      transaction(3, "2026-11-03", 999, { type: "Обмен", category: "Обмен валюты" }),
      transaction(4, "2026-11-05", 700),
      transaction(5, "2026-11-02", 4000, { type: "Доход", category: "Зарплата" }),
    ], options);
    expect(model.total).toBe(9500);
    expect(model.count).toBe(2);
    expect(model.average).toBe(4750);
    expect(model.transactions.map((item) => item.id)).toEqual([2, 1]);
  });

  it("строит непрерывные дни с нулевыми промежутками", () => {
    const range = makeAnalyticsRange("2026-11-02", "2026-11-10");
    const buckets = buildAnalyticsBuckets([
      transaction(1, "2026-11-02", 100),
      transaction(2, "2026-11-04", 50),
      transaction(3, "2026-11-10", 200),
    ], range, "day");
    expect(buckets).toHaveLength(9);
    expect(buckets.map((item) => item.total)).toEqual([100, 0, 50, 0, 0, 0, 0, 0, 200]);
    expect(buckets.map((item) => item.count)).toEqual([1, 0, 1, 0, 0, 0, 0, 0, 1]);
  });

  it("группирует недели с понедельника и месяцы, сохраняя пустые интервалы", () => {
    const weeks = buildAnalyticsBuckets([
      transaction(1, "2026-11-02", 100),
      transaction(2, "2026-11-04", 50),
      transaction(3, "2026-11-10", 200),
    ], makeAnalyticsRange("2026-11-02", "2026-11-16"), "week");
    expect(weeks.map((item) => item.key)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(weeks.map((item) => item.total)).toEqual([150, 200, 0]);

    const months = buildAnalyticsBuckets([
      transaction(1, "2026-10-15", 100),
      transaction(2, "2026-12-02", 50),
    ], makeAnalyticsRange("2026-10-01", "2026-12-31"), "month");
    expect(months.map((item) => item.key)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(months.map((item) => item.total)).toEqual([100, 0, 50]);
  });

  it("считает доли, средний чек, количество и последнюю дату категории", () => {
    const model = buildAnalyticsModel([
      transaction(1, "2026-11-01", 100, { category: " Еда " }),
      transaction(2, "2026-11-03", 300, { category: "еда" }),
      transaction(3, "2026-11-02", 600, { category: "Транспорт" }),
    ], options);
    expect(model.categories.map((item) => item.name)).toEqual(["Транспорт", "Еда"]);
    const food = model.categories[1];
    expect(food.total).toBe(400);
    expect(food.share).toBe(40);
    expect(food.count).toBe(2);
    expect(food.average).toBe(200);
    expect(food.latestDate).toBe("2026-11-03");
    expect(food.transactions.map((item) => item.id)).toEqual([2, 1]);
  });

  it("нормализует обратный произвольный диапазон и календарные пресеты", () => {
    expect(makeAnalyticsRange("2026-11-10", "2026-11-01")).toEqual({ start: "2026-11-01", end: "2026-11-10", days: 10 });
    expect(resolveAnalyticsRange("6m", [], "2026-11-04")).toEqual({ start: "2026-06-01", end: "2026-11-04", days: 157 });
    expect(resolveAnalyticsRange("month", [], "2026-11-04").start).toBe("2026-11-01");
  });

  it("сравнивает с непосредственно предыдущим периодом той же длительности", () => {
    const range = makeAnalyticsRange("2026-11-01", "2026-11-10");
    expect(previousAnalyticsRange(range)).toEqual({ start: "2026-10-22", end: "2026-10-31", days: 10 });
    const model = buildAnalyticsModel([
      transaction(1, "2026-11-04", 100),
      transaction(2, "2026-10-25", 50),
    ], { ...options, customEnd: "2026-11-10" });
    expect(model.previousTotal).toBe(50);
    expect(model.change).toBe(50);
    expect(model.changePercent).toBe(100);
    expect(model.previousCount).toBe(1);
  });

  it("не показывает бесконечный процент при нулевой базе", () => {
    const model = buildAnalyticsModel([transaction(1, "2026-11-04", 100)], options);
    expect(model.previousTotal).toBe(0);
    expect(model.changePercent).toBeNull();
    expect(model.change).toBe(100);
  });

  it("корректно обрабатывает пустую базу и режим всего времени", () => {
    const empty = buildAnalyticsModel([], { ...options, period: "all" });
    expect(empty.range).toEqual({ start: "2026-11-04", end: "2026-11-04", days: 1 });
    expect(empty.total).toBe(0);
    expect(empty.categories).toEqual([]);
    expect(empty.buckets.map((item) => item.total)).toEqual([0]);

    const all = resolveAnalyticsRange("all", [
      transaction(1, "2025-02-03", 100),
      transaction(2, "2027-01-01", 200),
    ], "2026-11-04");
    expect(all.start).toBe("2025-02-03");
    expect(all.end).toBe("2026-11-04");
  });

  it("ограничивает чрезмерно подробную группировку длинных диапазонов", () => {
    const range = makeAnalyticsRange("2025-01-01", "2026-11-04");
    expect(analyticsBucketCount(range, "day")).toBeGreaterThan(500);
    expect(analyticsGroupAvailable(range, "day")).toBe(false);
    expect(analyticsGroupAvailable(range, "month")).toBe(true);
    expect(() => buildAnalyticsBuckets([], range, "day")).toThrow(RangeError);
  });
});
