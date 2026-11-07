import { useMemo } from "react";
import type { NoteDocument } from "@contracts/notes";
import { noteDocumentToHtml } from "@/lib/note-document";

export default function RichTextView({ document, content }: { document?: NoteDocument | null; content: string }) {
  const html = useMemo(() => noteDocumentToHtml(document, content), [document, content]);
  if (!html) return <p className="text-muted-foreground">Пустая страница.</p>;
  return <div className="markdown-view rich-document break-words text-[16px] leading-7" dangerouslySetInnerHTML={{ __html: html }} />;
}
