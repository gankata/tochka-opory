import { describe, expect, it } from "vitest";
import { applyCategoryRules, transactionFingerprint, type ImportRule } from "./transaction-import";

const base = {
  operationDate: "2026-11-04",
  type: "Расход" as const,
  category: "Импорт",
  amountRub: 1234.56,
  currency: "RUB",
  originalAmount: 1234.56,
  exchangeRate: 1,
  note: "Кофе с собой",
  source: "Кофейня",
};
const rule = (patch: Partial<ImportRule>): ImportRule => ({
  id: 1, matchField: "any", pattern: "кофе", operationType: "Любой", category: "Кафе", priority: 100, enabled: true, ...patch,
});

describe("правила и дедупликация импорта", () => {
  it("применяет первое подходящее правило по приоритету без изменения исходной строки", () => {
    const result = applyCategoryRules(base, [rule({ id: 2, priority: 20, category: "Прочее" }), rule({ priority: 10 })]);
    expect(result.category).toBe("Кафе");
    expect(base.category).toBe("Импорт");
  });
  it("учитывает тип, поле и выключенные правила", () => {
    expect(applyCategoryRules(base, [rule({ operationType: "Доход" })]).category).toBe("Импорт");
    expect(applyCategoryRules(base, [rule({ matchField: "category" })]).category).toBe("Импорт");
    expect(applyCategoryRules(base, [rule({ enabled: false })]).category).toBe("Импорт");
  });
  it("стабильно определяет дубликаты с учётом округления и регистра текста", () => {
    expect(transactionFingerprint(base)).toBe(transactionFingerprint({ ...base, amountRub: 1234.559, source: " КОФЕЙНЯ " }));
    expect(transactionFingerprint(base)).not.toBe(transactionFingerprint({ ...base, operationDate: "2026-11-05" }));
  });
});
