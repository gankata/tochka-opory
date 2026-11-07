import { useState, type FormEvent } from "react";
import { Landmark, Pencil } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { money } from "@/lib/utils-app";
import { Button } from "@/components/ui/button";
import { AddButton, DeleteButton, EmptyState, ErrorPage, Field, FormDialog, LoadingPage, Metric, PageHeader, Section } from "@/components/app/Common";

type Entry = { id: number; name: string; kind: "asset" | "liability"; category: "Наличные и счета" | "Вклады" | "Инвестиции" | "Имущество" | "Долг" | "Другое"; valueRub: number; note: string | null };
type Form = Omit<Entry, "id" | "valueRub"> & { valueRub: string };
const empty: Form = { name: "", kind: "asset", category: "Наличные и счета", valueRub: "", note: "" };
const toForm = (entry: Entry): Form => ({ name: entry.name, kind: entry.kind, category: entry.category, valueRub: String(entry.valueRub), note: entry.note ?? "" });

function Editor({ value, onClose }: { value: Entry | "new" | null; onClose: () => void }) {
  const [form, setForm] = useState<Form>(value && value !== "new" ? toForm(value) : empty);
  const utils = trpc.useUtils();
  const create = trpc.assets.create.useMutation();
  const update = trpc.assets.update.useMutation();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const payload = { ...form, valueRub: Number(form.valueRub), note: form.note || null };
    try {
      if (value && value !== "new") await update.mutateAsync({ id: value.id, ...payload }); else await create.mutateAsync(payload);
      await utils.assets.list.invalidate(); toast.success("Оценка сохранена"); onClose();
    } catch { toast.error("Не удалось сохранить позицию"); }
  };
  return <FormDialog open={Boolean(value)} onOpenChange={(open) => !open && onClose()} title={value === "new" ? "Новая позиция" : "Изменить оценку"} description="Ручной снимок стоимости, а не автоматическая котировка. Обновляйте его по своим выпискам."><form onSubmit={save} className="space-y-5">
    <Field label="Название"><input required maxLength={160} className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Например, вклад или кредит" /></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Тип"><select className="field" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as Form["kind"] })}><option value="asset">Актив</option><option value="liability">Обязательство</option></select></Field><Field label="Категория"><select className="field" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as Form["category"] })}>{["Наличные и счета", "Вклады", "Инвестиции", "Имущество", "Долг", "Другое"].map((item) => <option key={item}>{item}</option>)}</select></Field></div>
    <Field label="Текущая оценка, ₽" hint="Для долга укажите остаток положительным числом — знак учтётся автоматически."><input required type="number" min="0" max="1000000000000" step="0.01" className="field" value={form.valueRub} onChange={(event) => setForm({ ...form, valueRub: event.target.value })} /></Field>
    <Field label="Примечание"><textarea className="field-area" value={form.note ?? ""} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={onClose}>Отмена</Button><Button disabled={create.isPending || update.isPending}>Сохранить</Button></div>
  </form></FormDialog>;
}

export default function Assets() {
  const query = trpc.assets.list.useQuery();
  const utils = trpc.useUtils();
  const remove = trpc.assets.delete.useMutation();
  const [edit, setEdit] = useState<Entry | "new" | null>(null);
  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !query.data) return <ErrorPage retry={() => query.refetch()} />;
  const rows = query.data as Entry[];
  const assets = rows.filter((row) => row.kind === "asset").reduce((sum, row) => sum + row.valueRub, 0);
  const liabilities = rows.filter((row) => row.kind === "liability").reduce((sum, row) => sum + row.valueRub, 0);
  const removeRow = async (id: number) => { try { await remove.mutateAsync({ id }); await utils.assets.list.invalidate(); toast.success("Позиция удалена"); } catch { toast.error("Не удалось удалить позицию"); } };
  const group = (kind: Entry["kind"], title: string) => <Section title={title} description={kind === "asset" ? "То, чем вы владеете, по текущей ручной оценке." : "Кредиты, займы и другие остатки долга."}>
    {rows.some((row) => row.kind === kind) ? <div className="divide-y">{rows.filter((row) => row.kind === kind).map((row) => <article key={row.id} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><h3 className="font-semibold">{row.name}</h3><p className="mt-1 text-sm text-muted-foreground">{row.category}</p>{row.note && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{row.note}</p>}</div><p className={`number text-lg font-semibold ${kind === "liability" ? "text-destructive" : ""}`}>{kind === "liability" ? "−" : ""}{money(row.valueRub)}</p><div className="flex"><Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setEdit(row)} aria-label={`Изменить ${row.name}`}><Pencil className="h-4 w-4" /></Button><DeleteButton label="Удалить позицию" onConfirm={() => removeRow(row.id)} /></div></article>)}</div> : <EmptyState title="Позиций пока нет" text="Добавьте только то, что хотите учитывать в чистом капитале." />}
  </Section>;
  return <div className="page-enter"><PageHeader eyebrow="Капитал" title="Активы и обязательства" description="Одна понятная картина без подключения банков: стоимость активов минус остатки долгов." action={<AddButton label="Добавить позицию" onClick={() => setEdit("new")} />} />
    <section aria-label="Итоги капитала" className="surface mb-6 grid gap-6 p-5 sm:grid-cols-3 sm:p-6"><Metric label="Активы" value={money(assets)} note="По вашим оценкам" tone="good" /><Metric label="Обязательства" value={money(liabilities)} note="Остатки долгов" tone={liabilities ? "danger" : "default"} /><Metric label="Чистый капитал" value={money(assets - liabilities)} note="Активы минус обязательства" tone={assets - liabilities < 0 ? "danger" : "good"} /></section>
    <div className="grid items-start gap-5 lg:grid-cols-2">{group("asset", "Мои активы")}{group("liability", "Обязательства")}</div>
    <div className="mt-5 flex items-start gap-3 rounded-xl bg-secondary/50 p-4 text-sm leading-relaxed text-muted-foreground"><Landmark className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Этот раздел не дублирует журнал операций автоматически. Покупка актива и изменение его оценки — разные события; суммы здесь обновляются вручную и попадают в резервные копии.</p></div>
    <Editor key={edit === "new" ? "new" : edit?.id ?? "closed"} value={edit} onClose={() => setEdit(null)} />
  </div>;
}
