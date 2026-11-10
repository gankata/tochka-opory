import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowDown, ArrowRight, ArrowUp, CalendarClock, ChevronDown, ChevronRight, Eye, EyeOff, HeartPulse, Plus, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { currencyDefinition, currencyMoney } from "@contracts/currencies";
import { trpc } from "@/providers/trpc";
import { calculateWorkspace, formatDate, money, nextReminder, operationAmount, operationCurrency, positiveForeignBalances } from "@/lib/utils-app";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorPage, LoadingPage, Metric, PageHeader, Section } from "@/components/app/Common";

type DashboardBlock = "metrics" | "wallets" | "planning" | "insights" | "reminders";
const dashboardLabels: Record<DashboardBlock, string> = { metrics: "Ключевые показатели", wallets: "Кошелёк по валютам", planning: "Доход и запас", insights: "Доходы и состояние", reminders: "Напоминания" };
const defaultDashboardOrder: DashboardBlock[] = ["metrics", "wallets", "planning", "insights", "reminders"];
type DashboardPreferences = { order: DashboardBlock[]; hidden: DashboardBlock[]; compact: boolean };
function readDashboardPreferences(): DashboardPreferences {
  const fallback = { order: defaultDashboardOrder, hidden: [], compact: false };
  try {
    const value = JSON.parse(localStorage.getItem("tochka-dashboard") ?? "null") as Partial<DashboardPreferences> | null;
    if (!value || !Array.isArray(value.order)) return fallback;
    const order = value.order.filter((item): item is DashboardBlock => defaultDashboardOrder.includes(item));
    return { order: [...order, ...defaultDashboardOrder.filter((item) => !order.includes(item))], hidden: Array.isArray(value.hidden) ? value.hidden : [], compact: Boolean(value.compact) };
  } catch { return fallback; }
}

