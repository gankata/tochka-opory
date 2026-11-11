import { useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  Download,
  Plus,
  Table2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { currencyMoney } from "@contracts/currencies";
import { trpc } from "@/providers/trpc";
import type { Transaction } from "@/types";
import {
  analyticsGroupAvailable,
  buildAnalyticsBuckets,
  buildAnalyticsModel,
  makeAnalyticsRange,
  resolveAnalyticsRange,
  type AnalyticsCategory,
  type AnalyticsGroup,
  type AnalyticsKind,
  type AnalyticsModel,
  type AnalyticsPeriod,
  type AnalyticsRange,
} from "@/lib/analytics";
import { categoryTone } from "@/lib/category-colors";
import {
  calculateWorkspace,
  downloadBlob,
  formatDate,
  money,
  operationAmount,
  operationCurrency,
  todayISO,
  toCsv,
} from "@/lib/utils-app";
import { buildCashFlowForecast, buildUnconfirmedIncomeSchedule } from "@/lib/cash-flow";
import type { Workspace } from "@/types";
import { DatePicker } from "@/components/app/DatePicker";
import AnalyticsSavedViews from "@/components/app/AnalyticsSavedViews";
import {
  Button,
} from "@/components/ui/button";
import {
  EmptyState,
  ErrorPage,
  Field,
  LoadingPage,
  Metric,
  PageHeader,
  Section,
} from "@/components/app/Common";

const periodOptions: Array<{ value: AnalyticsPeriod; label: string }> = [
  { value: "month", label: "Месяц" },
  { value: "3m", label: "3 мес." },
  { value: "6m", label: "6 мес." },
  { value: "12m", label: "12 мес." },
  { value: "all", label: "Всё время" },
  { value: "custom", label: "Свой период" },
];

const groupOptions: Array<{ value: AnalyticsGroup; label: string }> = [
  { value: "day", label: "Дни" },
  { value: "week", label: "Недели" },
  { value: "month", label: "Месяцы" },
];

const percent = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const compactNumber = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(callback: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => false,
  );
}

function operationWord(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return "операций";
  if (mod10 === 1) return "операция";
  if (mod10 >= 2 && mod10 <= 4) return "операции";
  return "операций";
}

function rangeText(range: AnalyticsRange) {
  return `${formatDate(range.start)} — ${formatDate(range.end)}`;
}

function chartTooltipStyle() {
  return {
    borderRadius: 12,
    border: "1px solid oklch(var(--border))",
    backgroundColor: "oklch(var(--popover))",
    color: "oklch(var(--popover-foreground))",
    fontFamily: "Onest",
  };
}

function OperationAmount({ transaction }: { transaction: Transaction }) {
  const currency = operationCurrency(transaction);
  return <>
    <span className="number whitespace-nowrap">{currencyMoney(Math.abs(operationAmount(transaction)), currency)}</span>
    {currency !== "RUB" && <span className="mt-0.5 block text-xs text-muted-foreground">курс {transaction.exchangeRate ?? "—"}</span>}
  </>;
}

function OperationDetails({ transaction, onOpen }: { transaction: Transaction; onOpen: () => void }) {
  return <div className="min-w-0">
    <button type="button" onClick={onOpen} className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-left font-medium hover:text-primary">
      <span className="truncate">{transaction.note || transaction.source || transaction.category}</span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
    <p className="truncate text-xs text-muted-foreground">{[transaction.source, transaction.note].filter(Boolean).join(" · ") || "Без комментария"}</p>
  </div>;
}

function CategoryTrend({ category, model, group, color }: {
  category: AnalyticsCategory;
  model: AnalyticsModel;
  group: AnalyticsGroup;
  color: string;
}) {
  const buckets = buildAnalyticsBuckets(category.transactions, model.range, group);
  const maximum = Math.max(...buckets.map((bucket) => bucket.total), 0);
  return <div className="min-w-0 rounded-xl bg-card/70 p-4">
    <h3 className="text-sm font-semibold">Динамика категории</h3>
    <p className="mt-1 text-xs text-muted-foreground">Те же интервалы, что в основном графике. Нулевые значения тоже показаны.</p>
    <ol className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1" aria-label={`Динамика категории ${category.name}`}>
      {buckets.map((bucket) => <li key={bucket.key}>
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-muted-foreground">{bucket.fullLabel}</span>
          <span className="number shrink-0 font-medium">{money(bucket.total)}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: maximum ? `${bucket.total / maximum * 100}%` : 0, backgroundColor: color }} />
        </div>
      </li>)}
    </ol>
  </div>;
}

