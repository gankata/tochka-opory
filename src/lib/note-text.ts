import type { JSONContent } from "@tiptap/core";
import type { NoteDocument } from "@contracts/notes";

export function noteDocumentToPlainText(document: NoteDocument | null | undefined, legacyContent = "") {
  if (!document) return legacyContent;
  const visit = (node: JSONContent): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "noteLink") return `[[${String(node.attrs?.title ?? "Заметка")}]]`;
    if (node.type === "image") return String(node.attrs?.alt ?? "Изображение");
    if (node.type === "hardBreak") return "\n";
    const separator = node.type === "paragraph" || node.type === "heading" || node.type === "listItem" ? "\n" : " ";
    return (node.content ?? []).map(visit).filter(Boolean).join(separator);
  };
  return ((document as JSONContent).content ?? []).map(visit).filter(Boolean).join("\n");
}

export function collectNoteLinkIds(document: NoteDocument | null | undefined): number[] {
  const ids = new Set<number>();
  const visit = (node: JSONContent) => {
    if (node.type === "noteLink") {
      const id = Number(node.attrs?.noteId);
      if (Number.isInteger(id) && id > 0) ids.add(id);
    }
    for (const child of node.content ?? []) visit(child);
  };
  if (document) visit(document as JSONContent);
  return [...ids];
}