export default function Dashboard() {
  const query = trpc.workspace.get.useQuery();
  const navigate = useNavigate();
  const data = query.data;
  const [preferences, setPreferences] = useState<DashboardPreferences>(readDashboardPreferences);
  const [customizing, setCustomizing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const calc = useMemo(() => data?.settings ? calculateWorkspace(data) : null, [data]);
  if (query.isLoading) return <LoadingPage />;
  if (query.isError || !data?.settings || !calc) return <ErrorPage retry={() => query.refetch()} />;

  const chartData = Object.entries(calc.actualTransactions.filter((t) => t.type === "Доход").reduce<Record<string, number>>((acc, t) => {
    const key = t.operationDate.slice(0, 7); acc[key] = (acc[key] ?? 0) + t.amountRub; return acc;
  }, {})).sort(([a], [b]) => a.localeCompare(b)).slice(-9).map(([key, value]) => ({ month: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(`${key}-02T12:00:00`)), value }));
  const upcoming = data.reminders.filter((r) => r.enabled).map((r) => ({ reminder: r, next: nextReminder(r) })).filter((r) => r.next).sort((a, b) => a.next!.getTime() - b.next!.getTime()).slice(0, 3);
  const recentMoods = data.moods.slice(0, 7);
  const averageMood = recentMoods.length ? recentMoods.reduce((sum, m) => sum + m.mood, 0) / recentMoods.length : null;
  const recentTransactions = calc.actualTransactions.slice(0, 4);
  const foreignBalances = positiveForeignBalances(calc.currencyBalances);
  const missingVisibleRates = foreignBalances.filter((balance) => !(balance.rate > 0)).map((balance) => balance.code);
  const reservePercent = calc.reserveTarget ? Math.min(100, Math.max(0, calc.reserveBase / calc.reserveTarget * 100)) : 100;
  const salaryForecast = calc.salaryPayment && calc.salary && calc.salaryDaysLeft !== null && calc.forecastAfterSalary !== null && calc.knownBeforeSalary !== null && calc.possibleBeforeSalary !== null ? {
    payment: calc.salaryPayment,
    date: calc.salary,
    daysLeft: calc.salaryDaysLeft,
    forecast: calc.forecastAfterSalary,
    known: calc.knownBeforeSalary,
    possible: calc.possibleBeforeSalary,
  } : null;
  const missingDates = data.payments.filter((p) => !p.dayOfMonth && !p.nextDate).length;
  const unsetEnvelopes = data.envelopes.filter((e) => e.monthlyLimit == null && e.estimatedAmount == null).length;
  const dateTitle = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const savePreferences = (next: DashboardPreferences) => { setPreferences(next); localStorage.setItem("tochka-dashboard", JSON.stringify(next)); };
  const blockStyle = (block: DashboardBlock) => ({ order: preferences.order.indexOf(block) });
  const advancedBlockStyle = (block: DashboardBlock) => ({ order: preferences.order.indexOf(block) + 1 });
  const blockClass = (block: DashboardBlock) => preferences.hidden.includes(block) ? "hidden" : "";
  const moveBlock = (block: DashboardBlock, direction: -1 | 1) => {
    const order = [...preferences.order]; const index = order.indexOf(block); const target = index + direction;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]]; savePreferences({ ...preferences, order });
  };
  const toggleCustomizing = () => {
    const next = !customizing;
    setCustomizing(next);
    if (next) setShowDetails(true);
  };

  return <div className={`page-enter ${preferences.compact ? "dashboard-compact" : ""}`}>
    <PageHeader eyebrow={dateTitle.charAt(0).toUpperCase() + dateTitle.slice(1)} title="Всё важное — на одном экране" description="Записывайте события дня и смотрите только актуальные остатки. Подробный финансовый обзор доступен ниже." action={<div className="flex flex-col gap-2 sm:flex-row"><Button variant="outline" onClick={() => navigate("/mood?new=1")} className="min-h-11 gap-2"><HeartPulse className="h-4 w-4" />Записать настроение</Button><Button onClick={() => navigate("/operations?new=1")} className="min-h-11 gap-2"><Plus className="h-4 w-4" />Добавить операцию</Button></div>} />
    {customizing && <Section title="Ваш главный экран" description="Скрывайте блоки, меняйте порядок и плотность. Настройка сохраняется только в этом браузере." className="mb-5"><div className="space-y-2">{preferences.order.map((block, index) => <div key={block} className="flex items-center gap-1 rounded-xl bg-secondary/40 p-2"><span className="min-w-0 flex-1 px-2 text-sm font-medium">{dashboardLabels[block]}</span><Button variant="ghost" size="icon" className="h-10 w-10" disabled={index === 0} aria-label={`Поднять ${dashboardLabels[block]}`} onClick={() => moveBlock(block, -1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="h-10 w-10" disabled={index === preferences.order.length - 1} aria-label={`Опустить ${dashboardLabels[block]}`} onClick={() => moveBlock(block, 1)}><ArrowDown className="h-4 w-4" /></Button><Button variant="ghost" className="min-h-10 gap-2" onClick={() => savePreferences({ ...preferences, hidden: preferences.hidden.includes(block) ? preferences.hidden.filter((item) => item !== block) : [...preferences.hidden, block] })}>{preferences.hidden.includes(block) ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}{preferences.hidden.includes(block) ? "Показать" : "Скрыть"}</Button></div>)}</div><Button variant="outline" className="mt-4 min-h-11" aria-pressed={preferences.compact} onClick={() => savePreferences({ ...preferences, compact: !preferences.compact })}>{preferences.compact ? "Обычная плотность" : "Компактный режим"}</Button></Section>}

    <div className="flex flex-col">
      <section style={blockStyle("metrics")} className={`surface mb-5 overflow-hidden ${blockClass("metrics")}`} aria-label="Доступные деньги и остатки">
        <div className="grid gap-px bg-border/70 sm:grid-cols-2">
          <div className="bg-card p-5"><Metric label="Свободно тратить" value={money(calc.spendableRub)} note={calc.reserveGap > 0 ? "Сначала стоит закрыть нехватку выбранного запаса" : "Сверх запаса и отложенного на цели"} tone={calc.reserveGap > 0 ? "danger" : "good"} /></div>
          <div className="bg-card p-5"><Metric label="Рубли на счетах" value={money(calc.bookRub)} note="Наличные и карта по журналу" /></div>
        </div>
      </section>

      {foreignBalances.length > 0 && <Section
        title="Иностранная валюта"
        description="Здесь отображаются только валюты с положительным остатком. Полностью обменянная валюта автоматически исчезает."
        className={`mb-5 ${blockClass("wallets")}`}
        style={blockStyle("wallets")}
        action={<button onClick={() => navigate("/data?tab=settings")} className="min-h-11 text-sm font-medium text-primary">Курсы и остатки</button>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {foreignBalances.map((balance) => {
            const currency = currencyDefinition(balance.code);
            return <div key={balance.code} data-currency={balance.code} className="soft-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{balance.code}</span>
                <span className="text-xs text-muted-foreground">{currency.name}</span>
              </div>
              <p className="number mt-3 text-xl font-semibold">{currencyMoney(balance.amount, balance.code)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {balance.rubEquivalent == null ? "Укажите текущий курс в настройках" : `≈ ${money(balance.rubEquivalent)} · курс ${balance.rate}`}
              </p>
            </div>;
          })}
        </div>
        {missingVisibleRates.length > 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          Для {missingVisibleRates.join(", ")} не задан текущий курс. Остаток виден отдельно, но пока не входит в общую оценку в рублях.
        </p>}
      </Section>}

      <div style={{ order: 2 }} className="mb-5 grid gap-5 xl:grid-cols-[1.3fr_1fr]" data-dashboard-recent>
        <Section title="Последние операции" description="Недавние записи без дополнительных фильтров и расчётов." className="min-w-0" action={<button onClick={() => navigate("/operations")} className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary">Все операции<ArrowRight className="h-4 w-4" /></button>}>
          {recentTransactions.length ? <div className="divide-y">{recentTransactions.map((transaction) => {
            const code = operationCurrency(transaction);
            const amount = operationAmount(transaction);
            const positive = transaction.type === "Доход" || (transaction.type === "Обмен" && amount >= 0);
            return <button key={transaction.id} onClick={() => navigate("/operations")} className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left first:pt-0 last:pb-0">
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{transaction.category}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{formatDate(transaction.operationDate)}{transaction.note ? ` · ${transaction.note}` : ""}</span></span>
              <span className={`number shrink-0 text-sm font-semibold ${positive ? "text-primary" : ""}`}>{positive ? "+" : "−"}{currencyMoney(Math.abs(amount), code)}</span>
            </button>;
          })}</div> : <EmptyState title="Пока нет операций" text="Добавьте первый доход, расход или обмен — здесь появятся последние записи." action={<Button variant="outline" onClick={() => navigate("/operations?new=1")} className="min-h-11">Добавить операцию</Button>} />}
        </Section>

        <Section title="Последнее состояние" description="Короткие записи помогают вернуться к событиям дня." className="min-w-0" action={<button onClick={() => navigate("/mood")} className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary">Дневник<ArrowRight className="h-4 w-4" /></button>}>
          {data.moods.length ? <div className="divide-y">{data.moods.slice(0, 3).map((mood) => <button key={mood.id} onClick={() => navigate("/mood")} className="flex min-h-16 w-full items-center justify-between gap-4 py-3 text-left first:pt-0 last:pb-0"><span className="min-w-0"><span className="block truncate text-sm font-medium">{mood.emotion}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{formatDate(mood.entryDate)} · {mood.topic}</span></span><span className="number shrink-0 text-lg font-semibold">{mood.mood}</span></button>)}</div> : <EmptyState title="Дневник готов к первой записи" text="Достаточно даты, настроения, эмоции и темы — детали можно добавить позже." action={<Button variant="outline" onClick={() => navigate("/mood?new=1")} className="min-h-11">Сделать запись</Button>} />}
        </Section>
      </div>

      <div id="dashboard-details" className={showDetails ? "contents" : "hidden"}>
        <div style={advancedBlockStyle("planning")} className={`grid gap-5 xl:grid-cols-[1.3fr_1fr] ${blockClass("planning")}`}>
          {salaryForecast ? <Section title={salaryForecast.daysLeft === 0 ? "Зарплата сегодня" : `До зарплаты: ${salaryForecast.daysLeft} дн.`} description={`${salaryForecast.payment.label} — ${formatDate(salaryForecast.date)}${salaryForecast.payment.shifted ? ` Перенос с ${formatDate(salaryForecast.payment.nominalDate)}: ${salaryForecast.payment.shiftReason?.toLowerCase()}.` : ""} Рублёвый прогноз учитывает непроведённые платежи и плановые повседневные траты; другие валюты не входят.`}>
            <div className="mb-5 grid gap-2 sm:grid-cols-2">{calc.salarySchedule.map((payment) => <button key={`${payment.kind}-${payment.isoDate}`} onClick={() => navigate("/calendar")} className="rounded-xl bg-secondary/55 p-3 text-left transition-colors hover:bg-secondary"><p className="text-xs text-muted-foreground">{payment.label} · {payment.rule}</p><p className="number mt-0.5 font-semibold">{formatDate(payment.date)}</p>{payment.shifted && <p className="mt-1 text-[11px] text-muted-foreground">перенос: {payment.shiftReason?.toLowerCase()}</p>}</button>)}</div>
            <div className="grid gap-6 py-2 sm:grid-cols-2">
              <Metric label="Ожидаемый остаток в ₽" value={money(salaryForecast.forecast)} note={salaryForecast.forecast >= 0 ? "По текущему плану денег хватает" : "Нужно пересмотреть траты или даты платежей"} tone={salaryForecast.forecast >= 0 ? "good" : "danger"} />
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Точно до зарплаты</span><span className="number font-medium">{money(salaryForecast.known)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Возможные платежи</span><span className="number font-medium">{money(salaryForecast.possible)}</span></div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">План на жизнь в день</span><span className="number font-medium">{money(calc.dailyVariable)}</span></div>
              </div>
            </div>
            {(missingDates > 0 || unsetEnvelopes > 0) && <div className="mt-5 rounded-xl bg-secondary/70 p-4 text-sm"><span className="font-medium">Прогноз можно уточнить.</span><span className="text-muted-foreground"> {missingDates > 0 ? `У ${missingDates} платежей нет даты. ` : ""}{unsetEnvelopes > 0 ? `У ${unsetEnvelopes} конвертов нет оценки или лимита.` : ""}</span><button onClick={() => navigate("/plan")} className="mt-2 flex min-h-11 items-center gap-1 font-medium text-primary">Открыть план<ChevronRight className="h-4 w-4" /></button></div>}
          </Section> : <Section title="Доход без фиксированных дат" description="Подходит для ежедневной, сдельной и нерегулярной оплаты. Здесь нет обратного отсчёта и прогноза «до зарплаты» — только внесённые поступления.">
            <div className="flex items-start gap-3 rounded-xl bg-secondary/55 p-4"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="text-sm leading-relaxed">Записывайте доход в день получения. Запас, плановые платежи и аналитика используют фактические операции и продолжают работать.</p><p className="number mt-3 font-semibold">В этом месяце внесено: {money(calc.monthIncome)}</p></div></div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button className="min-h-11 gap-2" onClick={() => navigate("/operations?new=1&type=Доход")}><Plus className="h-4 w-4" />Добавить доход</Button><Button variant="outline" className="min-h-11" onClick={() => navigate("/data?tab=settings")}>Изменить график</Button></div>
          </Section>}

          <Section title="Неприкосновенный запас" description={`${money(calc.reserveBase)} доступно для запаса при цели ${money(calc.reserveTarget)}. Общая оценка всех валют: ${money(calc.totalRub)}.`}>
            <div className="mt-7 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${reservePercent}%` }} /></div>
            <div className="mt-3 flex justify-between text-sm"><span className="font-medium">{Math.round(reservePercent)}% цели</span><span className="text-muted-foreground">{money(calc.reserveGap)} осталось</span></div>
            <div className="mt-7 border-t pt-5"><Metric label={calc.reserveGap > 0 ? "Свободных сверх запаса нет" : "Свободно сверх запаса и целей"} value={money(calc.spendableRub)} note={calc.reserveGap > 0 ? `До выбранного запаса не хватает ${money(calc.reserveGap)}. Это не долг и не отрицательный баланс.` : `На цели уже отложено ${money(calc.allocatedGoals)}`} tone={calc.reserveGap > 0 ? "danger" : "good"} /></div>
            <div className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />Формула: остатки в ₽ по текущим курсам − отложенное на цели − целевой запас. Отрицательный результат показываем как нехватку, а не как разрешение тратить.</div>
          </Section>
        </div>

        <div style={advancedBlockStyle("insights")} className={`mt-5 grid gap-5 xl:grid-cols-[1.3fr_1fr] ${blockClass("insights")}`}>
          <Section title="Доходы по месяцам" description={`В этом месяце получено ${money(calc.monthIncome)}. Для осторожного прогноза: ${data.settings.incomeStrategy.toLowerCase()}.`}>
            {chartData.length ? <div className="h-64 w-full" aria-label="График доходов по месяцам"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 0, left: -14, bottom: 0 }}><CartesianGrid vertical={false} stroke="oklch(var(--chart-grid))" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "oklch(var(--chart-axis))", fontSize: 12 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "oklch(var(--chart-axis))", fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}к`} /><Tooltip formatter={(value) => [money(Number(value)), "Доход"]} cursor={{ fill: "oklch(var(--secondary))" }} contentStyle={{ borderRadius: 12, border: "1px solid oklch(var(--border))", backgroundColor: "oklch(var(--popover))", color: "oklch(var(--popover-foreground))", fontFamily: "Onest" }} /><Bar dataKey="value" fill="oklch(var(--chart-income))" radius={[5, 5, 0, 0]} maxBarSize={38} /></BarChart></ResponsiveContainer></div> : <EmptyState title="Пока нет доходов" text="Добавьте первое поступление в журнале операций." />}
          </Section>

          <Section title="Состояние" description="Короткая запись помогает заметить закономерности без самодиагностики." action={<button onClick={() => navigate("/mood?new=1")} className="flex min-h-11 items-center gap-1 text-sm font-medium text-primary">Записать<ArrowRight className="h-4 w-4" /></button>}>
            {averageMood != null ? <><div className="flex items-end gap-3"><span className="editorial text-5xl font-semibold">{averageMood.toFixed(1)}</span><span className="pb-2 text-sm text-muted-foreground">/ 10 · последние записи</span></div><div className="mt-5 space-y-3">{data.moods.slice(0, 3).map((m) => <button key={m.id} onClick={() => navigate("/mood")} className="flex min-h-11 w-full items-center justify-between gap-3 border-b pb-3 text-left last:border-0"><span><span className="block text-sm font-medium">{m.emotion}</span><span className="text-xs text-muted-foreground">{formatDate(m.entryDate)} · {m.topic}</span></span><span className="number text-lg font-semibold">{m.mood}</span></button>)}</div></> : <EmptyState title="Дневник готов к первой записи" text="Достаточно даты, настроения, эмоции и темы — детали можно добавить позже." action={<Button variant="outline" onClick={() => navigate("/mood?new=1")} className="min-h-11">Сделать запись</Button>} />}
          </Section>
        </div>

        <Section title="Ближайшие напоминания" description="Расписание хранится в приложении; его можно выгрузить в календарь телефона." className={`mt-5 ${blockClass("reminders")}`} style={advancedBlockStyle("reminders")}>
          {upcoming.length ? <div className="grid gap-2 md:grid-cols-3">{upcoming.map(({ reminder, next }) => <button key={reminder.id} onClick={() => navigate("/data")} className="flex min-h-20 items-start gap-3 rounded-xl bg-secondary/50 p-4 text-left transition-colors hover:bg-secondary"><CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><span><span className="block text-sm font-medium">{reminder.title}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDate(next!)} · {new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(next!)}</span></span></button>)}</div> : <EmptyState title="Активных напоминаний нет" text="Включите или добавьте напоминание в разделе «Данные»." />}
        </Section>
      </div>

      <div style={{ order: 6 }} className="flex flex-col items-center justify-between gap-2 rounded-xl border border-dashed px-4 py-3 sm:flex-row">
        <Button variant="ghost" onClick={() => setShowDetails(!showDetails)} aria-expanded={showDetails} aria-controls="dashboard-details" className="min-h-11 w-full gap-2 sm:w-auto"><ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />{showDetails ? "Скрыть подробности" : "Подробный обзор"}</Button>
        <Button variant="ghost" onClick={toggleCustomizing} className="min-h-11 w-full gap-2 text-muted-foreground sm:w-auto"><SlidersHorizontal className="h-4 w-4" />Настроить главную</Button>
      </div>
    </div>
  </div>;
}