function CategoryOperations({ category, navigate }: { category: AnalyticsCategory; navigate: (path: string) => void }) {
  const open = (id: number) => navigate(`/operations?focus=${id}`);
  return <div className="min-w-0 rounded-xl bg-card/70 p-4">
    <h3 className="text-sm font-semibold">Операции категории</h3>
    <p className="mt-1 text-xs text-muted-foreground">Исходная валюта и рублёвый эквивалент сохранены отдельно.</p>
    <div className="mt-3 hidden overflow-x-auto md:block">
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-2 font-medium">Дата</th><th className="pb-2 font-medium">Источник или комментарий</th><th className="pb-2 text-right font-medium">Исходная сумма</th><th className="pb-2 text-right font-medium">Сумма, ₽</th></tr></thead>
        <tbody>{category.transactions.map((transaction) => <tr key={transaction.id} className="border-b last:border-0">
          <td className="py-2 pr-3 align-middle whitespace-nowrap">{formatDate(transaction.operationDate)}</td>
          <td className="max-w-72 py-2 pr-3"><OperationDetails transaction={transaction} onOpen={() => open(transaction.id)} /></td>
          <td className="py-2 pl-3 text-right align-middle"><OperationAmount transaction={transaction} /></td>
          <td className="number py-2 pl-4 text-right align-middle whitespace-nowrap">{money(Math.abs(transaction.amountRub))}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="mt-3 space-y-2 md:hidden">{category.transactions.map((transaction) => <article key={transaction.id} className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-3"><OperationDetails transaction={transaction} onOpen={() => open(transaction.id)} /><span className="number shrink-0 text-sm font-semibold">{money(Math.abs(transaction.amountRub))}</span></div>
      <div className="mt-2 flex items-end justify-between gap-3 text-xs text-muted-foreground"><span>{formatDate(transaction.operationDate)}</span><OperationAmount transaction={transaction} /></div>
    </article>)}</div>
  </div>;
}

function AnalyticsChart({ model, group, kind }: { model: AnalyticsModel; group: AnalyticsGroup; kind: AnalyticsKind }) {
  const reducedMotion = useReducedMotion();
  const maxBucket = [...model.buckets].sort((a, b) => b.total - a.total)[0];
  const label = kind === "expense" ? "Расход" : "Доход";
  const color = kind === "expense" ? "oklch(var(--chart-expense))" : "oklch(var(--chart-income))";
  const tickInterval = Math.max(0, Math.ceil(model.buckets.length / 8) - 1);
  return <div>
    <p className="sr-only">Всего {money(model.total)} за {model.buckets.length} интервалов. {maxBucket?.total ? `Наибольшая сумма ${money(maxBucket.total)}: ${maxBucket.fullLabel}.` : "Все интервалы пустые."}</p>
    <div className="h-[300px] w-full min-w-0" role="img" aria-label={`График: ${label.toLowerCase()} по ${group === "day" ? "дням" : group === "week" ? "неделям" : "месяцам"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={model.buckets} margin={{ top: 12, right: 4, left: -10, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="oklch(var(--chart-grid))" />
          <XAxis dataKey="label" interval={tickInterval} axisLine={false} tickLine={false} tick={{ fill: "oklch(var(--chart-axis))", fontSize: 11 }} minTickGap={14} />
          <YAxis axisLine={false} tickLine={false} width={62} tick={{ fill: "oklch(var(--chart-axis))", fontSize: 11 }} tickFormatter={(value) => compactNumber.format(Number(value))} />
          <Tooltip formatter={(value) => [money(Number(value)), label]} labelFormatter={(_, payload) => payload[0]?.payload?.fullLabel ?? ""} cursor={{ fill: "oklch(var(--secondary))" }} contentStyle={chartTooltipStyle()} />
          <Bar dataKey="total" fill={color} radius={[6, 6, 2, 2]} maxBarSize={44} isAnimationActive={!reducedMotion} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

function DynamicsTable({ model }: { model: AnalyticsModel }) {
  return <div className="max-h-[420px] overflow-auto rounded-xl border">
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 bg-card"><tr className="border-b text-xs text-muted-foreground"><th className="p-3 font-medium">Период</th><th className="p-3 text-right font-medium">Операций</th><th className="p-3 text-right font-medium">Сумма, ₽</th></tr></thead>
      <tbody>{model.buckets.map((bucket) => <tr key={bucket.key} className="border-b last:border-0"><td className="p-3">{bucket.fullLabel}</td><td className="number p-3 text-right">{bucket.count}</td><td className="number p-3 text-right whitespace-nowrap">{money(bucket.total)}</td></tr>)}</tbody>
    </table>
  </div>;
}

function CategoryComposition({ model, kind }: { model: AnalyticsModel; kind: AnalyticsKind }) {
  const reducedMotion = useReducedMotion();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const primary = model.categories.slice(0, 6);
  const rest = model.categories.slice(6);
  const restTotal = rest.reduce((sum, category) => sum + category.total, 0);
  const chartCategories = [
    ...primary.map((category) => ({ ...category, color: categoryTone(category.name).dot })),
    ...(rest.length ? [{ name: "Прочие", total: restTotal, share: rest.reduce((sum, category) => sum + category.share, 0), count: rest.reduce((sum, category) => sum + category.count, 0), color: "#8b938e" }] : []),
  ];
  const activeCategory = hoveredIndex == null ? null : chartCategories[hoveredIndex] ?? null;
  return <Section title={kind === "expense" ? "Куда уходят деньги" : "Откуда приходят деньги"} description={model.categories[0] ? `Лидер периода: ${model.categories[0].name} — ${percent.format(model.categories[0].share)}% всех сумм. Наведите на сектор или строку для деталей.` : "Категории появятся после первой операции."}>
    <div
      className="category-composition-chart relative mx-auto h-56 max-w-80"
      role="img"
      aria-label={`Кольцевая диаграмма категорий. ${chartCategories.map((category) => `${category.name}: ${money(category.total)}, ${percent.format(category.share)} процентов`).join(". ")}`}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart tabIndex={-1} aria-hidden="true">
          <Pie data={chartCategories} dataKey="total" nameKey="name" rootTabIndex={-1} innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="oklch(var(--card))" strokeWidth={2} isAnimationActive={!reducedMotion} animationDuration={500} onMouseEnter={(_, index) => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)}>
            {chartCategories.map((category, index) => <Cell key={category.name} fill={category.color} opacity={hoveredIndex == null || hoveredIndex === index ? 1 : 0.42} style={{ outline: "none", transition: "opacity 160ms ease" }} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
        <span className="text-[11px] text-muted-foreground">{activeCategory ? "Категория" : "Всего"}</span>
        {activeCategory && <span className="mt-1 max-w-full truncate text-[11px] font-medium" title={activeCategory.name}>{activeCategory.name}</span>}
        <span className="number mt-1 max-w-full truncate text-base font-semibold" title={money(activeCategory?.total ?? model.total)}>{money(activeCategory?.total ?? model.total)}</span>
        <span className="mt-0.5 text-[11px] text-muted-foreground">{activeCategory ? `${percent.format(activeCategory.share)}% периода` : `Категорий: ${chartCategories.length}`}</span>
      </div>
    </div>
    <ol className="category-composition-legend mt-5 space-y-1.5" aria-label="Рейтинг категорий">
      {chartCategories.map((category, index) => <li key={category.name} onMouseEnter={() => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} className={`rounded-lg px-2 py-1.5 transition-colors ${hoveredIndex === index ? "bg-secondary/75" : ""}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 text-sm">
          <span className="flex min-w-0 items-start gap-2"><span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} /><span className="min-w-0 break-words leading-snug" title={category.name}>{category.name}</span></span>
          <span className="number whitespace-nowrap text-right font-medium">{money(category.total)}</span>
        </div>
        <p className="mt-1 pl-[18px] text-xs text-muted-foreground">{percent.format(category.share)}% · {category.count} {operationWord(category.count)}</p>
      </li>)}
    </ol>
  </Section>;
}

