import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { BookOpen, Download, FileJson, FileText, Network, Plus } from "lucide-react";
import { toast } from "sonner";
import type { NoteKind } from "@contracts/notes";
import { trpc } from "@/providers/trpc";
import { downloadBlob, todayISO } from "@/lib/utils-app";
import { buildNoteTree, flattenNoteTree, noteFilename, notesToMarkdown, noteToMarkdown } from "@/lib/notes";
import type { Note } from "@/types";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorPage, LoadingPage, PageHeader } from "@/components/app/Common";
import NoteTree from "@/components/notes/NoteTree";
import NoteEditor from "@/components/notes/NoteEditor";
import PrintNotes from "@/components/notes/PrintNotes";
import NoteGraph from "@/components/notes/NoteGraph";

export default function Notes() {
  const query = trpc.workspace.get.useQuery();
  const utils = trpc.useUtils();
  const create = trpc.workspace.noteCreate.useMutation();
  const remove = trpc.workspace.noteDelete.useMutation();
  const [searchParams] = useSearchParams();
  const requestedId = Number(searchParams.get("note"));
  const [selectedId, setSelectedId] = useState<number | null>(Number.isInteger(requestedId) && requestedId > 0 ? requestedId : null);
  const [printItems, setPrintItems] = useState<Note[] | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const data = query.data;

  /* Keep note links working when the palette navigates within this page. */
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (Number.isInteger(requestedId) && requestedId > 0) setSelectedId(requestedId); }, [requestedId]);

  useEffect(() => {
    if (!printItems) return;
    let cancelled = false;
    const finish = () => setPrintItems(null);
    window.addEventListener("afterprint", finish);
    const timer = setTimeout(async () => {
      const images = [...document.querySelectorAll<HTMLImageElement>(".print-document img")];
      await Promise.race([
        Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
        }))),
        new Promise<void>((resolve) => setTimeout(resolve, 8000)),
      ]);
      if (cancelled) return;
      toast.info("В системном диалоге выберите «Сохранить как PDF».");
      window.print();
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("afterprint", finish); };
  }, [printItems]);

  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !data) return <ErrorPage retry={() => query.refetch()} />;

  const selected = data.notes.find((note) => note.id === selectedId) ?? data.notes.find((note) => note.id === requestedId) ?? data.notes[0] ?? null;
  const ordered = flattenNoteTree(buildNoteTree(data.notes));
  const availableFolders = selected ? (() => {
    const forbidden = new Set([selected.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const note of data.notes) {
        if (note.parentId != null && forbidden.has(note.parentId) && !forbidden.has(note.id)) { forbidden.add(note.id); changed = true; }
      }
    }
    return data.notes.filter((note) => note.kind === "folder" && !forbidden.has(note.id));
  })() : [];

  const navigateTo = (id: number) => {
    setSelectedId(id);
    if (window.innerWidth < 1024) requestAnimationFrame(() => document.getElementById("note-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const createItem = async (kind: NoteKind) => {
    const title = kind === "folder" ? "Новая папка" : kind === "wishlist" ? "Мой вишлист" : "Новая заметка";
    try {
      const result = await create.mutateAsync({ parentId: null, kind, title, content: "", document: null, items: [], sortOrder: Math.max(0, ...data.notes.map((note) => note.sortOrder)) + 1 });
      await utils.workspace.get.invalidate();
      setSelectedId(result.id);
    } catch { toast.error("Не удалось создать запись"); }
  };
  const createTemplate = async (template: "daily" | "review" | "trip") => {
    const templates = {
      daily: { title: `День · ${todayISO()}`, content: "Что произошло\n\nЧто я чувствую\n\nБлагодарность", tags: ["дневник"] },
      review: { title: "Недельный обзор", content: "Главное за неделю\n\nДеньги: выводы\n\nСостояние: наблюдения\n\nФокус следующей недели", tags: ["обзор"] },
      trip: { title: "План поездки", content: "Маршрут\n\nБюджет\n\nСписок вещей\n\nДокументы и связь", tags: ["поездка"] },
    };
    const value = templates[template];
    const document = { type: "doc", content: value.content.split("\n\n").map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) };
    try {
      const result = await create.mutateAsync({ parentId: null, kind: "note", title: value.title, content: value.content, document, items: [], tags: value.tags, relatedLinks: template === "trip" ? [{ id: crypto.randomUUID(), section: "plan", label: "Бюджет поездки", targetId: null }] : [], sortOrder: Math.max(0, ...data.notes.map((note) => note.sortOrder)) + 1 });
      await utils.workspace.get.invalidate(); setSelectedId(result.id); setShowGraph(false); toast.success("Заметка создана по шаблону");
    } catch { toast.error("Не удалось создать заметку"); }
  };
  const deleteItem = async (id: number) => {
    try {
      await remove.mutateAsync({ id });
      await utils.workspace.get.invalidate();
      if (selectedId === id) setSelectedId(null);
      toast.success("Запись удалена");
    } catch { toast.error("Не удалось удалить запись"); }
  };
  const exportJson = () => {
    downloadBlob(JSON.stringify({ format: "tochka-opory-notes@2", exportedAt: new Date().toISOString(), notes: data.notes }, null, 2), `notes-${todayISO()}.json`, "application/json;charset=utf-8");
    toast.success("Структура и текст экспортированы в JSON. Изображения входят в полные копии раздела «Данные».");
  };
  const exportAllMarkdown = () => {
    if (!ordered.length) return;
    downloadBlob(notesToMarkdown(ordered), `notes-${todayISO()}.md`, "text/markdown;charset=utf-8");
    toast.success("Все страницы экспортированы в Markdown");
  };

  return <div className="page-enter">
    <PageHeader eyebrow="Личная база знаний" title="Заметки и желания" description="Пишите и форматируйте на одной странице, добавляйте изображения и связывайте мысли через [[название]]. Всё хранится локально и работает без интернета." action={<Button className="min-h-11 w-full gap-2 sm:w-auto" onClick={() => createItem("note")} disabled={create.isPending}><Plus className="h-4 w-4" />Новая заметка</Button>} />
    <div className="mb-5 flex flex-wrap gap-2 rounded-xl bg-secondary/55 p-2" aria-label="Экспорт библиотеки">
      <Button variant="ghost" className="min-h-11 gap-2" onClick={exportJson}><FileJson className="h-4 w-4" />Вся библиотека JSON</Button>
      <Button variant="ghost" className="min-h-11 gap-2" onClick={exportAllMarkdown} disabled={!ordered.length}><Download className="h-4 w-4" />Все страницы Markdown</Button>
      <Button variant="ghost" className="min-h-11 gap-2" onClick={() => setPrintItems(ordered)} disabled={!ordered.length}><FileText className="h-4 w-4" />Все страницы PDF</Button>
      <Button variant="ghost" className={`min-h-11 gap-2 ${showGraph ? "bg-card text-primary" : ""}`} aria-pressed={showGraph} onClick={() => setShowGraph(!showGraph)}><Network className="h-4 w-4" />{showGraph ? "Редактор" : "Граф связей"}</Button>
      <span className="mx-1 hidden w-px self-stretch bg-border sm:block" /><span className="flex items-center px-2 text-xs text-muted-foreground">Шаблоны:</span><Button variant="ghost" className="min-h-11" onClick={() => void createTemplate("daily")}>День</Button><Button variant="ghost" className="min-h-11" onClick={() => void createTemplate("review")}>Обзор недели</Button><Button variant="ghost" className="min-h-11" onClick={() => void createTemplate("trip")}>Поездка</Button>
    </div>
    {showGraph ? <NoteGraph notes={data.notes} onSelect={(id) => { navigateTo(id); setShowGraph(false); }} /> : <div className="grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <NoteTree notes={data.notes} selectedId={selected?.id ?? null} onSelect={navigateTo} onCreate={createItem} />
      <div id="note-editor" className="min-w-0 scroll-mt-24">{selected ? <NoteEditor key={selected.id} note={selected} notes={data.notes} folders={availableFolders} onNavigate={navigateTo} onDelete={deleteItem} onExportMarkdown={(note) => { downloadBlob(noteToMarkdown(note), noteFilename(note.title, "md"), "text/markdown;charset=utf-8"); toast.success("Markdown-файл скачан"); }} onExportPdf={(note) => setPrintItems([note])} /> : <EmptyState title="Ваша библиотека пока пуста" text="Создайте заметку для мыслей, папку для структуры или вишлист с ценами и ссылками." action={<Button className="min-h-11 gap-2" onClick={() => createItem("note")}><BookOpen className="h-4 w-4" />Создать первую заметку</Button>} />}</div>
    </div>}
    {printItems && <PrintNotes notes={printItems} />}
  </div>;
}
