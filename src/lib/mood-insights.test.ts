import { describe, expect, it } from "vitest";
import { moodByWeekday, pearsonCorrelation } from "./mood-insights";

describe("наблюдения дневника", () => {
  it("считает среднее по дням недели и размер выборки", () => {
    const entries = [{ entryDate: "2026-11-02", mood: 4 }, { entryDate: "2026-11-09", mood: 8 }, { entryDate: "2026-11-03", mood: 6 }] as never;
    expect(moodByWeekday(entries)[0]).toMatchObject({ average: 6, count: 2 });
    expect(moodByWeekday(entries)[1]).toMatchObject({ average: 6, count: 1 });
  });
  it("не выдаёт корреляцию при малой или постоянной выборке", () => {
    expect(pearsonCorrelation([[1, 2], [2, 4]])).toBeNull();
    expect(pearsonCorrelation([[1, 1], [1, 2], [1, 3]])).toBeNull();
    expect(pearsonCorrelation([[1, 2], [2, 4], [3, 6]])).toBe(1);
  });
});