function CashFlowForecast({ data }: { data: Workspace }) {
  const reducedMotion = useReducedMotion();
  const forecast = useMemo(() => buildCashFlowForecast(data.transactions, data.payments, calculateWorkspace(data).bookRub), [data]);
  const unconfirmedIncome = useMemo(() => buildUnconfirmedIncomeSchedule({ ...data.settings!, incomeSources: data.incomeSources }, todayISO(), forecast.end), [data.settings, data.incomeSources, forecast.end]);
  const endingBalance = forecast.points.at(-1)?.balance ?? 0;
  const startsNegative = (forecast.points[0]?.balance ?? 0) < 0;
  return <Section title="Прогноз остатка на 90 дней" description="Сценарий без неподтверждённых доходов: только текущие рубли, внесённые будущие операции и регулярные платежи. Валюта и неизвестные суммы плановых поступлений не добавляются автоматически." className="mt-5">
    {unconfirmedIncome.length > 0 && <div className="mb-4 rounded-xl border border-dashed border-border bg-secondary/30 p-4" data-testid="unconfirmed-income-schedule">
      <p className="text-sm font-medium">Плановые даты выплат — без суммы в прогнозе</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Это календарные отметки из настроек, а не подтверждённые поступления. Их суммы не угадываются по прошлым месяцам. Внесённые будущие доходы учитываются отдельно.</p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Плановые выплаты без суммы в прогнозе">
        {unconfirmedIncome.map((payment) => <li key={`${payment.kind}-${payment.isoDate}`} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs">{payment.label}: {formatDate(payment.isoDate)}</li>)}
      </ul>
    </div>}
    <div className="mb-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-secondary/45 p-4"><p className="text-xs text-muted-foreground">Рублёвый остаток на {formatDate(forecast.end)}</p><p className={`number mt-1 text-xl font-semibold ${endingBalance < 0 ? "text-destructive" : ""}`}>{money(endingBalance)}</p></div>
      <div className="rounded-xl bg-secondary/45 p-4"><p className="text-xs text-muted-foreground">Минимум сценария в ₽</p><p className={`number mt-1 text-xl font-semibold ${forecast.lowest.balance < 0 ? "text-destructive" : ""}`}>{money(forecast.lowest.balance)} <span className="text-xs font-normal text-muted-foreground">· {formatDate(forecast.lowest.date)}</span></p></div>
    </div>
    {forecast.firstNegative && <div role="alert" className="mb-4 rounded-xl border border-destructive/25 bg-destructive/5 p-4">
      <p className="font-medium text-destructive">{startsNegative ? "Рублёвый остаток уже отрицательный." : `По сценарию рублёвый остаток станет отрицательным ${formatDate(forecast.firstNegative.date)}.`}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Минимум: {money(forecast.lowest.balance)}. Измените план или внесите будущий доход в ₽; имеющаяся иностранная валюта не покрывает дефицит автоматически.</p>
    </div>}
    <div className="cash-flow-chart h-64" role="img" aria-label={`Прогноз рублёвого остатка. Минимум ${money(forecast.lowest.balance)} ${forecast.lowest.date}.${forecast.firstNegative ? ` Первый дефицит ${forecast.firstNegative.date}.` : " Отрицательных значений нет."}`}>
      <ResponsiveContainer width="100%" height="100%"><LineChart data={forecast.points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="oklch(var(--chart-grid))" />
        <XAxis dataKey="label" interval={Math.floor(forecast.points.length / 6)} tick={{ fontSize: 11, fill: "oklch(var(--chart-axis))" }} axisLine={false} tickLine={false} />
        <YAxis width={65} domain={[(dataMin: number) => Math.min(0, dataMin), (dataMax: number) => Math.max(0, dataMax)]} tick={{ fontSize: 11, fill: "oklch(var(--chart-axis))" }} tickFormatter={(value) => compactNumber.format(Number(value))} axisLine={false} tickLine={false} />
        <Tooltip formatter={(value) => money(Number(value))} labelFormatter={(_, payload) => payload[0] ? formatDate(payload[0].payload.date) : ""} contentStyle={chartTooltipStyle()} />
        {forecast.firstNegative && <ReferenceArea x1={forecast.points[0]?.label} x2={forecast.points.at(-1)?.label} y1={Math.min(0, forecast.lowest.balance)} y2={0} fill="oklch(var(--destructive))" fillOpacity={0.09} />}
        <ReferenceLine y={0} stroke="oklch(var(--destructive))" strokeWidth={1.5} strokeDasharray="5 4" label={{ value: "0 ₽", position: "insideTopRight", fill: "oklch(var(--destructive))", fontSize: 11 }} />
        <Line type="monotone" dataKey="balance" name="Рублёвый остаток" stroke="oklch(var(--chart-income))" strokeWidth={2.5} dot={false} isAnimationActive={!reducedMotion} />
      </LineChart></ResponsiveContainer>
    </div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-label="Легенда прогноза">
      <span className="flex items-center gap-2"><span aria-hidden="true" className="h-0.5 w-6" style={{ backgroundColor: "oklch(var(--chart-income))" }} />Прогноз по рублёвым операциям</span>
      <span className="flex items-center gap-2"><span aria-hidden="true" className="w-6 border-t-2 border-dashed border-destructive" />0 ₽ — граница бюджета</span>
      {forecast.firstNegative && <span className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-6 bg-destructive/10" />Зона дефицита</span>}
    </div>
  </Section>;
}

export default function Analytics() {
  const query = trpc.workspace.get.useQuery();
  const navigate = useNavigate();
  const [kind, setKind] = useState<AnalyticsKind>("expense");
  const [period, setPeriod] = useState<AnalyticsPeriod>("6m");
  const [group, setGroup] = useState<AnalyticsGroup>("month");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [customStart, setCustomStart] = useState(() => todayISO());
  const [customEnd, setCustomEnd] = useState(() => todayISO());
  const [expanded, setExpanded] = useState<string | null>(null);
  const data = query.data;

  const range = useMemo(() => data ? resolveAnalyticsRange(period, data.transactions, todayISO(), customStart, customEnd) : null, [data, period, customStart, customEnd]);
  const effectiveGroup: AnalyticsGroup = range && !analyticsGroupAvailable(range, group) ? "month" : group;
  const model = useMemo(() => data ? buildAnalyticsModel(data.transactions, { kind, period, group: effectiveGroup, customStart, customEnd }) : null, [data, kind, period, effectiveGroup, customStart, customEnd]);

  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !data || !model || !range) return <ErrorPage retry={() => query.refetch()} />;

  const changePeriod = (next: AnalyticsPeriod) => {
    setPeriod(next);
    setExpanded(null);
    const nextRange = resolveAnalyticsRange(next, data.transactions, todayISO(), customStart, customEnd);
    if (!analyticsGroupAvailable(nextRange, group)) setGroup("month");
  };
  const changeCustomDate = (side: "start" | "end", value: string) => {
    const start = side === "start" ? value : customStart;
    const end = side === "end" ? value : customEnd;
    if (side === "start") setCustomStart(value); else setCustomEnd(value);
    setPeriod("custom");
    setExpanded(null);
    if (!analyticsGroupAvailable(makeAnalyticsRange(start, end), group)) setGroup("month");
  };
  const changeKind = (next: AnalyticsKind) => {
    setKind(next);
    setExpanded(null);
  };
  const exportCsv = () => {
    const rows: Array<Array<string | number | null>> = [["Дата", "Тип", "Категория", "Исходная сумма", "Валюта", "Курс", "Сумма RUB", "Источник", "Комментарий"]];
    for (const transaction of model.transactions) {
      rows.push([
        transaction.operationDate,
        transaction.type,
        transaction.category,
        Math.abs(operationAmount(transaction)),
        operationCurrency(transaction),
        transaction.exchangeRate,
        Math.abs(transaction.amountRub),
        transaction.source,
        transaction.note,
      ]);
    }
    downloadBlob(toCsv(rows), `analytics-${kind}-${model.range.start}-${model.range.end}.csv`, "text/csv;charset=utf-8");
    toast.success("CSV с текущей выборкой сохранён");
  };

  const noun = kind === "expense" ? "расходов" : "доходов";
  const changeTone = model.change === 0 ? "default" : kind === "expense" ? model.change > 0 ? "danger" : "good" : model.change > 0 ? "good" : "danger";
  const comparisonValue = model.previousTotal === 0 ? "Нет сравнения" : `${model.changePercent! > 0 ? "+" : ""}${percent.format(model.changePercent!)}%`;
  const maxGroupWarning = !analyticsGroupAvailable(range, group);

  return <div className="page-enter">
    <PageHeader eyebrow="Финансовая аналитика" title="Закономерности в ваших деньгах" description="Изучайте внесённые операции по периодам и категориям. Можно начать с текущих записей: аналитика показывает только имеющиеся данные и не оценивает пропущенные траты. Суммы — в рублях по курсу на дату записи." action={<Button variant="outline" onClick={exportCsv} disabled={!model.count} className="min-h-11 w-full gap-2 sm:w-auto"><Download className="h-4 w-4" />Экспорт CSV</Button>} />

    <section className="surface mb-5 p-4 sm:p-5" aria-label="Фильтры аналитики">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-2 rounded-xl bg-secondary/70 p-1" aria-label="Тип аналитики">
          <button type="button" onClick={() => changeKind("expense")} aria-pressed={kind === "expense"} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ${kind === "expense" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><TrendingDown className="h-4 w-4" />Расходы</button>
          <button type="button" onClick={() => changeKind("income")} aria-pressed={kind === "income"} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium ${kind === "income" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><TrendingUp className="h-4 w-4" />Доходы</button>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Период аналитики">{periodOptions.map((option) => <button key={option.value} type="button" onClick={() => changePeriod(option.value)} aria-pressed={period === option.value} className={`min-h-11 rounded-lg px-3 text-sm font-medium ${period === option.value ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{option.label}</button>)}</div>
      </div>
      <AnalyticsSavedViews
        kind={kind}
        period={period}
        group={effectiveGroup}
        customStart={customStart}
        customEnd={customEnd}
        suggestedName={`${kind === "expense" ? "Расходы" : "Доходы"} · ${periodOptions.find((item) => item.value === period)?.label}`}
        onApply={(saved) => {
          setKind(saved.kind);
          setPeriod(saved.period);
          setGroup(saved.group);
          setCustomStart(saved.customStart);
          setCustomEnd(saved.customEnd);
          setExpanded(null);
        }}
      />
      {period === "custom" && <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2 lg:max-w-2xl"><Field label="Начало периода"><DatePicker required aria-label="Начало периода" value={customStart} onChange={(value) => changeCustomDate("start", value)} /></Field><Field label="Конец периода"><DatePicker required aria-label="Конец периода" value={customEnd} onChange={(value) => changeCustomDate("end", value)} /></Field></div>}
      <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-medium">Детализация динамики</p><p className="mt-0.5 text-xs text-muted-foreground">{rangeText(range)} · {range.days} {range.days === 1 ? "день" : "дн."}</p></div>
        <div className="grid grid-cols-3 rounded-xl bg-secondary/70 p-1" aria-label="Группировка динамики">{groupOptions.map((option) => <button key={option.value} type="button" disabled={!analyticsGroupAvailable(range, option.value)} onClick={() => { setGroup(option.value); setExpanded(null); }} aria-pressed={effectiveGroup === option.value} className={`min-h-11 rounded-lg px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${effectiveGroup === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{option.label}</button>)}</div>
      </div>
      {maxGroupWarning && <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">Для такого длинного периода по дням нужно больше 500 интервалов. Автоматически выбрана группировка по месяцам.</p>}
    </section>

    <section className="surface mb-5 overflow-hidden" aria-label="Ключевые показатели">
      <div className="grid gap-px bg-border/70 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-5"><Metric label={kind === "expense" ? "Расходы за период" : "Доходы за период"} value={money(model.total)} note={rangeText(range)} /></div>
        <div className="bg-card p-5"><Metric label="К предыдущему периоду" value={comparisonValue} note={model.previousTotal === 0 ? `За предыдущие ${range.days} дн. записей о ${noun} нет — процент изменения не рассчитывается` : `${model.change >= 0 ? "+" : "−"}${money(Math.abs(model.change))} · ${rangeText(model.previousRange)}`} tone={changeTone} /></div>
        <div className="bg-card p-5"><Metric label="В среднем в месяц" value={money(model.monthlyAverage)} note="Итог делится на календарные месяцы диапазона" /></div>
        <div className="bg-card p-5"><Metric label="Средний чек" value={money(model.average)} note={`${model.count} ${operationWord(model.count)} · в прошлом периоде ${model.previousCount}`} /></div>
      </div>
    </section>

    {model.count === 0 ? <Section title="Нет данных для анализа" hint="В выбранном диапазоне нет подходящих записей. Измените период или добавьте операцию — приложение не подставляет значения за прошлые события."><EmptyState title={`В этом периоде нет ${noun}`} text="Выберите другой диапазон или добавьте операцию. Аналитика не изменяет записи и не подставляет прогнозные значения." action={<Button onClick={() => navigate(`/operations?new=1&type=${kind === "expense" ? "Расход" : "Доход"}`)} className="min-h-11 gap-2"><Plus className="h-4 w-4" />{kind === "expense" ? "Добавить расход" : "Добавить доход"}</Button>} /></Section> : <>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <Section title={`Динамика ${noun}`} description={`Непрерывная шкала по ${effectiveGroup === "day" ? "дням" : effectiveGroup === "week" ? "неделям с понедельника" : "месяцам"}; пустые интервалы не скрыты.`} action={<div className="grid grid-cols-2 rounded-lg bg-secondary/70 p-1" aria-label="Представление динамики"><button type="button" onClick={() => setView("chart")} aria-pressed={view === "chart"} className={`flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${view === "chart" ? "bg-card shadow-sm" : "text-muted-foreground"}`}><BarChart3 className="h-4 w-4" />График</button><button type="button" onClick={() => setView("table")} aria-pressed={view === "table"} className={`flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${view === "table" ? "bg-card shadow-sm" : "text-muted-foreground"}`}><Table2 className="h-4 w-4" />Таблица</button></div>}>
          {view === "chart" ? <AnalyticsChart model={model} group={effectiveGroup} kind={kind} /> : <DynamicsTable model={model} />}
        </Section>
        <CategoryComposition model={model} kind={kind} />
      </div>

      <Section title="Категории и отдельные операции" description="Нажмите на строку: откроются динамика именно этой категории, исходные суммы, даты, источники и комментарии." className="mt-5">
        <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_150px_90px_24px] gap-3 px-4 text-xs font-medium text-muted-foreground sm:grid"><span>Категория</span><span className="text-right">Сумма</span><span className="text-right">Доля</span><span /></div>
        <div className="space-y-2">{model.categories.map((category, index) => {
          const isOpen = expanded === category.name;
          const color = categoryTone(category.name).dot;
          const contentId = `analytics-category-${index}`;
          return <article key={category.name} className="soft-surface overflow-hidden">
            <button type="button" onClick={() => setExpanded(isOpen ? null : category.name)} aria-expanded={isOpen} aria-controls={contentId} className="grid min-h-16 w-full grid-cols-[minmax(0,1fr)_auto_20px] items-center gap-3 p-4 text-left hover:bg-secondary/55 sm:grid-cols-[minmax(0,1fr)_150px_90px_24px]">
              <span className="min-w-0"><span className="flex items-center gap-2 font-medium"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} /><span className="truncate">{category.name}</span></span><span className="mt-1 block text-xs text-muted-foreground">{category.count} {operationWord(category.count)} · последняя {formatDate(category.latestDate)}</span></span>
              <span className="number text-right font-semibold">{money(category.total)}</span>
              <span className="number hidden text-right text-sm text-muted-foreground sm:block">{percent.format(category.share)}%</span>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && <div id={contentId} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-t p-3 sm:p-4 xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]"><CategoryTrend category={category} model={model} group={effectiveGroup} color={color} /><CategoryOperations category={category} navigate={navigate} /></div>}
          </article>;
        })}</div>
      </Section>
    </>}

    <CashFlowForecast data={data} />

    <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ArrowDownRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />В аналитику входят все фактические доходы и расходы выбранных дат, включая записи до стартовой даты плана. Обмены и будущие операции исключены; разные исходные валюты не складываются между собой.</p>
  </div>;
}
