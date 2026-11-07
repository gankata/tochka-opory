import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import {
  Bold, Code2, CodeXml, Heading1, Heading2, ImagePlus, Italic, Link2,
  Link2Off, List, ListChecks, ListOrdered, LoaderCircle, Redo2, Strikethrough,
  TextQuote, Undo2, Unlink, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import type { NoteDocument } from "@contracts/notes";
import type { Note } from "@/types";
import { legacyMarkdownToHtml, noteDocumentToMarkdown } from "@/lib/note-document";
import { trpc } from "@/providers/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createNoteExtensions } from "./note-extensions";

const maxImageBytes = 8 * 1024 * 1024;
const supportedImages = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type WikiState = { query: string; from: number; to: number; left: number; top: number; active: number };

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}

function ToolbarButton({ label, icon: Icon, active = false, disabled = false, onClick }: {
  label: string;
  icon: LucideIcon;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return <Button type="button" variant="ghost" size="icon" className={`h-11 w-11 shrink-0 ${active ? "bg-secondary text-secondary-foreground" : ""}`} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon className="h-4 w-4" /></Button>;
}

export default function RichTextEditor({ note, notes, onChange, onNavigate }: {
  note: Note;
  notes: Note[];
  onChange: (value: { content: string; document: NoteDocument }) => void;
  onNavigate: (id: number) => void;
}) {
  const editorRef = useRef<Editor | null>(null);
  const onChangeRef = useRef(onChange);
  const [wiki, setWiki] = useState<WikiState | null>(null);
  const wikiRef = useRef<WikiState | null>(null);
  const candidatesRef = useRef<Note[]>([]);
  const chooseWikiRef = useRef<(candidate: Note) => void>(() => undefined);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [words, setWords] = useState(() => countWords(note.content));
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = trpc.workspace.noteAssetCreate.useMutation();

  useEffect(() => { onChangeRef.current = onChange; });
  useEffect(() => { wikiRef.current = wiki; }, [wiki]);

  const updateWiki = (instance: Editor) => {
    const { $from } = instance.state.selection;
    if (!$from.parent.isTextblock) { setWiki(null); return; }
    const from = Math.max($from.start(), $from.pos - 100);
    const before = instance.state.doc.textBetween(from, $from.pos, "\n", "\n");
    const match = /\[\[([^[\]\n]{0,100})$/.exec(before);
    if (!match) { setWiki(null); return; }
    const start = $from.pos - match[1].length - 2;
    const coords = instance.view.coordsAtPos($from.pos);
    setWiki((current) => ({
      query: match[1], from: start, to: $from.pos,
      left: Math.max(12, Math.min(coords.left, window.innerWidth - 332)),
      top: Math.min(coords.bottom + 8, window.innerHeight - 300),
      active: current?.query === match[1] ? current.active : 0,
    }));
  };

  const chooseWiki = (candidate: Note) => {
    const instance = editorRef.current;
    const current = wikiRef.current;
    if (!instance || !current) return;
    instance.chain().focus().deleteRange({ from: current.from, to: current.to }).insertContent([
      { type: "noteLink", attrs: { noteId: candidate.id, title: candidate.title } },
      { type: "text", text: " " },
    ]).run();
    setWiki(null);
  };
  chooseWikiRef.current = chooseWiki;

  const insertFiles = async (files: File[]) => {
    const instance = editorRef.current;
    if (!instance || !files.length) return;
    let inserted = 0;
    for (const file of files) {
      if (!supportedImages.has(file.type)) { toast.error(`«${file.name}»: поддерживаются PNG, JPEG, WebP и GIF`); continue; }
      if (file.size > maxImageBytes) { toast.error(`«${file.name}» больше 8 МБ`); continue; }
      try {
        const data = await fileToBase64(file);
        const asset = await upload.mutateAsync({ noteId: note.id, name: file.name || "Изображение", mime: file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data });
        instance.chain().focus().setImage({ src: asset.url, alt: file.name.replace(/\.[^.]+$/, "") || "Изображение" }).run();
        inserted++;
      } catch {
        toast.error(`Не удалось сохранить «${file.name}». Попробуйте ещё раз.`);
      }
    }
    if (inserted) toast.success(inserted === 1 ? "Изображение добавлено и сохранено в базе" : `Добавлено изображений: ${inserted}`);
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [...createNoteExtensions(), Placeholder.configure({ placeholder: "Начните писать… Введите [[, чтобы связать заметки" })],
    content: (note.document ?? legacyMarkdownToHtml(note.content)) as JSONContent | string,
    editorProps: {
      attributes: { "aria-label": "Текст заметки", class: "note-prose" },
      handleKeyDown: (_view, event) => {
        const current = wikiRef.current;
        if (!current) return false;
        if (event.key === "Escape") { setWiki(null); return true; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const length = candidatesRef.current.length;
          if (length) setWiki({ ...current, active: (current.active + (event.key === "ArrowDown" ? 1 : -1) + length) % length });
          return true;
        }
        if ((event.key === "Enter" || event.key === "Tab") && candidatesRef.current[current.active]) {
          event.preventDefault();
          chooseWikiRef.current(candidatesRef.current[current.active]);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])].filter((file) => file.type.startsWith("image/"));
        if (!files.length) return false;
        event.preventDefault();
        void insertFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: instance }) => {
      const document = instance.getJSON() as NoteDocument;
      onChangeRef.current({ document, content: noteDocumentToMarkdown(document) });
      setWords(countWords(instance.getText()));
      updateWiki(instance);
    },
    onSelectionUpdate: ({ editor: instance }) => updateWiki(instance),
  });
  editorRef.current = editor;

  const candidates = useMemo(() => {
    if (!wiki) return [];
    const needle = wiki.query.trim().toLocaleLowerCase("ru");
    return notes.filter((item) => item.kind !== "folder" && item.id !== note.id && item.title.toLocaleLowerCase("ru").includes(needle)).slice(0, 7);
  }, [notes, note.id, wiki]);
  candidatesRef.current = candidates;

  if (!editor) return <div className="flex min-h-80 items-center justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-primary" /><span className="sr-only">Загрузка редактора</span></div>;

  const openLink = () => {
    setLinkValue(String(editor.getAttributes("link").href ?? ""));
    setLinkOpen(true);
  };
  const applyLink = (event: FormEvent) => {
    event.preventDefault();
    let href = linkValue.trim();
    if (!href) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkOpen(false); return; }
    if (!/^(?:https?:\/\/|mailto:)/i.test(href)) href = `https://${href}`;
    try {
      const parsed = new URL(href);
      if (!["http:", "https:", "mailto:"].includes(parsed.protocol)) throw new Error("protocol");
    } catch { toast.error("Введите ссылку вида https://example.com"); return; }
    if (editor.state.selection.empty) {
      editor.chain().focus().insertContent({ type: "text", text: linkValue.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  return <div className="relative">
    <div className="sticky top-16 z-20 flex flex-wrap items-center gap-0.5 border-b bg-card/95 p-2 backdrop-blur lg:top-0" aria-label="Форматирование текста">
      <ToolbarButton label="Отменить" icon={Undo2} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton label="Повторить" icon={Redo2} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
      <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
      <ToolbarButton label="Заголовок 1" icon={Heading1} active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton label="Заголовок 2" icon={Heading2} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label="Жирный" icon={Bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton label="Курсив" icon={Italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton label="Зачёркнутый" icon={Strikethrough} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <ToolbarButton label="Код в строке" icon={Code2} active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} />
      <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
      <ToolbarButton label="Маркированный список" icon={List} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton label="Нумерованный список" icon={ListOrdered} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolbarButton label="Чек-лист" icon={ListChecks} active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} />
      <ToolbarButton label="Цитата" icon={TextQuote} active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <ToolbarButton label="Блок кода" icon={CodeXml} active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <span className="mx-1 h-7 w-px bg-border" aria-hidden="true" />
      <ToolbarButton label="Внешняя ссылка" icon={Link2} active={editor.isActive("link")} onClick={openLink} />
      {editor.isActive("link") && <ToolbarButton label="Убрать ссылку" icon={Link2Off} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} />}
      <ToolbarButton label="Ссылка на другую заметку" icon={Unlink} onClick={() => { editor.chain().focus().insertContent("[[").run(); }} />
      <ToolbarButton label="Добавить изображение" icon={ImagePlus} disabled={upload.isPending} onClick={() => fileInput.current?.click()} />
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="hidden" aria-label="Выбрать изображения" onChange={(event) => { void insertFiles([...(event.target.files ?? [])]); event.target.value = ""; }} />
    </div>

    <div onClick={(event) => {
      const target = (event.target as HTMLElement).closest("a[data-note-id]");
      if (!target) return;
      event.preventDefault();
      const id = Number(target.getAttribute("data-note-id"));
      if (Number.isInteger(id)) onNavigate(id);
    }}>
      <EditorContent editor={editor} className="note-editor-content" />
    </div>

    <div className="flex flex-col gap-1 border-t px-5 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <span>{words} {words === 1 ? "слово" : words >= 2 && words <= 4 ? "слова" : "слов"} · [[название]] — связь с заметкой</span>
      <span>{upload.isPending ? "Сохранение изображения…" : "Изображения: PNG, JPEG, WebP, GIF · до 8 МБ"}</span>
    </div>

    {wiki && <div className="fixed z-50 w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-xl" style={{ left: wiki.left, top: wiki.top }} role="listbox" aria-label="Связать с заметкой">
      <div className="flex items-center justify-between px-2 py-1.5 text-xs text-muted-foreground"><span>{wiki.query ? `Поиск: ${wiki.query}` : "Выберите заметку"}</span><button type="button" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary" aria-label="Закрыть подсказки" onClick={() => setWiki(null)}><X className="h-3.5 w-3.5" /></button></div>
      {candidates.length ? candidates.map((candidate, index) => <button key={candidate.id} type="button" role="option" aria-selected={index === wiki.active} className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm ${index === wiki.active ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/60"}`} onPointerDown={(event) => event.preventDefault()} onClick={() => chooseWiki(candidate)}><Link2 className="h-4 w-4 shrink-0 text-primary" /><span className="truncate">{candidate.title}</span></button>) : <p className="px-3 py-4 text-sm text-muted-foreground">Подходящих заметок нет.</p>}
    </div>}

    <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
      <DialogContent className="w-[calc(100%-32px)] rounded-2xl sm:max-w-md">
        <DialogHeader><DialogTitle>Внешняя ссылка</DialogTitle><DialogDescription>Можно использовать адреса http, https и mailto. Пустое поле убирает ссылку.</DialogDescription></DialogHeader>
        <form onSubmit={applyLink}>
          <label className="label" htmlFor="note-external-link">Адрес</label>
          <input id="note-external-link" autoFocus className="field" value={linkValue} onChange={(event) => setLinkValue(event.target.value)} placeholder="https://example.com" inputMode="url" />
          <DialogFooter className="mt-5"><Button type="button" variant="outline" className="min-h-11" onClick={() => setLinkOpen(false)}>Отмена</Button><Button type="submit" className="min-h-11">Применить</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}
