import { describe, expect, it } from "vitest";
import type { Workspace } from "@/types";
import { buildGlobalSearchIndex, normalizeSearchText, searchWorkspace } from "./global-search";

const stamps = { createdAt: new Date("2026-11-01T12:00:00"), updatedAt: new Date("2026-11-01T12:00:00") };

function workspace(patch: Partial<Workspace> = {}): Workspace {
  return {
    settings: {
      id: 1, userId: 1, startDate: "2026-01-01", cashRub: 0, cardRub: 0,
      cashUsd: 0, usdRate: 80, reserveMonths: 3, salaryDay: 15, secondSalaryDay: null, incomeSchedule: "twice", mode: "Обычный",
      savingPercent: 30, trackingDays: 14, incomeStrategy: "Худший месяц", statsMonths: 6,
      walletDays: 3, largeExpenseThreshold: 10000, currencyRates: {}, currencyBalances: {}, ...stamps,
    },
    transactions: [], payments: [], envelopes: [], goals: [], moods: [], options: [], notes: [],
    reminders: [], reconciliations: [], ...patch,
  };
}

const data = workspace({
  transactions: [{
    id: 7, userId: 1, operationDate: "2026-11-04", type: "Расход", category: "Кафе",
    amountRub: 1200.5, amountUsd: null, currency: "RUB", originalAmount: 1200.5,
    exchangeRate: 1, note: "Завтрак с Еленой", source: "Тест", importBatchId: null, externalId: null, clientId: null, ...stamps,
  }],
  notes: [{
    id: 3, userId: 1, parentId: null, kind: "note", title: "План поездки", content: "",
    document: { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "Важная мысль про маршрут" }] },
      { type: "paragraph", content: [{ type: "noteLink", attrs: { noteId: 8, title: "Список вещей" } }] },
    ] }, items: [], tags: [], relatedLinks: [], sortOrder: 0, ...stamps,
  }, {
    id: 4, userId: 1, parentId: null, kind: "wishlist", title: "Подарки", content: "",
    document: null, items: [{ id: "wish-1", title: "Рисовальные принадлежности", url: "https://example.com", price: 2500, priority: "normal", done: false, note: "Для творчества" }], tags: [], relatedLinks: [], sortOrder: 1, ...stamps,
  }],
  moods: [{
    id: 9, userId: 1, entryDate: "2026-11-03", timeOfDay: "Вечер", mood: 7, emotion: "Вдохновение",
    intensity: 6, topic: "Поездка", situation: "Собрал рюкзак", thoughts: null, body: null,
    coping: null, energy: 8, sleepHours: 7.5, therapyNotes: null, ...stamps,
  }],
});

describe("глобальный поиск", () => {
  it("нормализует русский регистр и букву ё", () => {
    expect(normalizeSearchText("  Ёлка   НОВАЯ ")).toBe("елка новая");
    expect(searchWorkspace(data, "ЗАВТРАК еленой").map((item) => item.id)).toContain("transaction-7");
  });

  it("находит операцию по сумме и дате в привычных форматах", () => {
    expect(searchWorkspace(data, "1 200,50").some((item) => item.id === "transaction-7")).toBe(true);
    expect(searchWorkspace(data, "04.11.2026").some((item) => item.id === "transaction-7")).toBe(true);
    expect(searchWorkspace(data, "4 ноября").some((item) => item.id === "transaction-7")).toBe(true);
  });

  it("ищет текст rich text, внутренние ссылки и желания, а не JSON-разметку", () => {
    expect(searchWorkspace(data, "мысль маршрут").map((item) => item.id)).toContain("note-3");
    expect(searchWorkspace(data, "[[Список вещей]]").map((item) => item.id)).toContain("note-3");
    expect(searchWorkspace(data, "рисовальные творчества").map((item) => item.id)).toContain("wish-4-wish-1");
    expect(buildGlobalSearchIndex(data).find((item) => item.id === "note-3")?.searchText).not.toContain('"type":"paragraph"');
  });

  it("находит настроение и настройки, а пустой запрос показывает недавние записи", () => {
    expect(searchWorkspace(data, "вдохновение рюкзак").map((item) => item.id)).toContain("mood-9");
    expect(searchWorkspace(data, "пароль").map((item) => item.id)).toContain("section-settings");
    const recent = searchWorkspace(data, "");
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.every((item) => item.category !== "sections")).toBe(true);
    expect(recent[0].timestamp).toBeGreaterThanOrEqual(recent.at(-1)?.timestamp ?? 0);
  });
});
