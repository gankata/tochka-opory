import DOMPurify from "dompurify";
import { marked } from "marked";
import { generateHTML, type JSONContent } from "@tiptap/core";
import type { NoteDocument } from "@contracts/notes";
import { createNoteExtensions } from "@/components/notes/note-extensions";

export function legacyMarkdownToHtml(content: string) {
  if (!content.trim()) return "";
  return DOMPurify.sanitize(marked.parse(content, { async: false, gfm: true, breaks: true }));
}

export function noteDocumentToHtml(document: NoteDocument | null | undefined, legacyContent = "") {
  const html = document
    ? generateHTML(document as JSONContent, createNoteExtensions())
    : legacyMarkdownToHtml(legacyContent);
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/([`*_{}[\]<>])/g, "\\$1");
}

function safeUrl(value: unknown) {
  if (typeof value !== "string") return "";
  if (value.startsWith("/api/note-assets/")) return value;
  try {
    const url = new URL(value);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? value : "";
  } catch {
    return "";
  }
}

function inlineMarkdown(node: JSONContent): string {
  if (node.type === "text") {
    let value = escapeText(node.text ?? "");
    for (const mark of node.marks ?? []) {
      if (mark.type === "code") value = `\`${value}\``;
      else if (mark.type === "bold") value = `**${value}**`;
      else if (mark.type === "italic") value = `*${value}*`;
      else if (mark.type === "strike") value = `~~${value}~~`;
      else if (mark.type === "link") {
        const href = safeUrl(mark.attrs?.href);
        if (href) value = `[${value}](${href.replace(/[()\s]/g, (char) => encodeURIComponent(char))})`;
      }
    }
    return value;
  }
  if (node.type === "noteLink") return `[[${String(node.attrs?.title ?? "Заметка").replace(/[[\]\n]/g, "")}]]`;
  if (node.type === "image") {
    const src = safeUrl(node.attrs?.src);
    return src ? `![${String(node.attrs?.alt ?? "Изображение").replace(/[[\]\n]/g, "")}](${src})` : "";
  }
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineMarkdown).join("");
}

function listItemText(node: JSONContent): string {
  return (node.content ?? []).map((child) => {
    if (child.type === "paragraph") return (child.content ?? []).map(inlineMarkdown).join("");
    return blockMarkdown(child).replace(/\n/g, "\n  ");
  }).join("\n  ");
}

function blockMarkdown(node: JSONContent): string {
  const children = node.content ?? [];
  if (node.type === "paragraph") return children.map(inlineMarkdown).join("");
  if (node.type === "heading") return `${"#".repeat(Math.min(3, Math.max(1, Number(node.attrs?.level ?? 1))))} ${children.map(inlineMarkdown).join("")}`;
  if (node.type === "bulletList") return children.map((child) => `- ${listItemText(child)}`).join("\n");
  if (node.type === "orderedList") return children.map((child, index) => `${Number(node.attrs?.start ?? 1) + index}. ${listItemText(child)}`).join("\n");
  if (node.type === "taskList") return children.map((child) => `- [${child.attrs?.checked ? "x" : " "}] ${listItemText(child)}`).join("\n");
  if (node.type === "blockquote") return children.map(blockMarkdown).join("\n\n").split("\n").map((line) => `> ${line}`).join("\n");
  if (node.type === "codeBlock") return `\`\`\`${String(node.attrs?.language ?? "")}\n${children.map((child) => child.text ?? "").join("")}\n\`\`\``;
  if (node.type === "horizontalRule") return "---";
  if (node.type === "image") return inlineMarkdown(node);
  return children.map(blockMarkdown).filter(Boolean).join("\n\n");
}

export function noteDocumentToMarkdown(document: NoteDocument | null | undefined, legacyContent = "") {
  if (!document) return legacyContent;
  return ((document as JSONContent).content ?? []).map(blockMarkdown).filter((part) => part.trim()).join("\n\n");
}

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
