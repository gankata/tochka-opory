import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileText, Link2, LoaderCircle, Plus, Save, Tag } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { Note } from "@/types";
import type { NoteDocument, WishlistItem } from "@contracts/notes";
import { trpc } from "@/providers/trpc";
import { formatDateTime } from "@/lib/utils-app";
import { collectNoteLinkIds } from "@/lib/note-text";
import { createUuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { DeleteButton, Field } from "@/components/app/Common";
import RichTextEditor from "./RichTextEditor";
import WishlistEditor from "./WishlistEditor";

export type NoteDraft = {
  title: string;
  content: string;
  document: NoteDocument | null;
  items: WishlistItem[];
  tags: string[];
  relatedLinks: Note["relatedLinks"];
  parentId: number | null;
  sortOrder: number;
};
const serialize = (draft: NoteDraft) => JSON.stringify(draft);

export default function NoteEditor({ note, notes, folders, onDelete, onExportMarkdown, onExportPdf, onNavigate }: {
  note: Note;
  notes: Note[];
  folders: Note[];
  onDelete: (id: number) => void;
  onExportMarkdown: (note: Note) => void;
  onExportPdf: (note: Note) => void;
  onNavigate: (id: number) => void;
}) {
  const [draft, setDraft] = useState<NoteDraft>({
    title: note.title, content: note.content, document: note.document ?? null,
    items: note.items, tags: note.tags ?? [], relatedLinks: note.relatedLinks ?? [], parentId: note.parentId, sortOrder: note.sortOrder,
  });
  const [tagsText, setTagsText] = useState((note.tags ?? []).join(", "));
  const [relatedSection, setRelatedSection] = useState<"operations" | "analytics" | "plan" | "calendar" | "mood">("operations");
  const navigate = useNavigate();
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [savedAt, setSavedAt] = useState(note.updatedAt);
  const draftRef = useRef(draft);
  const lastSaved = useRef(serialize(draft));
  const queue = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);
  const saveRef = useRef<(value: NoteDraft) => void>(() => undefined);
  const utils = trpc.useUtils();
  const update = trpc.workspace.noteUpdate.useMutation();
  const backlinks = useMemo(() => notes.filter((candidate) => candidate.id !== note.id && (
    collectNoteLinkIds(candidate.document).includes(note.id) ||
    (!candidate.document && candidate.content.includes(`[[${note.title}]]`))
  )), [notes, note.id, note.title]);

  const save = (value: NoteDraft) => {
    const snapshot = serialize(value);
    if (snapshot === lastSaved.current) return;
    if (!value.title.trim()) { if (mounted.current) setStatus("error"); return; }
    if (mounted.current) setStatus("saving");
    queue.current = queue.current.catch(() => undefined).then(async () => {
      await update.mutateAsync({ id: note.id, ...value, title: value.title.trim() });
      lastSaved.current = snapshot;
      if (mounted.current) setSavedAt(new Date());
      await utils.workspace.get.invalidate();
      if (mounted.current && serialize(draftRef.current) === snapshot) setStatus("saved");
    }).catch(() => {
      if (mounted.current) setStatus("error");
      toast.error("Не удалось сохранить. Изменения остались в редакторе — нажмите «Сохранить».");
    });
  };

  useEffect(() => {
    draftRef.current = draft;
    saveRef.current = save;
  });

  useEffect(() => {
    if (serialize(draft) === lastSaved.current || !draft.title.trim()) return;
    const timer = setTimeout(() => saveRef.current(draft), 800);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    mounted.current = true;
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveRef.current(draftRef.current);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => {
      mounted.current = false;
      window.removeEventListener("keydown", keyboard);
      if (serialize(draftRef.current) !== lastSaved.current) saveRef.current(draftRef.current);
    };
  }, []);

  const exportedNote: Note = { ...note, ...draft, title: draft.title.trim() || note.title };

  return <section className="surface min-w-0 overflow-hidden">
    <div className="border-b p-4 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <input aria-label="Название страницы" className="editorial min-h-12 w-full bg-transparent text-2xl font-semibold outline-none sm:text-3xl" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Название" />
          <div className={`mt-1 flex min-h-5 items-center gap-2 text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
            {status === "saving" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : status === "saved" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
            {status === "saving" ? "Сохранение…" : status === "saved" ? `Сохранено · ${formatDateTime(savedAt)}` : "Есть несохранённые изменения. Проверьте название и нажмите «Сохранить»."}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" className="min-h-11 gap-2" onClick={() => save(draft)}><Save className="h-4 w-4" />Сохранить</Button>
          <Button type="button" variant="ghost" className="min-h-11 gap-2" onClick={() => onExportMarkdown(exportedNote)}><Download className="h-4 w-4" />Markdown</Button>
          <Button type="button" variant="ghost" className="min-h-11 gap-2" onClick={() => onExportPdf(exportedNote)}><FileText className="h-4 w-4" />PDF</Button>
          <DeleteButton label={note.kind === "folder" ? "Удалить папку со всеми вложениями" : "Удалить страницу"} onConfirm={() => onDelete(note.id)} />
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Расположение"><select aria-label="Родительская папка" className="field" value={draft.parentId ?? ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value ? Number(event.target.value) : null })}><option value="">В корне библиотеки</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.title}</option>)}</select></Field><Field label="Метки через запятую"><input className="field" value={tagsText} onChange={(event) => { setTagsText(event.target.value); setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30) }); }} placeholder="поездка, идеи" /></Field></div>
      <div className="mt-4 rounded-xl bg-secondary/35 p-4"><div className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4 text-primary" />Связи с разделами</div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><select aria-label="Раздел для связи" className="field" value={relatedSection} onChange={(event) => setRelatedSection(event.target.value as typeof relatedSection)}><option value="operations">Операции</option><option value="analytics">Аналитика</option><option value="plan">План</option><option value="calendar">Календарь</option><option value="mood">Настроение</option></select><Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => { const labels = { operations: "Операции", analytics: "Аналитика", plan: "План", calendar: "Календарь", mood: "Настроение" }; setDraft({ ...draft, relatedLinks: [...draft.relatedLinks, { id: createUuid(), section: relatedSection, label: labels[relatedSection], targetId: null }] }); }}><Plus className="h-4 w-4" />Связать</Button></div>{draft.relatedLinks.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{draft.relatedLinks.map((link) => <span key={link.id} className="inline-flex items-center rounded-lg bg-card text-sm"><button type="button" className="min-h-10 px-3 text-primary" onClick={() => navigate(`/${link.section}${link.targetId ? `?focus=${link.targetId}` : ""}`)}>{link.label}</button><button type="button" className="min-h-10 px-2 text-muted-foreground" aria-label={`Удалить связь ${link.label}`} onClick={() => setDraft({ ...draft, relatedLinks: draft.relatedLinks.filter((item) => item.id !== link.id) })}>×</button></span>)}</div>}</div>
      {draft.tags.length > 0 && <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Tag className="h-3.5 w-3.5" />{draft.tags.join(" · ")}</div>}
    </div>

    {note.kind === "folder" ? <div className="p-6 sm:p-8"><h2 className="text-lg font-semibold">Папка библиотеки</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Перемещайте сюда заметки и вишлисты через поле «Расположение» на каждой странице. При удалении папки удаляются и все её вложения — перед этим приложение попросит подтверждение.</p></div> : <>
      {note.kind === "wishlist" && <div className="border-b p-4 sm:p-5"><WishlistEditor items={draft.items} onChange={(items) => setDraft({ ...draft, items })} /></div>}
      <RichTextEditor note={note} notes={notes} onNavigate={onNavigate} onChange={({ content, document }) => setDraft((current) => ({ ...current, content, document }))} />
      <div className="border-t p-5 sm:px-8">
        <h2 className="text-sm font-semibold">Обратные ссылки</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Заметки, которые ссылаются на эту страницу через [[название]].</p>
        {backlinks.length ? <div className="mt-3 flex flex-wrap gap-2">{backlinks.map((linked) => <button key={linked.id} type="button" className="min-h-11 rounded-lg bg-secondary px-3 text-sm text-secondary-foreground transition-colors hover:bg-accent" onClick={() => onNavigate(linked.id)}>{linked.title}</button>)}</div> : <p className="mt-3 text-sm text-muted-foreground">Пока нет входящих ссылок.</p>}
      </div>
    </>}
  </section>;
}
