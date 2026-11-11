import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronDown, Pencil } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import type { MoodEntry } from "@/types";
import { decimal, formatDate, moodColor, todayISO } from "@/lib/utils-app";
import { Button } from "@/components/ui/button";
import { AddButton, DeleteButton, EmptyState, ErrorPage, Field, FormDialog, LoadingPage, Metric, PageHeader, Section } from "@/components/app/Common";
import { MonthCalendar } from "@/components/app/MonthCalendar";
import { DatePicker } from "@/components/app/DatePicker";
import { moodByWeekday, moodFinanceCorrelations } from "@/lib/mood-insights";

type MoodForm = { entryDate: string; timeOfDay: string; mood: number; emotion: string; intensity: number; topic: string; situation: string; thoughts: string; body: string; coping: string; energy: string; sleepHours: string; therapyNotes: string };
const currentTime = () => { const h = new Date().getHours(); return h < 11 ? "Утро" : h < 17 ? "День" : h < 23 ? "Вечер" : "Ночь"; };
const emptyMood = (date = todayISO()): MoodForm => ({ entryDate: date, timeOfDay: currentTime(), mood: 5, emotion: "Спокойствие", intensity: 5, topic: "Работа / учёба", situation: "", thoughts: "", body: "", coping: "", energy: "", sleepHours: "", therapyNotes: "" });
const toForm = (m: MoodEntry): MoodForm => ({ entryDate: m.entryDate, timeOfDay: m.timeOfDay, mood: m.mood, emotion: m.emotion, intensity: m.intensity, topic: m.topic, situation: m.situation ?? "", thoughts: m.thoughts ?? "", body: m.body ?? "", coping: m.coping ?? "", energy: m.energy == null ? "" : String(m.energy), sleepHours: m.sleepHours == null ? "" : String(m.sleepHours), therapyNotes: m.therapyNotes ?? "" });

