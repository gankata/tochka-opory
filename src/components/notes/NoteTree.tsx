import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, Gift, Plus, Search } from "lucide-react";
import type { Note } from "@/types";
import type { NoteKind } from "@contracts/notes";
import { buildNoteTree, type NoteTreeNode } from "@/lib/notes";

const icons = { folder: Folder, note: FileText, wishlist: Gift };

export default function NoteTree({ notes, selectedId, onSelect, onCreate }: {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreate: (kind: NoteKind) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const tree = useMemo(() => buildNoteTree(notes), [notes]);
  const visible = useMemo(() => {
    if (!query.trim()) return null;
    const needle = query.trim().toLocaleLowerCase("ru");
    const matches = new Set(notes.filter((note) => [note.title, note.content, ...note.items.map((item) => item.title)]
      .join(" ").toLocaleLowerCase("ru").includes(needle)).map((note) => note.id));
    const byId = new Map(notes.map((note) => [note.id, note]));
    for (const id of [...matches]) {
      let current = byId.get(id);
      while (current?.parentId != null) {
        matches.add(current.parentId);
        current = byId.get(current.parentId);
      }
    }
    return matches;
  }, [notes, query]);

  const renderNodes = (nodes: NoteTreeNode[], depth = 0): React.ReactNode => nodes.map(({ note, children }) => {
    if (visible && !visible.has(note.id)) return null;
    const Icon = icons[note.kind];
    const isCollapsed = collapsed.has(note.id) && !visible;
    return <div key={note.id}>
      <div className={`group flex min-w-0 items-center rounded-lg transition-colors ${selectedId === note.id ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/55"}`} style={{ marginLeft: depth * 12 }}>
        {note.kind === "folder" && children.length ? <button type="button" className="flex h-11 w-8 shrink-0 items-center justify-center" aria-label={isCollapsed ? `Раскрыть ${note.title}` : `Скрыть ${note.title}`} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; })}>{isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : <span className="w-2 shrink-0" />}
        <button type="button" onClick={() => onSelect(note.id)} className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left text-sm">
          <Icon className={`h-4 w-4 shrink-0 ${note.kind === "folder" ? "text-primary" : "text-muted-foreground"}`} />
          <span className="truncate">{note.title}</span>
        </button>
      </div>
      {!isCollapsed && children.length > 0 && <div>{renderNodes(children, depth + 1)}</div>}
    </div>;
  });

  return <aside className="surface flex min-h-64 flex-col p-3 lg:min-h-[680px]">
    <div className="flex items-center justify-between px-2 py-1"><h2 className="text-sm font-semibold">Библиотека</h2><span className="text-xs text-muted-foreground">{notes.filter((note) => note.kind !== "folder").length}</span></div>
    <label className="relative mt-3 block"><span className="sr-only">Поиск по заметкам</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="field pl-9 pr-3 text-sm" placeholder="Найти…" /></label>
    <div className="mt-3 grid grid-cols-3 gap-1">
      <button type="button" onClick={() => onCreate("folder")} className="flex min-h-11 items-center justify-center gap-1 rounded-lg px-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Новая папка"><Folder className="h-4 w-4" /><span>Папка</span></button>
      <button type="button" onClick={() => onCreate("note")} className="flex min-h-11 items-center justify-center gap-1 rounded-lg px-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Новая заметка"><Plus className="h-4 w-4" /><span>Заметка</span></button>
      <button type="button" onClick={() => onCreate("wishlist")} className="flex min-h-11 items-center justify-center gap-1 rounded-lg px-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Новый вишлист"><Gift className="h-4 w-4" /><span>Желания</span></button>
    </div>
    <div className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto border-t pt-3">
      {tree.length ? renderNodes(tree) : <p className="px-3 py-6 text-center text-sm leading-relaxed text-muted-foreground">Создайте первую папку, заметку или вишлист.</p>}
      {visible && !visible.size && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Ничего не найдено.</p>}
    </div>
  </aside>;
}
