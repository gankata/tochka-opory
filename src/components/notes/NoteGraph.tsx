import { useMemo } from "react";
import type { Note } from "@/types";
import { collectNoteLinkIds } from "@/lib/note-document";
import { EmptyState, Section } from "@/components/app/Common";

export default function NoteGraph({ notes, onSelect }: { notes: Note[]; onSelect: (id: number) => void }) {
  const model = useMemo(() => {
    const items = notes.filter((note) => note.kind !== "folder").slice(0, 60);
    const ids = new Set(items.map((note) => note.id));
    const positions = new Map(items.map((note, index) => {
      const angle = index / Math.max(1, items.length) * Math.PI * 2 - Math.PI / 2;
      const radius = items.length === 1 ? 0 : Math.min(165, 75 + items.length * 2);
      return [note.id, { x: 250 + Math.cos(angle) * radius, y: 220 + Math.sin(angle) * radius }];
    }));
    const edges = items.flatMap((note) => collectNoteLinkIds(note.document).filter((id) => ids.has(id)).map((target) => ({ source: note.id, target })));
    return { items, positions, edges };
  }, [notes]);
  return <Section title="Локальный граф связей" description="Показаны страницы и связи [[название]] внутри текущей библиотеки. Нажмите на узел, чтобы открыть заметку. При большом количестве страниц показаны первые 60.">
    {!model.items.length ? <EmptyState title="Граф появится после первой заметки" text="Связывайте страницы через [[название]] в редакторе." /> : <>
      <div className="overflow-hidden rounded-xl bg-secondary/25"><svg viewBox="0 0 500 440" className="h-auto max-h-[560px] w-full" role="img" aria-label={`Граф: ${model.items.length} заметок и ${model.edges.length} связей`}>
        {model.edges.map((edge, index) => { const source = model.positions.get(edge.source)!; const target = model.positions.get(edge.target)!; return <line key={`${edge.source}-${edge.target}-${index}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="oklch(var(--primary))" strokeOpacity="0.28" strokeWidth="1.5" />; })}
        {model.items.map((note) => { const position = model.positions.get(note.id)!; return <g key={note.id} transform={`translate(${position.x} ${position.y})`} role="button" tabIndex={0} aria-label={`Открыть ${note.title}`} className="cursor-pointer outline-none focus-visible:opacity-70" onClick={() => onSelect(note.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(note.id); } }}><circle r="13" fill={note.kind === "wishlist" ? "oklch(var(--chart-expense))" : "oklch(var(--primary))"} stroke="oklch(var(--card))" strokeWidth="4" /><title>{note.title}</title><text y="30" textAnchor="middle" fill="oklch(var(--foreground))" fontSize="10" fontFamily="Onest">{note.title.length > 18 ? `${note.title.slice(0, 17)}…` : note.title}</text></g>; })}
      </svg></div>
      <p className="mt-3 text-xs text-muted-foreground">Зелёные узлы — заметки, терракотовые — вишлисты. Линии направлены от страницы к той, на которую она ссылается.</p>
    </>}
  </Section>;
}
