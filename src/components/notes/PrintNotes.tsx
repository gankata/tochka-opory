import { createPortal } from "react-dom";
import type { Note } from "@/types";
import { money, formatDateTime } from "@/lib/utils-app";
import RichTextView from "./RichTextView";

export default function PrintNotes({ notes }: { notes: Note[] }) {
  return createPortal(<main className="print-document" aria-hidden="true">
    <header className="print-cover"><h1>{notes.length === 1 ? notes[0].title : "Точка опоры — библиотека"}</h1><p>Сформировано {formatDateTime(new Date())}</p></header>
    {notes.map((note) => <article key={note.id} className="print-note">
      {notes.length > 1 && <h1>{note.title}</h1>}
      {note.kind === "folder" ? <p>Папка библиотеки</p> : <>
        <RichTextView document={note.document} content={note.content} />
        {note.kind === "wishlist" && <section className="print-wishlist"><h2>Список желаний</h2>{note.items.length ? <table><thead><tr><th></th><th>Желание</th><th>Цена</th><th>Приоритет</th><th>Ссылка</th></tr></thead><tbody>{note.items.map((item) => <tr key={item.id}><td>{item.done ? "✓" : "○"}</td><td>{item.title}{item.note && <small>{item.note}</small>}</td><td>{item.price == null ? "—" : money(item.price)}</td><td>{item.priority === "high" ? "Очень хочу" : item.priority === "low" ? "Не срочно" : "Обычный"}</td><td>{item.url ?? "—"}</td></tr>)}</tbody></table> : <p>Список пуст.</p>}</section>}
      </>}
    </article>)}
  </main>, document.body);
}
