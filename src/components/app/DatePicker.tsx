import { useState } from "react";
import { ru } from "date-fns/locale";
import { CalendarDays, ChevronDown, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateFromISO, dateToISO } from "@/lib/working-days";
import { todayISO } from "@/lib/utils-app";

const firstMonth = new Date(2000, 0, 1, 12);
const lastMonth = new Date(2100, 11, 1, 12);

function longDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(dateFromISO(value));
}

export function DatePicker({
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = "Выберите дату",
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? dateFromISO(value) : undefined;
  const [month, setMonth] = useState<Date>(selected ?? dateFromISO(todayISO()));

  const select = (date?: Date) => {
    if (!date) return;
    onChange(dateToISO(date));
    setMonth(date);
    setOpen(false);
  };

  return <Popover open={open} onOpenChange={(next) => {
    setOpen(next);
    if (next) setMonth(selected ?? dateFromISO(todayISO()));
  }}>
    <PopoverTrigger asChild>
      <button
        type="button"
        className="field group min-h-12 items-center justify-between gap-3 text-left hover:border-primary/45 hover:bg-secondary/35 aria-expanded:border-primary aria-expanded:ring-2 aria-expanded:ring-primary/15"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-required={required}
      >
        <span className="flex min-w-0 items-center gap-3">
          <CalendarDays className="h-5 w-5 shrink-0 text-primary transition-transform duration-200 group-hover:-rotate-3" />
          <span className={`truncate ${value ? "font-medium" : "text-muted-foreground"}`}>{value ? longDate(value) : placeholder}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" sideOffset={8} collisionPadding={12} className="date-picker-popover max-h-[var(--radix-popover-content-available-height)] w-[min(356px,calc(100vw-24px))] overflow-y-auto overscroll-contain rounded-[20px] border-primary/15 p-0 shadow-xl shadow-primary/10 duration-200">
      <div className="border-b bg-secondary/45 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Выбор даты</p>
        <p className="mt-0.5 truncate text-sm font-semibold">{value ? longDate(value) : "Найдите нужный день"}</p>
      </div>
      <Calendar
        mode="single"
        locale={ru}
        selected={selected}
        onSelect={select}
        month={month}
        onMonthChange={setMonth}
        captionLayout="dropdown"
        startMonth={firstMonth}
        endMonth={lastMonth}
        className="w-full p-3"
      />
      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t bg-popover/95 p-2 shadow-[0_-8px_18px_-18px_oklch(var(--foreground))] backdrop-blur">
        <Button type="button" variant="ghost" className="min-h-11 flex-1" onClick={() => select(dateFromISO(todayISO()))}>Сегодня</Button>
        {!required && <Button type="button" variant="ghost" className="min-h-11 flex-1 gap-2 text-muted-foreground" onClick={() => { onChange(""); setOpen(false); }}><X className="h-4 w-4" />Очистить</Button>}
      </div>
    </PopoverContent>
  </Popover>;
}