export default function Mood() {
  const query = trpc.workspace.get.useQuery(); const utils = trpc.useUtils();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false); const [editing, setEditing] = useState<MoodEntry | null>(null); const [form, setForm] = useState<MoodForm>(emptyMood);
  const [month, setMonth] = useState(todayISO().slice(0, 7)); const [selectedDay, setSelectedDay] = useState<string | null>(null); const [topic, setTopic] = useState("Все");
  const [now] = useState(Date.now);
  const create = trpc.workspace.moodCreate.useMutation(); const update = trpc.workspace.moodUpdate.useMutation(); const remove = trpc.workspace.moodDelete.useMutation();
  const data = query.data;
  const newEntry = (date = todayISO()) => { setEditing(null); setForm(emptyMood(date)); setOpen(true); };
  const changeSelectedDay = (day: string | null) => {
    setSelectedDay(day);
    if (params.has("date")) {
      const next = new URLSearchParams(params);
      next.delete("date");
      setParams(next, { replace: true });
    }
  };
  const resetFilters = () => { setTopic("Все"); changeSelectedDay(null); };
  // URL search params open the dialog after external navigation.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (params.get("new") === "1") newEntry(params.get("date") || todayISO());
    const requestedDate = params.get("date");
    if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      setMonth(requestedDate.slice(0, 7));
      setSelectedDay(requestedDate);
    }
  }, [params]);
  /* eslint-enable react-hooks/set-state-in-effect */
  const close = () => { setOpen(false); setEditing(null); if (params.has("new")) setParams({}); };
  const save = async (e: FormEvent) => { e.preventDefault(); const payload = { entryDate: form.entryDate, timeOfDay: form.timeOfDay, mood: form.mood, emotion: form.emotion, intensity: form.intensity, topic: form.topic, situation: form.situation || null, thoughts: form.thoughts || null, body: form.body || null, coping: form.coping || null, energy: form.energy ? Number(form.energy) : null, sleepHours: form.sleepHours ? Number(form.sleepHours) : null, therapyNotes: form.therapyNotes || null }; try { if (editing) await update.mutateAsync({ id: editing.id, ...payload }); else await create.mutateAsync(payload); await utils.workspace.get.invalidate(); toast.success("Запись сохранена"); close(); } catch { toast.error("Не удалось сохранить запись"); } };
  const quickSave = async (mood: number) => {
    try {
      await create.mutateAsync({ entryDate: todayISO(), timeOfDay: currentTime(), mood, emotion: mood >= 7 ? "Радость" : mood <= 3 ? "Грусть" : "Спокойствие", intensity: mood, topic: "Другое", situation: null, thoughts: null, body: null, coping: null, energy: null, sleepHours: null, therapyNotes: null });
      await utils.workspace.get.invalidate(); toast.success(`Быстрая отметка сохранена: ${mood}/10`);
    } catch { toast.error("Не удалось сохранить быструю отметку"); }
  };
  const filtered = useMemo(() => {
    const focusId = Number(params.get("focus"));
    if (Number.isInteger(focusId) && focusId > 0) return (data?.moods ?? []).filter((m) => m.id === focusId);
    return (data?.moods ?? []).filter((m) => (!selectedDay || m.entryDate === selectedDay) && (topic === "Все" || m.topic === topic));
  }, [data, selectedDay, topic, params]);
  if (query.isLoading) return <LoadingPage />; if (query.isError || !data) return <ErrorPage retry={() => query.refetch()} />;
  const options = (kind: "emotion" | "topic" | "time") => data.options.filter((o) => o.kind === kind).map((o) => o.label);
  const last7 = data.moods.filter((m) => now - new Date(`${m.entryDate}T12:00:00`).getTime() <= 7 * 86400000);
  const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const avgMood = average(last7.map((m) => m.mood)); const avgEnergy = average(data.moods.map((m) => m.energy).filter((v): v is number => v != null)); const avgSleep = average(data.moods.map((m) => m.sleepHours).filter((v): v is number => v != null));
  const chartData = [...data.moods].slice(0, 30).reverse().map((m) => ({ date: new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date(`${m.entryDate}T12:00:00`)), mood: m.mood, energy: m.energy }));
  const year = Number(month.slice(0, 4)); const mon = Number(month.slice(5, 7)) - 1; const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const dayStats = Array.from({ length: daysInMonth }, (_, i) => { const date = `${month}-${String(i + 1).padStart(2, "0")}`; const entries = data.moods.filter((m) => m.entryDate === date); return { date, day: i + 1, score: average(entries.map((m) => m.mood)) }; });
  const allTopics = Array.from(new Set(data.moods.map((m) => m.topic)));
  const weekdayStats = moodByWeekday(data.moods);
  const correlations = moodFinanceCorrelations(data.moods, data.transactions);
  const yearDays = Array.from({ length: 12 }, (_, monthIndex) => {
    const count = new Date(year, monthIndex + 1, 0).getDate();
    return Array.from({ length: count }, (_, dayIndex) => {
      const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayIndex + 1).padStart(2, "0")}`;
      return { date, score: average(data.moods.filter((entry) => entry.entryDate === date).map((entry) => entry.mood)) };
    });
  });

  return <div className="page-enter"><PageHeader eyebrow="Самонаблюдение" title="Дневник настроения" description="Для записи достаточно даты, настроения, эмоции и темы. Остальные детали добавляйте по самочувствию. Это инструмент наблюдения, а не диагностики." action={<AddButton label="Новая запись" onClick={() => newEntry()} />} />

    <div className="surface mb-5 grid divide-y sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x"><div className="p-5"><Metric label="Записей всего" value={data.moods.length} note="Несколько записей в один день допустимы" /></div><div className="p-5"><Metric label="Настроение за 7 дней" value={avgMood == null ? "—" : `${decimal(avgMood)} / 10`} /></div><div className="p-5"><Metric label="Средняя энергия" value={avgEnergy == null ? "—" : `${decimal(avgEnergy)} / 10`} /></div><div className="p-5"><Metric label="Средний сон" value={avgSleep == null ? "—" : `${decimal(avgSleep)} ч`} /></div></div>

    <Section title="Быстрая отметка на сегодня" description="Одно нажатие сохраняет оценку. Детали можно добавить потом через редактирование записи." className="mb-5"><div className="grid grid-cols-5 gap-2 sm:grid-cols-10">{Array.from({ length: 10 }, (_, index) => index + 1).map((score) => <button key={score} disabled={create.isPending} onClick={() => void quickSave(score)} aria-label={`Сохранить настроение ${score} из 10`} className="mood-ink min-h-12 rounded-xl border bg-card text-lg font-semibold transition-transform hover:-translate-y-0.5 hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary" style={{ "--mood-color": moodColor(score) } as CSSProperties}>{score}</button>)}</div></Section>

    <div className="mood-insights-grid grid gap-5 xl:grid-cols-[1.1fr_1fr] xl:[grid-template-areas:'dynamics_calendar'_'rhythm_calendar'_'correlations_correlations']">
      <Section title="Динамика" description="До 30 последних записей; настроение и энергия показаны отдельно." className="xl:[grid-area:dynamics]">{chartData.length ? <div className="h-64" role="img" aria-label="График настроения и энергии"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "oklch(var(--chart-axis))" }} /><YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "oklch(var(--chart-axis))" }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(var(--border))", backgroundColor: "oklch(var(--popover))", color: "oklch(var(--popover-foreground))", fontFamily: "Onest" }} /><Line type="monotone" dataKey="mood" name="Настроение" stroke="oklch(var(--chart-income))" strokeWidth={2.5} dot={{ r: 3, fill: "oklch(var(--chart-income))" }} connectNulls /><Line type="monotone" dataKey="energy" name="Энергия" stroke="oklch(var(--chart-expense))" strokeWidth={1.8} dot={false} connectNulls /></LineChart></ResponsiveContainer></div> : <EmptyState title="График появится после первой записи" text="Достаточно короткой записи — дневник можно дополнять в удобном темпе." action={<Button variant="outline" className="min-h-11" onClick={() => newEntry()}>Записать состояние</Button>} />}</Section>

      <Section title="Календарь" description="Цветная отметка и число показывают среднее настроение за день. Нажатие фильтрует записи." className="xl:[grid-area:calendar]">
        <MonthCalendar compact month={month} onMonthChange={(next) => { setMonth(next); changeSelectedDay(null); }} selectedDay={selectedDay} onSelectDay={(day) => changeSelectedDay(!day || selectedDay === day ? null : day)} renderDay={(date) => { const stat = dayStats.find((item) => item.date === date); return stat?.score ? <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: moodColor(stat.score) }} /><span className="mood-ink hidden text-xs font-semibold sm:inline" style={{ "--mood-color": moodColor(stat.score) } as CSSProperties}>{decimal(stat.score)}</span></div> : null; }} dayLabel={(date) => { const stat = dayStats.find((item) => item.date === date); return `${formatDate(date)}${stat?.score ? `, среднее настроение ${decimal(stat.score)} из 10` : ", нет записей"}`; }} />
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground"><span>1 — очень плохо · 10 — отлично</span>{selectedDay && <button onClick={() => changeSelectedDay(null)} className="min-h-11 font-medium text-primary">Все дни</button>}</div>
      </Section>

      <Section title="Ритм недели" description="Средняя оценка по каждому дню. Рядом указано число записей, чтобы не делать вывод по одному наблюдению." className="xl:[grid-area:rhythm]"><div className="space-y-3">{weekdayStats.map((day) => <div key={day.name} className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3"><span className="text-xs text-muted-foreground">{day.short}</span><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: day.average == null ? 0 : `${day.average * 10}%` }} /></div><span className="number text-xs">{day.average == null ? "—" : `${decimal(day.average)} · ${day.count}`}</span></div>)}</div></Section>
      <Section title="Что наблюдается вместе" description="Коэффициент от −1 до 1 показывает только совместное изменение. Он не доказывает причину и особенно ненадёжен при малой выборке." className="xl:[grid-area:correlations]"><div className="space-y-3 xl:grid xl:grid-cols-3 xl:gap-3 xl:space-y-0">{correlations.map((item) => <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl bg-secondary/40 p-4"><div><p className="text-sm font-medium">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">Пар наблюдений: {item.count}{item.count < 10 ? " · пока мало данных" : ""}</p></div><span className="number text-xl font-semibold">{item.value == null ? "—" : decimal(item.value)}</span></div>)}</div></Section>
    </div>
    <Section title={`Годовая карта · ${year}`} description="Каждая клетка — день со средней оценкой. Нажатие открывает записи этого дня, повторное нажатие снимает фильтр." className="mt-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{yearDays.map((days, monthIndex) => <div key={monthIndex}><p className="mb-2 text-xs font-medium text-muted-foreground">{new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(year, monthIndex, 1))}</p><div className="flex flex-wrap gap-1">{days.map((day) => <button key={day.date} onClick={() => { changeSelectedDay(selectedDay === day.date ? null : day.date); setMonth(day.date.slice(0, 7)); }} aria-label={`${formatDate(day.date)}${day.score == null ? ", нет записей" : `, настроение ${decimal(day.score)}`}`} aria-pressed={selectedDay === day.date} className={`h-4 w-4 rounded-[4px] border transition-transform hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary ${selectedDay === day.date ? "border-primary ring-2 ring-primary/30" : "border-border/50"}`} style={{ background: day.score == null ? "oklch(var(--secondary))" : moodColor(day.score) }} />)}</div></div>)}</div></Section>

    <section className="mt-7" aria-label="Записи настроения"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Записи</h2><p className="text-sm text-muted-foreground">{selectedDay ? formatDate(selectedDay) : "От новых к старым"} · найдено {filtered.length}</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-center">{selectedDay && <Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => changeSelectedDay(null)}>Все дни</Button>}<select aria-label="Фильтр по теме" className="field sm:w-64" value={topic} onChange={(e) => setTopic(e.target.value)}><option>Все</option>{allTopics.map((t) => <option key={t}>{t}</option>)}</select></div></div>
      {filtered.length ? <div className="space-y-3">{filtered.map((m) => <article id={`mood-${m.id}`} key={m.id} className={`surface p-5 ${params.get("focus") === String(m.id) ? "ring-2 ring-primary/25" : ""}`}><div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: moodColor(m.mood) }} aria-label={`Настроение ${m.mood} из 10`}>{m.mood}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h3 className="font-semibold">{m.emotion}</h3><span className="text-sm text-muted-foreground">сила {m.intensity}/10</span><span className="text-sm text-muted-foreground">{m.topic}</span></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(m.entryDate)} · {m.timeOfDay}{m.energy != null ? ` · энергия ${m.energy}/10` : ""}{m.sleepHours != null ? ` · сон ${decimal(m.sleepHours)} ч` : ""}</p>{m.situation && <p className="mt-3 text-sm leading-relaxed"><b>Ситуация:</b> {m.situation}</p>}{m.thoughts && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.thoughts}</p>}{m.therapyNotes && <p className="mt-3 rounded-lg bg-secondary/65 p-3 text-sm"><b>Для сессии:</b> {m.therapyNotes}</p>}</div><div className="flex shrink-0"><Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => { setEditing(m); setForm(toForm(m)); setOpen(true); }} aria-label="Изменить запись"><Pencil className="h-4 w-4" /></Button><DeleteButton label="Удалить запись" onConfirm={async () => { try { await remove.mutateAsync({ id: m.id }); await utils.workspace.get.invalidate(); toast.success("Запись удалена"); } catch { toast.error("Не удалось удалить"); } }} /></div></div></article>)}</div> : <EmptyState title="Здесь пока пусто" text={selectedDay || topic !== "Все" ? "Для выбранного фильтра записей нет." : "Сделайте первую короткую запись — подробности можно добавить позже."} action={<div className="flex flex-col justify-center gap-2 sm:flex-row">{(selectedDay || topic !== "Все") && <Button type="button" variant="outline" className="min-h-11" onClick={resetFilters}>Сбросить фильтры</Button>}<AddButton label="Новая запись" onClick={() => newEntry(selectedDay ?? todayISO())} /></div>} />}
    </section>

    <FormDialog open={open} onOpenChange={(o) => o ? setOpen(true) : close()} title={editing ? "Изменить запись" : "Как вы себя чувствуете?"} description="Не стремитесь к точной формулировке. Достаточно нескольких слов."><form onSubmit={save} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Дата"><DatePicker required aria-label="Дата" value={form.entryDate} onChange={(entryDate) => setForm({ ...form, entryDate })} /></Field><Field label="Время суток"><select className="field" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}>{options("time").map((v) => <option key={v}>{v}</option>)}</select></Field></div>
      <div className="rounded-xl bg-secondary/55 p-4"><div className="flex items-center justify-between"><label htmlFor="mood-range" className="font-medium">Настроение</label><span className="mood-ink editorial text-3xl font-semibold" style={{ "--mood-color": moodColor(form.mood) } as CSSProperties}>{form.mood}<span className="ml-1 text-sm text-muted-foreground">/ 10</span></span></div><input id="mood-range" type="range" min="1" max="10" step="1" value={form.mood} onChange={(e) => setForm({ ...form, mood: Number(e.target.value) })} className="mt-4 h-11 w-full accent-primary" /><div className="flex justify-between text-xs text-muted-foreground"><span>очень плохо</span><span>отлично</span></div></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Эмоция"><select className="field" value={form.emotion} onChange={(e) => setForm({ ...form, emotion: e.target.value })}>{options("emotion").map((v) => <option key={v}>{v}</option>)}</select></Field><Field label="Тема"><select className="field" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>{options("topic").map((v) => <option key={v}>{v}</option>)}</select></Field></div>
      <Field label={`Сила эмоции: ${form.intensity} / 10`}><input type="range" min="1" max="10" value={form.intensity} onChange={(e) => setForm({ ...form, intensity: Number(e.target.value) })} className="h-11 w-full accent-primary" /></Field>
      <details className="group rounded-xl border bg-card/60 p-4 transition-colors open:border-primary/25 open:bg-secondary/25"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium">Подробности и самочувствие<ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" /></summary><div className="space-y-5 pt-4"><Field label="Ситуация: что произошло?" hint="Только факты, как будто описываете для камеры."><textarea className="field-area" value={form.situation} onChange={(e) => setForm({ ...form, situation: e.target.value })} /></Field><Field label="Мысли"><textarea className="field-area" value={form.thoughts} onChange={(e) => setForm({ ...form, thoughts: e.target.value })} placeholder="Что пришло в голову?" /></Field><Field label="Ощущения в теле"><textarea className="field-area" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field><Field label="Что сделали / что помогло"><textarea className="field-area" value={form.coping} onChange={(e) => setForm({ ...form, coping: e.target.value })} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Энергия (1–10)"><input type="number" min="1" max="10" className="field" value={form.energy} onChange={(e) => setForm({ ...form, energy: e.target.value })} /></Field><Field label="Сон, часов"><input type="number" min="0" max="24" step="0.5" className="field" value={form.sleepHours} onChange={(e) => setForm({ ...form, sleepHours: e.target.value })} /></Field></div><Field label="Заметки для терапевта"><textarea className="field-area" value={form.therapyNotes} onChange={(e) => setForm({ ...form, therapyNotes: e.target.value })} placeholder="Что хочется обсудить на сессии?" /></Field></div></details>
      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-11" onClick={close}>Отмена</Button><Button className="min-h-11" disabled={create.isPending || update.isPending}>{create.isPending || update.isPending ? "Сохранение…" : "Сохранить запись"}</Button></div>
    </form></FormDialog>
  </div>;
}
