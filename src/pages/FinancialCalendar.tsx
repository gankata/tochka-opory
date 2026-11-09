import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeftRight, Banknote, CalendarClock, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { currencyMoney } from "@contracts/currencies";
import { trpc } from "@/providers/trpc";
import { buildFinancialCalendar, type FinancialEvent, type FinancialEventKind } from "@/lib/financial-calendar";
import { dateFromISO, hasOfficialRussianCalendar } from "@/lib/working-days";
import { formatDate, money, operationAmount, operationCurrency, todayISO } from "@/lib/utils-app";
import { Button } from "@/components/ui/button";
import { CategoryBadge } from "@/components/app/CategoryBadge";
import { EmptyState, ErrorPage, LoadingPage, Metric, PageHeader, Section } from "@/components/app/Common";
import { MonthCalendar } from "@/components/app/MonthCalendar";

const filterMeta: Record<FinancialEventKind, { label: string; dot: string; icon: typeof TrendingUp }> = {
  income: { label: "Доходы", dot: "bg-emerald-600 dark:bg-emerald-400", icon: TrendingUp },
  expense: { label: "Расходы", dot: "bg-orange-600 dark:bg-orange-400", icon: TrendingDown },
  payment: { label: "Платежи", dot: "bg-sky-600 dark:bg-sky-400", icon: CalendarClock },
  salary: { label: "Зарплата", dot: "bg-violet-600 dark:bg-violet-400", icon: Banknote },
  exchange: { label: "Обмены", dot: "bg-slate-500 dark:bg-slate-400", icon: ArrowLeftRight },
};

const initialFilters: Record<FinancialEventKind, boolean> = { income: true, expense: true, payment: true, salary: true, exchange: true };

function shortMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function DayContent({ events }: { events: FinancialEvent[] }) {
  const sum = (kind: FinancialEventKind) => events.filter((event) => event.kind === kind).reduce((total, event) => total + (event.amountRub ?? 0), 0);
  const income = sum("income");
  const expense = sum("expense");
  const planned = sum("payment");
  const markers = (Object.keys(filterMeta) as FinancialEventKind[]).filter((kind) => events.some((event) => event.kind === kind));
  return <>
    <div className="hidden space-y-0.5 text-[10px] font-medium leading-tight sm:block">
      {income > 0 && <div className="truncate text-emerald-700 dark:text-emerald-300">+{shortMoney(income)}</div>}
      {expense > 0 && <div className="truncate text-orange-700 dark:text-orange-300">−{shortMoney(expense)}</div>}
      {planned > 0 && <div className="truncate text-sky-700 dark:text-sky-300">План {shortMoney(planned)}</div>}
    </div>
    <div className="flex min-h-2 flex-wrap gap-1 sm:mt-1" aria-hidden="true">
      {markers.map((kind) => <span key={kind} className={`h-1.5 w-1.5 rounded-full ${filterMeta[kind].dot} ${events.some((event) => event.kind === kind && (event.kind === "salary" || event.kind === "exchange")) ? "sm:inline-block" : "sm:hidden"}`} />)}
    </div>
  </>;
}

function EventAmount({ event }: { event: FinancialEvent }) {
  if (event.kind === "salary") return <span className="text-xs text-muted-foreground">дата плана</span>;
  if (event.kind === "payment") return <span className="number whitespace-nowrap font-semibold text-sky-700 dark:text-sky-300">{money(event.amountRub ?? 0)}</span>;
  const transaction = event.transaction;
  const currency = operationCurrency(transaction);
  const original = currencyMoney(Math.abs(operationAmount(transaction)), currency);
  if (event.kind === "exchange") return <div className="text-right"><p className="number whitespace-nowrap text-sm font-semibold">{original}</p><p className="number text-xs text-muted-foreground">{money(Math.abs(transaction.amountRub))}</p></div>;
  return <div className="text-right"><p className={`number whitespace-nowrap font-semibold ${event.kind === "income" ? "text-emerald-700 dark:text-emerald-300" : "text-orange-700 dark:text-orange-300"}`}>{event.kind === "income" ? "+" : "−"}{original}</p>{currency !== "RUB" && <p className="number text-xs text-muted-foreground">≈ {money(Math.abs(transaction.amountRub))}</p>}</div>;
}

