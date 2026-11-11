import { CalendarClock, Plus, Trash2 } from "lucide-react";
import type { IncomeScheduleType } from "@contracts/incomeSchedule";
import { upcomingIncomePayments } from "@/lib/working-days";
import { formatDate } from "@/lib/utils-app";
import { createUuid } from "@/lib/uuid";
import { Field, Section } from "@/components/app/Common";
import { Button } from "@/components/ui/button";

export type IncomeSourceDraft = {
  key: string;
  name: string;
  dayOfMonth: string;
  lastWorkingDay: boolean;
};

type IncomeScheduleSettingsProps = {
  schedule: IncomeScheduleType;
  sources: IncomeSourceDraft[];
  onScheduleChange: (value: IncomeScheduleType) => void;
  onSourcesChange: (value: IncomeSourceDraft[]) => void;
};

function validDay(value: string, fallback: number) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : fallback;
}

export default function IncomeScheduleSettings({
  schedule,
  sources,
  onScheduleChange,
  onSourcesChange,
}: IncomeScheduleSettingsProps) {
  const regular = schedule !== "irregular";
  const preview = upcomingIncomePayments({
    incomeSchedule: schedule,
    salaryDay: 15,
    secondSalaryDay: null,
    incomeSources: sources.map((source, index) => ({
      id: index + 1,
      name: source.name.trim() || `Новый источник ${index + 1}`,
      dayOfMonth: source.lastWorkingDay ? null : validDay(source.dayOfMonth, 15),
    })),
  }, new Date(), 6).slice(0, 4);

  const updateSource = (key: string, patch: Partial<IncomeSourceDraft>) => {
    onSourcesChange(sources.map((source) => source.key === key ? { ...source, ...patch } : source));
  };

  return <Section
    title="График и источники дохода"
    description="Добавьте зарплату, аванс, арендные поступления и другие регулярные доходы. Плановые даты нужны только для календаря — операции приложение создаёт лишь после вашего ввода."
    hint="Добавляйте, переименовывайте и удаляйте источники, затем нажмите «Сохранить настройки». Предпросмотр обновится сразу, а главная, календарь и связанные прогнозы — после сохранения настроек. Уже внесённые доходы и расходы останутся без изменений."
  >
    <Field label="Как вы получаете доход">
      <select
        aria-label="График дохода"
        className="field sm:max-w-md"
        value={regular ? "regular" : "irregular"}
        onChange={(event) => onScheduleChange(event.target.value === "irregular" ? "irregular" : regular ? schedule : "twice")}
      >
        <option value="regular">По расписанию</option>
        <option value="irregular">Ежедневно, сдельно или нерегулярно</option>
      </select>
    </Field>

    {regular && <div className="mt-5 space-y-3">
      {sources.map((source, index) => <div key={source.key} className="grid gap-3 rounded-xl bg-secondary/40 p-3 md:grid-cols-[minmax(0,1fr)_220px_160px_44px] md:items-end">
        <Field label={`Название источника ${index + 1}`}>
          <input aria-label={`Название источника ${index + 1}`} className="field" value={source.name} maxLength={160} required autoComplete="off" placeholder="Например, аренда квартиры" onChange={(event) => updateSource(source.key, { name: event.target.value })} />
        </Field>
        <Field label={`Правило даты ${index + 1}`}>
          <select aria-label={`Правило даты ${index + 1}`} className="field" value={source.lastWorkingDay ? "last-working" : "day-of-month"} onChange={(event) => updateSource(source.key, { lastWorkingDay: event.target.value === "last-working" })}>
            <option value="day-of-month">В свой день месяца</option>
            <option value="last-working">В последний рабочий день</option>
          </select>
        </Field>
        {source.lastWorkingDay ? <div className="hidden md:block" aria-hidden="true" /> : <Field label={`День месяца ${index + 1}`}>
          <input aria-label={`День месяца ${index + 1}`} type="number" min={1} max={31} step={1} required inputMode="numeric" autoComplete="off" className="field" value={source.dayOfMonth} onChange={(event) => updateSource(source.key, { dayOfMonth: event.target.value })} />
        </Field>}
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-destructive" aria-label={`Удалить источник ${index + 1}`} onClick={() => onSourcesChange(sources.filter((item) => item.key !== source.key))}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>)}
      {!sources.length && <div className="rounded-xl border border-dashed p-4 text-sm leading-relaxed text-muted-foreground">Источников пока нет. Добавьте первый, чтобы увидеть плановые даты.</div>}
      <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => onSourcesChange([...sources, { key: createUuid(), name: "", dayOfMonth: "15", lastWorkingDay: false }])}>
        <Plus className="h-4 w-4" />Добавить источник дохода
      </Button>
    </div>}

    <div className="soft-surface mt-5 p-4">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          {!regular ? <>
            <h3 className="font-medium">Доходы без фиксированных дат</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Вносите каждое поступление по факту в журнале. На главной и в календаре не будет обратного отсчёта до планового дохода, а запас, платежи и аналитика продолжат работать. Сохранённые источники останутся и снова появятся при возврате к расписанию.</p>
          </> : <>
            <h3 className="font-medium">Ближайшие плановые даты</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Нерабочая дата переносится на предыдущий рабочий день. Если выбранного числа нет в коротком месяце, используется его последний календарный день, а затем применяется правило переноса.</p>
            {preview.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{preview.map((payment) => <div key={`${payment.kind}-${payment.isoDate}`} className="rounded-lg bg-card/75 p-3">
              <p className="text-xs text-muted-foreground">{payment.label} · {payment.rule}</p>
              <p className="number mt-0.5 font-semibold">{formatDate(payment.date)}</p>
              {payment.shifted && <p className="mt-1 text-[11px] text-muted-foreground">Перенос с {formatDate(payment.nominalDate)}: {payment.shiftReason?.toLowerCase()}</p>}
            </div>)}</div> : <p className="mt-3 text-sm text-muted-foreground">После добавления источника здесь появятся его ближайшие даты.</p>}
          </>}
        </div>
      </div>
    </div>
  </Section>;
}
