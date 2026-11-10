import { useState, type FormEvent } from "react";
import { Gift, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { WishlistItem, WishlistPriority } from "@contracts/notes";
import { wishlistStats } from "@/lib/notes";
import { money } from "@/lib/utils-app";
import { createUuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";

const priorityLabels: Record<WishlistPriority, string> = { low: "Не срочно", normal: "Обычный", high: "Очень хочу" };

export default function WishlistEditor({ items, onChange }: { items: WishlistItem[]; onChange: (items: WishlistItem[]) => void }) {
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const stats = wishlistStats(items);

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    if (url.trim()) {
      try {
        const parsed = new URL(url.trim());
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      } catch {
        toast.error("Ссылка должна начинаться с http:// или https://");
        return;
      }
    }
    const parsedPrice = price.trim() ? Number(price) : null;
    if (parsedPrice != null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      toast.error("Проверьте стоимость");
      return;
    }
    onChange([...items, { id: createUuid(), title: title.trim(), price: parsedPrice, url: url.trim() || null, priority: "normal", done: false, note: null }]);
    setTitle(""); setPrice(""); setUrl("");
  };

  const patch = (id: string, value: Partial<WishlistItem>) => onChange(items.map((item) => item.id === id ? { ...item, ...value } : item));

  return <section className="rounded-2xl border bg-secondary/25 p-4 sm:p-5" aria-label="Содержимое вишлиста">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 font-semibold"><Gift className="h-5 w-5 text-primary" />Список желаний</h2><p className="mt-1 text-sm text-muted-foreground">{stats.completed} из {stats.total} исполнено</p></div><p className="number text-lg font-semibold">{money(stats.remainingCost)} <span className="text-xs font-normal text-muted-foreground">осталось</span></p></div>
    <form onSubmit={add} className="mt-5 grid gap-2 rounded-xl bg-card p-3 sm:grid-cols-2 xl:grid-cols-[1fr_160px]">
      <input required aria-label="Название желания" className="field sm:col-span-2 xl:col-span-1" placeholder="Что хочется?" value={title} onChange={(event) => setTitle(event.target.value)} />
      <input type="number" min="0" step="0.01" aria-label="Примерная стоимость" className="field" placeholder="Цена, ₽" value={price} onChange={(event) => setPrice(event.target.value)} />
      <input type="url" aria-label="Ссылка на желание" className="field sm:col-span-2" placeholder="Ссылка, если есть" value={url} onChange={(event) => setUrl(event.target.value)} />
      <Button className="min-h-11 gap-2 sm:col-span-2 sm:justify-self-start"><Plus className="h-4 w-4" />Добавить желание</Button>
    </form>
    <div className="mt-4 space-y-3">
      {!items.length && <p className="py-5 text-center text-sm text-muted-foreground">Добавьте первое желание — цену и ссылку можно не указывать.</p>}
      {items.map((item, index) => <article key={item.id} className={`rounded-xl border bg-card p-3 transition-opacity ${item.done ? "opacity-65" : ""}`}>
        <div className="flex items-start gap-3">
          <input type="checkbox" aria-label={`Отметить «${item.title}» исполненным`} className="mt-2.5 h-5 w-5 shrink-0 accent-primary" checked={item.done} onChange={(event) => patch(item.id, { done: event.target.checked })} />
          <input aria-label={`Название желания ${index + 1}`} className={`field min-w-0 flex-1 border-0 bg-transparent px-0 font-medium ${item.done ? "line-through" : ""}`} value={item.title} onChange={(event) => patch(item.id, { title: event.target.value })} />
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Удалить желание «${item.title}»`} onClick={() => onChange(items.filter((candidate) => candidate.id !== item.id))}><Trash2 className="h-4 w-4" /></Button>
        </div>
        <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-[150px_150px_1fr]">
          <input type="number" min="0" step="0.01" aria-label={`Цена желания ${index + 1}`} className="field bg-background/60" placeholder="Цена, ₽" value={item.price ?? ""} onChange={(event) => patch(item.id, { price: event.target.value === "" ? null : Number(event.target.value) })} />
          <select aria-label={`Приоритет желания ${index + 1}`} className="field bg-background/60" value={item.priority} onChange={(event) => patch(item.id, { priority: event.target.value as WishlistPriority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <input type="url" aria-label={`Ссылка желания ${index + 1}`} className="field bg-background/60 sm:col-span-2 lg:col-span-1" placeholder="https://…" value={item.url ?? ""} onChange={(event) => patch(item.id, { url: event.target.value || null })} />
        </div>
      </article>)}
    </div>
  </section>;
}