function EventRow({ event }: { event: FinancialEvent }) {
  const meta = filterMeta[event.kind];
  const Icon = meta.icon;
  return <article className="flex items-start gap-3 rounded-xl border bg-card p-3.5">
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary"><Icon className="h-4 w-4" /></div>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        {event.kind === "income" || event.kind === "expense" || event.kind === "exchange" ? <CategoryBadge name={event.title} /> : <h3 className="font-medium">{event.title}</h3>}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-foreground">{event.kind === "payment" ? "План, не списано" : event.kind === "salary" ? "Плановая дата" : event.future ? "Запланировано" : "Внесено"}</span>
      </div>
      {event.kind === "payment" && <p className="mt-1.5 text-xs text-muted-foreground">{event.payment.required ? "Обязательный" : "Регулярный"} платёж · раз в {event.payment.intervalMonths} мес.</p>}
      {event.kind === "salary" && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{`Правило: ${event.salary.rule}`}{event.salary.shifted ? ` · перенос с ${formatDate(event.salary.nominalDate)}: ${event.salary.shiftReason?.toLowerCase()}` : ""}. Сумма не добавляется к доходу.</p>}
      {(event.kind === "income" || event.kind === "expense" || event.kind === "exchange") && event.transaction.note && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{event.transaction.note}</p>}
    </div>
    <div className="shrink-0"><EventAmount event={event} /></div>
  </article>;
}

