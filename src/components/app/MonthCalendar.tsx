import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateFromISO, dateToISO, isRussianWorkingDay } from "@/lib/working-days";
import { todayISO } from "@/lib/utils-app";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  return dateToISO(new Date(year, monthNumber - 1 + offset, 1, 12)).slice(0, 7);
}

export function monthTitle(month: string) {
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(dateFromISO(`${month}-01`));
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function MonthCalendar({
  month,
  onMonthChange,
  selectedDay,
  onSelectDay,
  renderDay,
  dayLabel,
  dayClassName,
  compact = false,
  markNonWorking = false,
}: {
  month: string;
  onMonthChange: (month: string) => void;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
  renderDay?: (day: string) => ReactNode;
  dayLabel?: (day: string) => string;
  dayClassName?: (day: string) => string;
  compact?: boolean;
  markNonWorking?: boolean;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(year, monthNumber, 0, 12).getDate();
  const firstWeekday = (new Date(year, monthNumber - 1, 1, 12).getDay() + 6) % 7;
  const days = Array.from({ length: daysInMonth }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const changeMonth = (next: string) => {
    onMonthChange(next);
    if (selectedDay && !selectedDay.startsWith(next)) onSelectDay("");
  };

  return <div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="editorial text-xl font-semibold leading-tight sm:text-2xl">{monthTitle(month)}</h3>
        <p className="mt-1 text-xs text-muted-foreground">Неделя начинается с понедельника</p>
      </div>
      <div className="flex items-center gap-1.5">
        {month !== currentMonth && <Button type="button" variant="ghost" className="mr-1 hidden min-h-10 px-3 text-xs sm:inline-flex" onClick={() => { onMonthChange(currentMonth); onSelectDay(today); }}>Сегодня</Button>}
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full" aria-label="Предыдущий месяц" onClick={() => changeMonth(shiftMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full" aria-label="Следующий месяц" onClick={() => changeMonth(shiftMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>

    <div className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-hidden="true">
      {weekdays.map((day, index) => <div key={day} className={`pb-2 text-center text-[11px] font-medium uppercase tracking-[.08em] ${index > 4 ? "text-muted-foreground/65" : "text-muted-foreground"}`}>{day}</div>)}
    </div>
    <div className="grid grid-cols-7 gap-1 sm:gap-1.5" role="group" aria-label={`Дни: ${monthTitle(month)}`}>
      {Array.from({ length: firstWeekday }, (_, index) => <div key={`empty-${index}`} aria-hidden="true" />)}
      {days.map((day) => {
        const date = dateFromISO(day);
        const selected = selectedDay === day;
        const isToday = today === day;
        const nonWorking = markNonWorking && !isRussianWorkingDay(date);
        const fullDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(date);
        return <button
          type="button"
          key={day}
          onClick={() => onSelectDay(day)}
          aria-label={dayLabel?.(day) ?? fullDate}
          aria-pressed={selected}
          className={`relative flex min-w-0 flex-col items-stretch overflow-hidden rounded-xl border text-left transition-colors ${compact ? "min-h-14 p-1.5 sm:min-h-[4.5rem] sm:p-2" : "min-h-[4.6rem] p-1.5 sm:min-h-[6.4rem] sm:p-2.5"} ${selected ? "border-primary bg-primary/10 shadow-sm" : isToday ? "border-primary/45 bg-card hover:bg-primary/5" : "border-transparent bg-secondary/35 hover:border-border hover:bg-secondary/65"} ${dayClassName?.(day) ?? ""}`}
        >
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:h-7 sm:w-7 sm:text-sm ${selected ? "bg-primary text-primary-foreground" : nonWorking ? "text-muted-foreground/65" : "text-foreground"}`}>
            {date.getDate()}
          </span>
          {isToday && !selected && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
          {renderDay && <div className="pointer-events-none mt-auto min-w-0 pt-1">{renderDay(day)}</div>}
        </button>;
      })}
    </div>
  </div>;
}
