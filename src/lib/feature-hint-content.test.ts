import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { featureHintContent, getFeatureHintText } from "./feature-hint-content";

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [target] : [];
  });
}

describe("feature hint content", () => {
  it("gives every literal page and section title a separate practical hint", () => {
    const roots = ["src/pages", "src/components/app", "src/components/notes"].map((directory) => path.resolve(directory));
    const missing: string[] = [];

    for (const file of roots.flatMap(sourceFiles)) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          if (tag === "PageHeader" || tag === "Section") {
            const attributes = node.attributes.properties;
            const title = attributes.find((attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "title");
            const hint = attributes.some((attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "hint");
            if (title?.initializer && ts.isStringLiteral(title.initializer) && !hint && !getFeatureHintText(title.initializer.text)) {
              missing.push(`${path.relative(process.cwd(), file)}: ${title.initializer.text}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(missing).toEqual([]);
  });

  it("does not fall back to an unknown title or a visible description", () => {
    expect(getFeatureHintText("Несуществующий блок")).toBeUndefined();
    expect(getFeatureHintText("Календарь")).not.toBe("Цветная отметка и число показывают среднее настроение за день. Нажатие фильтрует записи.");
    expect(getFeatureHintText("Календарь")).toContain("Все дни");
    expect(getFeatureHintText("Календарь")).toContain("Стрелки");
  });

  it("covers dynamic headings", () => {
    expect(getFeatureHintText("Годовая карта · 2026")).toContain("Нажмите на клетку");
    expect(getFeatureHintText("Зарплата сегодня")).toContain("Нажмите на дату выплаты");
    expect(getFeatureHintText("До зарплаты: 12 дн.")).toBe(getFeatureHintText("Зарплата сегодня"));
    expect(getFeatureHintText("Динамика расходов")).toContain("«График» и «Таблицу»");
    expect(getFeatureHintText("Динамика доходов")).toBe(getFeatureHintText("Динамика расходов"));
  });

  it("keeps catalog entries substantial and distinct", () => {
    const hints = Object.values(featureHintContent);
    expect(hints.length).toBeGreaterThanOrEqual(50);
    expect(new Set(hints).size).toBe(hints.length);
    for (const hint of hints) {
      expect(hint.length).toBeGreaterThan(100);
      expect(hint).toMatch(/[.!?]$/);
    }
  });
});