export default function FinancialCalendar() {
  const query = trpc.workspace.get.useQuery();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = todayISO();
  const requestedDate = params.get("date");
  const initialDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;
  const [month, setMonth] = useState(initialDate.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDate);
  useEffect(() => {
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    setMonth(requestedDate.slice(0, 7));
    setSelectedDay(requestedDate);
  }, [requestedDate]);
  const [filters, setFilters] = useState(initialFilters);
  const data = query.data;
  const model = useMemo(() => data ? buildFinancialCalendar(data, month, today) : null, [data, month, today]);
  const visibleEvents = useMemo(() => model?.events.filter((event) => filters[event.kind]) ?? [], [model, filters]);
  const byDay = useMemo(() => visibleEvents.reduce<Record<string, FinancialEvent[]>>((result, event) => {
    (result[event.date] ??= []).push(event);
    return result;
  }, {}), [visibleEvents]);
  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !data?.settings || !model) return <ErrorPage retry={() => query.refetch()} />;
  const selectedEvents = selectedDay ? byDay[selectedDay] ?? [] : [];
  const year = Number(month.slice(0, 4));
  const hasFixedIncome = data.settings.incomeSchedule !== "irregular";
  const selectedWeekday = selectedDay ? new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(dateFromISO(selectedDay)) : "";

  return <div className="page-enter">
    <PageHeader eyebrow="Деньги по дням" title="Финансовый календарь" description={hasFixedIncome ? "Доходы и расходы — по вашим операциям, обязательства и зарплата — как отдельные планы. Нажмите на день, чтобы увидеть все детали без наложений." : "Доходы и расходы — по вашим операциям, обязательства — как отдельные планы. Для нерегулярного дохода фиктивные даты не создаются."} action={<Button className="min-h-11 w-full gap-2 sm:w-auto" onClick={() => navigate(`/operations?new=1${selectedDay ? `&date=${selectedDay}` : ""}`)}><Plus className="h-4 w-4" />Добавить операцию</Button>} />

    {hasFixedIncome ? <section className="surface mb-5 p-5 sm:p-6" aria-label="Зарплатные даты выбранного месяца">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Зарплата в этом месяце</h2><p className="mt-1 text-sm text-muted-foreground">{model.salaries.map((salary) => salary.rule).join(" · ")} по календарю РФ</p></div><Banknote className="h-5 w-5 text-violet-600 dark:text-violet-400" /></div>
      <div className={`grid gap-3 ${model.salaries.length > 1 ? "sm:grid-cols-2" : ""}`}>{model.salaries.map((salary) => <div key={salary.kind} className="rounded-xl bg-violet-500/[.07] p-4 dark:bg-violet-400/[.08]"><p className="text-sm text-muted-foreground">{salary.label} · {salary.rule}</p><p className="number mt-1 text-lg font-semibold">{formatDate(salary.date)}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{salary.shifted ? `Перенос с ${formatDate(salary.nominalDate)}: ${salary.shiftReason?.toLowerCase()}` : "Дата совпадает с правилом"}{!salary.officialCalendar ? " · предварительный расчёт" : ""}</p></div>)}</div>
      {!hasOfficialRussianCalendar(year) && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Для этого года официальные переносы ещё не внесены. Показан предварительный расчёт по выходным и праздникам ТК РФ.</p>}
    </section> : <section className="surface mb-5 p-5 sm:p-6" aria-label="Доходы без фиксированного графика"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Banknote className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">Доходы без фиксированного графика</h2><p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">В календаре видны только поступления, которые вы действительно внесли. Плановых зарплатных дат и выдуманных сумм нет.</p></div></div><Button variant="outline" className="min-h-11 shrink-0" onClick={() => navigate("/data?tab=settings")}>Настроить график</Button></div></section>}

    <div className="surface mb-5 grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0"><div className="p-5"><Metric label="Доходы за месяц" value={money(model.monthIncome)} note="Только внесённые операции до сегодня" tone="good" /></div><div className="p-5"><Metric label="Расходы за месяц" value={money(model.monthExpense)} note="В рублёвом эквиваленте по курсу операции" /></div><div className="p-5"><Metric label="Платежи в плане" value={money(model.plannedTotal)} note="Не добавлены к фактическим расходам" /></div></div>

    <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Что показывать в календаре">
      {(Object.keys(filterMeta) as FinancialEventKind[]).filter((kind) => hasFixedIncome || kind !== "salary").map((kind) => <button key={kind} type="button" aria-pressed={filters[kind]} onClick={() => setFilters((current) => ({ ...current, [kind]: !current[kind] }))} className={`flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors ${filters[kind] ? "border-border bg-card font-medium shadow-sm" : "border-transparent bg-secondary/45 text-muted-foreground"}`}><span className={`h-2 w-2 rounded-full ${filterMeta[kind].dot} ${filters[kind] ? "" : "opacity-30"}`} />{filterMeta[kind].label}</button>)}
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,.8fr)]">
      <Section title="Месяц" description="Суммы в ячейках — рублёвый эквивалент. На маленьком экране детали открываются ниже.">
        <MonthCalendar month={month} onMonthChange={(next) => { setMonth(next); setSelectedDay(null); }} selectedDay={selectedDay} onSelectDay={(day) => setSelectedDay(day || null)} markNonWorking renderDay={(day) => byDay[day]?.length ? <DayContent events={byDay[day]} /> : null} dayLabel={(day) => `${formatDate(day)}. Событий: ${byDay[day]?.length ?? 0}`} />
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />доход</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-orange-600 dark:bg-orange-400" />расход</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-600 dark:bg-sky-400" />плановый платёж</span>{hasFixedIncome && <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-600 dark:bg-violet-400" />зарплата</span>}</div>
      </Section>

      <Section title={selectedDay ? formatDate(selectedDay) : "Выберите день"} description={selectedDay ? `${selectedWeekday.charAt(0).toUpperCase() + selectedWeekday.slice(1)} · событий: ${selectedEvents.length}` : "Нажмите на дату в месячной сетке"} className="xl:sticky xl:top-6">
        {selectedDay && selectedEvents.length ? <div className="space-y-2.5">{selectedEvents.map((event) => <EventRow key={event.id} event={event} />)}</div> : <EmptyState title={selectedDay ? "В этот день событий нет" : "День не выбран"} text={selectedDay ? "Измените фильтры или добавьте операцию с этой датой." : "Выберите день, чтобы увидеть операции и планы."} action={selectedDay ? <Button variant="outline" className="min-h-11 gap-2" onClick={() => navigate(`/operations?new=1&date=${selectedDay}`)}><Plus className="h-4 w-4" />Добавить на эту дату</Button> : undefined} />}
      </Section>
    </div>

    {model.undatedPayments.length > 0 && <section className="surface mt-5 p-5 sm:p-6"><div className="flex items-start gap-3"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" /><div><h2 className="font-semibold">Платежи без точного расписания</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Их нельзя честно поставить на конкретный день. Укажите день месяца, а для редкого платежа — ещё и ближайшую дату.</p><div className="mt-3 flex flex-wrap gap-2">{model.undatedPayments.map((payment) => <span key={payment.id} className="rounded-full bg-secondary px-3 py-1.5 text-sm">{payment.name}</span>)}</div><Button variant="outline" className="mt-4 min-h-11" onClick={() => navigate("/plan")}>Настроить платежи</Button></div></div></section>}
  </div>;
}
