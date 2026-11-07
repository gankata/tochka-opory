import { describe, expect, test } from "vitest";
import { createRulePack, parseRulePack, type CategoryRule } from "./rule-pack";

const rule: CategoryRule = { name: "Кофейни", matchField: "any", pattern: "coffee", operationType: "Расход", category: "Кафе", priority: 10, enabled: true };

describe("безопасные пакеты правил", () => {
  test("сохраняют только декларативные поля", () => {
    const parsed = parseRulePack(JSON.stringify(createRulePack([rule])));
    expect(parsed).toEqual([rule]);
  });
  test("отклоняют неверную версию и поля", () => {
    expect(() => parseRulePack(JSON.stringify({ format: "tochka-opory.rules", version: 2, rules: [rule] }))).toThrow();
    expect(() => parseRulePack(JSON.stringify(createRulePack([{ ...rule, priority: -1 }])))).toThrow(/приоритет/);
  });
});
