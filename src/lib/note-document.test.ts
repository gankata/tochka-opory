import { describe, expect, it } from "vitest";
import { collectNoteLinkIds, noteDocumentToMarkdown } from "./note-document";

const document = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Поездка" }] },
    { type: "paragraph", content: [
      { type: "text", text: "Важная мысль", marks: [{ type: "bold" }] },
      { type: "text", text: " и " },
      { type: "noteLink", attrs: { noteId: 42, title: "Маршрут" } },
    ] },
    { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Билеты" }] }] }] },
    { type: "image", attrs: { src: "/api/note-assets/7", alt: "Место" } },
  ],
};

describe("документ визуального редактора", () => {
  it("сохраняет форматирование, связи и изображения в Markdown", () => {
    const markdown = noteDocumentToMarkdown(document);
    expect(markdown).toContain("## Поездка");
    expect(markdown).toContain("**Важная мысль** и [[Маршрут]]");
    expect(markdown).toContain("- [x] Билеты");
    expect(markdown).toContain("![Место](/api/note-assets/7)");
  });

  it("находит внутренние ссылки для панели обратных ссылок", () => {
    expect(collectNoteLinkIds(document)).toEqual([42]);
    expect(collectNoteLinkIds(null)).toEqual([]);
  });
});
