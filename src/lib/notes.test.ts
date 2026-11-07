import { describe, expect, it } from "vitest";
import type { Note } from "@/types";
import { buildNoteTree, flattenNoteTree, noteFilename, noteToMarkdown, wishlistStats } from "./notes";

function note(id: number, parentId: number | null, kind: Note["kind"] = "note"): Note {
  return {
    id, userId: 1, parentId, kind, title: `Страница ${id}`, content: kind === "note" ? `**Текст ${id}**` : "", document: null,
    items: kind === "wishlist" ? [
      { id: "a", title: "Книга", url: "https://example.com/book", price: 1200, priority: "normal", done: false, note: null },
      { id: "b", title: "Курс", url: null, price: 3000, priority: "high", done: true, note: null },
    ] : [],
    tags: [], relatedLinks: [], sortOrder: id, createdAt: new Date("2026-11-03T12:00:00Z"), updatedAt: new Date("2026-11-03T12:00:00Z"),
  };
}

describe("библиотека заметок", () => {
  it("строит вложенное дерево и не зацикливается на повреждённой связи", () => {
    const cyclic = note(4, 4);
    const tree = buildNoteTree([note(2, 1), note(1, null, "folder"), note(3, 1, "wishlist"), cyclic]);
    expect(tree.map(({ note: item }) => item.id)).toEqual([1]);
    expect(flattenNoteTree(tree).map((item) => item.id)).toEqual([1, 2, 3]);
    expect(flattenNoteTree(buildNoteTree([cyclic]))).toEqual([]);
  });

  it("считает только стоимость неисполненных желаний", () => {
    expect(wishlistStats(note(3, null, "wishlist").items)).toEqual({ completed: 1, total: 2, remainingCost: 1200 });
  });

  it("экспортирует содержимое и чек-лист в Markdown", () => {
    const result = noteToMarkdown(note(3, null, "wishlist"));
    expect(result).toContain("# Страница 3");
    expect(result).toContain("- [ ] Книга — 1\u00a0200 ₽ · https://example.com/book");
    expect(result).toContain("- [x] Курс");
    expect(noteFilename("Поездка: июль/2027", "md")).toBe("Поездка- июль-2027.md");
  });
});
