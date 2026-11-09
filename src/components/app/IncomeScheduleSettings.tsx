import { CalendarClock } from "lucide-react";
import type { IncomeScheduleType } from "@contracts/incomeSchedule";
import { upcomingIncomePayments } from "@/lib/working-days";
import { formatDate } from "@/lib/utils-app";
import { Field, Section } from "@/components/app/Common";

type IncomeScheduleSettingsProps = {
  schedule: IncomeScheduleType;
  salaryDay: string;
  secondSalaryDay: string;
  onScheduleChange: (value: IncomeScheduleType) => void;
  onSalaryDayChange: (value: string) => void;
  onSecondSalaryDayChange: (value: string) => void;
};

function validDay(value: string, fallback: number) {
  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : fallback;
}

export default function IncomeScheduleSettings({
  schedule,
  salaryDay,
  secondSalaryDay,
  onScheduleChange,
  onSalaryDayChange,
  onSecondSalaryDayChange,
}: IncomeScheduleSettingsProps) {
  const secondIsCustom = secondSalaryDay.trim() !== "";
  const preview = upcomingIncomePayments({
    incomeSchedule: schedule,
    salaryDay: validDay(salaryDay, 15),
    secondSalaryDay: secondIsCustom ? validDay(secondSalaryDay, 28) : null,
  }, new Date(), 4).slice(0, 2);

  return <Section
    title="График дохода"
    description="Выберите реальный ритм поступлений. Плановые даты нужны только для календаря и прогноза — операции приложение создаёт лишь после вашего ввода."
    hint="Меняйте режим и дни в любой момент: предпросмотр обновится сразу, а главная, календарь и связанные прогнозы — после сохранения настроек. Уже внесённые доходы и расходы останутся без изменений."
  >
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Как вы получаете доход">
        <select aria-label="График дохода" className="field" value={schedule} onChange={(event) => onScheduleChange(event.target.value as IncomeScheduleType)}>
          <option value="twice">Две выплаты в месяц</option>
          <option value="monthly">Одна выплата в месяц</option>
          <option value="irregular">Ежедневно, сдельно или нерегулярно</option>
        </select>
      </Field>
      {schedule !== "irregular" && <Field label={schedule === "monthly" ? "День выплаты" : "Первая выплата, день"}>
        <input aria-label={schedule === "monthly" ? "День выплаты" : "Первая выплата, день"} type="text" inputMode="numeric" autoComplete="off" className="field" value={salaryDay} onChange={(event) => onSalaryDayChange(event.target.value)} />
      </Field>}
      {schedule === "twice" && <Field label="Вторая выплата">
        <select aria-label="Правило второй выплаты" className="field" value={secondIsCustom ? "custom" : "last-working"} onChange={(event) => onSecondSalaryDayChange(event.target.value === "custom" ? (secondSalaryDay || "28") : "")}>
          <option value="last-working">В последний рабочий день</option>
          <option value="custom">В свой день месяца</option>
        </select>
      </Field>}
      {schedule === "twice" && secondIsCustom && <Field label="Вторая выплата, день">
        <input aria-label="Вторая выплата, день" type="text" inputMode="numeric" autoComplete="off" className="field" value={secondSalaryDay} onChange={(event) => onSecondSalaryDayChange(event.target.value)} />
      </Field>}
    </div>

    <div className="soft-surface mt-5 p-4">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          {schedule === "irregular" ? <>
            <h3 className="font-medium">Доходы без фиксированных дат</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Вносите каждое поступление по факту в журнале. На главной и в календаре не будет обратного отсчёта и прогноза «до зарплаты», а запас, платежи и аналитика продолжат работать.</p>
          </> : <>
            <h3 className="font-medium">Ближайшие плановые даты</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Нерабочая дата переносится на предыдущий рабочий день. Если выбранного числа нет в коротком месяце, используется его последний календарный день, а затем применяется правило переноса.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">{preview.map((payment) => <div key={`${payment.kind}-${payment.isoDate}`} className="rounded-lg bg-card/75 p-3">
              <p className="text-xs text-muted-foreground">{payment.label} · {payment.rule}</p>
              <p className="number mt-0.5 font-semibold">{formatDate(payment.date)}</p>
              {payment.shifted && <p className="mt-1 text-[11px] text-muted-foreground">Перенос с {formatDate(payment.nominalDate)}: {payment.shiftReason?.toLowerCase()}</p>}
            </div>)}</div>
          </>}
        </div>
      </div>
    </div>
  </Section>;
}
