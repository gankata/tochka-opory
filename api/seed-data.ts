import type { payments as paymentsTable } from "@db/schema";

// Нейтральные данные только для нового пустого пространства.
// Существующая база пользователя этой функцией не перезаписывается.
export const importedSettings = {
  startDate: new Date().toISOString().slice(0, 10),
  cashRub: 0,
  cardRub: 0,
  cashUsd: 0,
  usdRate: 80,
  reserveMonths: 3,
  salaryDay: 15,
  mode: "Обычный" as const,
  savingPercent: 30,
  trackingDays: 14,
  incomeStrategy: "Худший месяц" as const,
  statsMonths: 6,
  walletDays: 3,
  largeExpenseThreshold: 10000,
  currencyRates: {},
  currencyBalances: {},
};

export const importedTransactions: Array<{
  operationDate: string;
  type: "Доход" | "Расход" | "Обмен";
  category: string;
  amountRub: number;
  amountUsd: number | null;
  currency: string;
  originalAmount: number;
  exchangeRate: number;
  note: string | null;
  source: string;
}> = [];

export const importedPayments: Array<typeof paymentsTable.$inferInsert> = [];
export const importedEnvelopes: Array<readonly [string, boolean, number | null, string]> = [
  ["Еда", true, null, "Укажите лимит после нескольких дней учёта."],
  ["Транспорт", true, null, "Укажите собственный лимит."],
  ["Здоровье", true, null, "Укажите собственный лимит."],
  ["Дом и быт", false, null, "Необязательные и бытовые расходы."],
  ["Досуг", false, null, "Кафе, развлечения и хобби."],
  ["Непредвиденное", false, null, "Небольшой резерв на незапланированное."],
];

export const defaultMoodOptions = {
  emotion: ["Радость", "Спокойствие", "Благодарность", "Интерес", "Грусть", "Тревога", "Страх", "Злость", "Раздражение", "Усталость", "Апатия", "Растерянность"],
  topic: ["Работа / учёба", "Семья", "Отношения", "Друзья", "Здоровье", "Сон / отдых", "Деньги / быт", "Самооценка", "Планы", "Хобби", "Работа над собой"],
  time: ["Утро", "День", "Вечер", "Ночь"],
};

export const importedReminders: Array<{
  uid: string;
  title: string;
  description: string;
  startAt: Date;
  recurrence: string | null;
}> = [];
