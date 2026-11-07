export const OFFICIAL_CALENDAR_FROM = 2020;
export const OFFICIAL_CALENDAR_TO = 2027;

// Дополнительные нерабочие дни и рабочие субботы по календарю Банка России.
// Обычные субботы, воскресенья и праздники из ст. 112 ТК РФ учитываются отдельно.
const additionalNonWorking = new Set([
  "2020-05-04", "2020-05-05", "2020-05-11",
  "2021-02-22", "2021-05-03", "2021-05-10", "2021-06-14", "2021-11-05", "2021-12-31",
  "2022-03-07", "2022-05-03", "2022-05-10", "2022-06-13",
  "2023-02-24", "2023-05-08", "2023-11-06",
  "2024-04-29", "2024-04-30", "2024-05-10", "2024-12-30", "2024-12-31",
  "2025-05-02", "2025-05-08", "2025-06-13", "2025-11-03", "2025-12-31",
  "2026-01-09", "2026-03-09", "2026-05-11", "2026-12-31",
  "2027-02-22", "2027-05-03", "2027-05-10", "2027-06-14", "2027-11-05", "2027-12-31",
]);

const additionalWorking = new Set([
  "2021-02-20", "2022-03-05", "2024-04-27", "2024-11-02", "2024-12-28",
  "2025-11-01", "2027-02-20",
]);

const holidayNames: Record<string, string> = {
  "01-01": "Новогодние каникулы",
  "01-02": "Новогодние каникулы",
  "01-03": "Новогодние каникулы",
  "01-04": "Новогодние каникулы",
  "01-05": "Новогодние каникулы",
  "01-06": "Новогодние каникулы",
  "01-07": "Рождество Христово",
  "01-08": "Новогодние каникулы",
  "02-23": "День защитника Отечества",
  "03-08": "Международный женский день",
  "05-01": "Праздник Весны и Труда",
  "05-09": "День Победы",
  "06-12": "День России",
  "11-04": "День народного единства",
};

export function dateToISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dateFromISO(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function hasOfficialRussianCalendar(year: number) {
  return year >= OFFICIAL_CALENDAR_FROM && year <= OFFICIAL_CALENDAR_TO;
}

function statutoryHoliday(date: Date) {
  return holidayNames[dateToISO(date).slice(5)] ?? null;
}

function isWeekend(date: Date) {
  return date.getDay() === 0 || date.getDay() === 6;
}

function isJanuaryHoliday(date: Date) {
  return date.getMonth() === 0 && date.getDate() <= 8;
}

function isAutomaticallyTransferredHoliday(date: Date) {
  if (hasOfficialRussianCalendar(date.getFullYear()) || date.getDay() !== 1) return false;
  // Для года без опубликованных переносов применяем общее правило ТК РФ:
  // праздник на субботе или воскресенье переносится на понедельник.
  // Январские каникулы исключены: их переносы устанавливает Правительство РФ.
  for (const offset of [1, 2]) {
    const previous = new Date(date);
    previous.setDate(previous.getDate() - offset);
    if (statutoryHoliday(previous) && !isJanuaryHoliday(previous) && isWeekend(previous)) return true;
  }
  return false;
}

export function russianNonWorkingReason(date: Date) {
  const iso = dateToISO(date);
  if (additionalWorking.has(iso)) return null;
  if (isWeekend(date)) return date.getDay() === 6 ? "Суббота" : "Воскресенье";
  if (additionalNonWorking.has(iso)) return "Перенесённый выходной";
  const holiday = statutoryHoliday(date);
  if (holiday) return holiday;
  if (isAutomaticallyTransferredHoliday(date)) return "Перенос праздничного дня";
  return null;
}

export function isRussianWorkingDay(date: Date) {
  return russianNonWorkingReason(date) === null;
}

export function previousRussianWorkingDay(value: Date) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  let guard = 0;
  while (!isRussianWorkingDay(date) && guard < 31) {
    date.setDate(date.getDate() - 1);
    guard += 1;
  }
  return date;
}

export function lastRussianWorkingDay(year: number, monthIndex: number) {
  return previousRussianWorkingDay(new Date(year, monthIndex + 1, 0, 12));
}

export type SalaryPayment = {
  kind: "first" | "last";
  label: string;
  date: Date;
  isoDate: string;
  nominalDate: Date;
  nominalIsoDate: string;
  shifted: boolean;
  shiftReason: string | null;
  officialCalendar: boolean;
};

export function salaryDatesForMonth(year: number, monthIndex: number, salaryDay = 15): SalaryPayment[] {
  const lastCalendarDay = new Date(year, monthIndex + 1, 0, 12).getDate();
  const safeDay = Math.max(1, Math.min(lastCalendarDay, Math.round(salaryDay)));
  const firstNominal = new Date(year, monthIndex, safeDay, 12);
  const lastNominal = new Date(year, monthIndex, lastCalendarDay, 12);
  const first = previousRussianWorkingDay(firstNominal);
  const last = previousRussianWorkingDay(lastNominal);
  const firstReason = russianNonWorkingReason(firstNominal);
  const lastReason = russianNonWorkingReason(lastNominal);

  return [
    {
      kind: "first",
      label: "Первая зарплата",
      date: first,
      isoDate: dateToISO(first),
      nominalDate: firstNominal,
      nominalIsoDate: dateToISO(firstNominal),
      shifted: firstReason !== null,
      shiftReason: firstReason,
      officialCalendar: hasOfficialRussianCalendar(first.getFullYear()),
    },
    {
      kind: "last",
      label: "Вторая зарплата",
      date: last,
      isoDate: dateToISO(last),
      nominalDate: lastNominal,
      nominalIsoDate: dateToISO(lastNominal),
      shifted: lastReason !== null,
      shiftReason: lastReason,
      officialCalendar: hasOfficialRussianCalendar(last.getFullYear()),
    },
  ];
}

export function nextSalaryPayment(salaryDay: number, from = new Date()) {
  return upcomingSalaryPayments(salaryDay, from, 1)[0];
}

export function upcomingSalaryPayments(salaryDay: number, from = new Date(), count = 2) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0, 0, 0);
  const candidates: SalaryPayment[] = [];
  for (let offset = 0; offset <= 3; offset += 1) {
    const month = new Date(from.getFullYear(), from.getMonth() + offset, 1, 12);
    candidates.push(...salaryDatesForMonth(month.getFullYear(), month.getMonth(), salaryDay));
  }
  return candidates
    .filter((payment) => payment.date >= start)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, count);
}
