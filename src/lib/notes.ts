import type { Note } from "@/types";
import type { WishlistItem } from "@contracts/notes";

export type NoteTreeNode = { note: Note; children: NoteTreeNode[] };

export function buildNoteTree(notes: Note[], parentId: number | null = null, seen = new Set<number>()): NoteTreeNode[] {
  return notes
    .filter((note) => note.parentId === parentId && !seen.has(note.id))
    .map((note) => {
      const nextSeen = new Set(seen).add(note.id);
      return { note, children: buildNoteTree(notes, note.id, nextSeen) };
    });
}

export function flattenNoteTree(nodes: NoteTreeNode[]): Note[] {
  return nodes.flatMap(({ note, children }) => [note, ...flattenNoteTree(children)]);
}

export function wishlistStats(items: WishlistItem[]) {
  const completed = items.filter((item) => item.done).length;
  const remainingCost = items.reduce((sum, item) => sum + (!item.done ? item.price ?? 0 : 0), 0);
  return { completed, total: items.length, remainingCost };
}

export function noteToMarkdown(note: Pick<Note, "title" | "content" | "kind" | "items">) {
  const parts = [`# ${note.title}`];
  if (note.content.trim()) parts.push(note.content.trim());
  if (note.kind === "wishlist") {
    parts.push("## Список желаний");
    if (!note.items.length) parts.push("Список пока пуст.");
    for (const item of note.items) {
      const details = [
        item.price != null ? `${new Intl.NumberFormat("ru-RU").format(item.price)} ₽` : null,
        item.url,
        item.note,
      ].filter(Boolean).join(" · ");
      parts.push(`- [${item.done ? "x" : " "}] ${item.title}${details ? ` — ${details}` : ""}`);
    }
  }
  return `${parts.join("\n\n")}\n`;
}

export function notesToMarkdown(notes: Note[]) {
  return notes.map(noteToMarkdown).join("\n---\n\n");
}

export function noteFilename(title: string, extension: string) {
  const safe = title.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").slice(0, 100) || "Заметка";
  return `${safe}.${extension}`;
}
