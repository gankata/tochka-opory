import type { Workspace } from "@/types";
import { currencyMoney } from "@contracts/currencies";
import { noteDocumentToPlainText } from "@/lib/note-text";
import { formatDate, money, operationAmount, operationCurrency, paymentAmount } from "@/lib/utils-app";

export type SearchCategory = "operations" | "notes" | "wishlists" | "mood" | "payments" | "goals" | "sections";

export type GlobalSearchItem = {
  id: string;
  category: SearchCategory;
  title: string;
  description: string;
  meta: string;
  href: string;
  searchText: string;
  timestamp: number;
};

export const searchCategoryLabels: Record<SearchCategory, string> = {
  operations: "Операции",
  notes: "Заметки",
  wishlists: "Вишлисты",
  mood: "Настроение",
  payments: "Платежи",
  goals: "Цели",
  sections: "Разделы и настройки",
};

export function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function timestamp(value: string | Date | null | undefined) {
  if (!value) return 0;
  const result = value instanceof Date ? value.getTime() : new Date(`${value}T12:00:00`).getTime();
  return Number.isFinite(result) ? result : 0;
}

function compact(value: string, max = 150) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function amountVariants(value: number) {
  const absolute = Math.abs(value);
  const fixed = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(absolute);
  return [String(value), String(absolute), absolute.toFixed(2), fixed, money(value), money(absolute)].join(" ");
}

function dateVariants(value: string | null | undefined) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  const long = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  return `${value} ${formatDate(value)} ${long} ${day}.${month}.${year} ${Number(day)}.${Number(month)}.${year}`;
}

const sections: GlobalSearchItem[] = [
  ["today", "Сегодня", "Главная сводка: деньги, планы и состояние", "/", "главная дашборд обзор сводка"],
  ["operations", "Операции", "Журнал доходов, расходов и обмена валют", "/operations", "траты расходы доходы обмен журнал транзакции"],
  ["analytics", "Аналитика", "Расходы и доходы по категориям, дням, неделям и месяцам", "/analytics", "расходы доходы категории графики диаграммы динамика статистика источники аналитика"],
  ["calendar", "Финансовый календарь", "Операции, зарплата и регулярные платежи по дням", "/calendar", "календарь даты зарплата события"],
  ["plan", "План и кошелёк", "Платежи, конверты, цели и сверка наличных", "/plan", "бюджет планирование конверты кошелек наличные"],
  ["mood", "Дневник настроения", "Эмоции, энергия, сон и самонаблюдение", "/mood", "настроение эмоции дневник самочувствие сон энергия"],
  ["notes", "Заметки и желания", "Локальная база знаний, связи и вишлисты", "/notes", "заметки вишлист желания база знаний obsidian"],
  ["data", "Данные и резервные копии", "Экспорт, импорт, снимки и история изменений", "/data", "данные бекап резервная копия экспорт импорт архив восстановление"],
  ["settings", "Настройки и безопасность", "Параметры плана, валюты и пароль", "/data?tab=settings", "настройки безопасность пароль логин валюты курс"],
  ["options", "Списки эмоций и тем", "Настройка вариантов для дневника настроения", "/data?tab=options", "списки эмоции темы время суток настройка"],
].map(([id, title, description, href, searchText]) => ({
  id: `section-${id}`, category: "sections" as const, title, description, meta: "Раздел", href, searchText, timestamp: 0,
}));

export function buildGlobalSearchIndex(data: Workspace): GlobalSearchItem[] {
  const items: GlobalSearchItem[] = [...sections];

  for (const transaction of data.transactions) {
    const currency = operationCurrency(transaction);
    const original = operationAmount(transaction);
    const sign = transaction.type === "Доход" ? "+" : transaction.type === "Расход" ? "−" : "";
    items.push({
      id: `transaction-${transaction.id}`,
      category: "operations",
      title: transaction.category,
      description: compact(transaction.note || `${transaction.type} · ${currency}`),
      meta: `${formatDate(transaction.operationDate)} · ${sign}${currencyMoney(Math.abs(original), currency)}`,
      href: `/operations?focus=${transaction.id}`,
      searchText: [transaction.type, transaction.category, transaction.note ?? "", currency, transaction.source ?? "", dateVariants(transaction.operationDate), amountVariants(original), amountVariants(transaction.amountRub)].join(" "),
      timestamp: timestamp(transaction.operationDate),
    });
  }

  for (const note of data.notes) {
    const text = noteDocumentToPlainText(note.document, note.content);
    const noteType = note.kind === "folder" ? "Папка" : note.kind === "wishlist" ? "Вишлист" : "Заметка";
    items.push({
      id: `note-${note.id}`,
      category: note.kind === "wishlist" ? "wishlists" : "notes",
      title: note.title,
      description: compact(text || (note.kind === "wishlist" ? `${note.items.length} желаний` : noteType)),
      meta: noteType,
      href: `/notes?note=${note.id}`,
      searchText: [note.title, noteType, text, ...note.items.flatMap((item) => [item.title, item.note ?? "", item.url ?? "", item.price == null ? "" : amountVariants(item.price)])].join(" "),
      timestamp: timestamp(note.updatedAt),
    });
    if (note.kind === "wishlist") {
      for (const wish of note.items) {
        items.push({
          id: `wish-${note.id}-${wish.id}`,
          category: "wishlists",
          title: wish.title,
          description: compact(wish.note || `Из вишлиста «${note.title}»${wish.done ? " · исполнено" : ""}`),
          meta: wish.price == null ? note.title : `${money(wish.price)} · ${note.title}`,
          href: `/notes?note=${note.id}`,
          searchText: [note.title, wish.title, wish.note ?? "", wish.url ?? "", wish.done ? "исполнено выполнено" : "в планах", wish.price == null ? "" : amountVariants(wish.price)].join(" "),
          timestamp: timestamp(note.updatedAt),
        });
      }
    }
  }

  for (const mood of data.moods) {
    const details = [mood.situation, mood.thoughts, mood.body, mood.coping, mood.therapyNotes].filter(Boolean).join(" · ");
    items.push({
      id: `mood-${mood.id}`,
      category: "mood",
      title: `${mood.emotion} · ${mood.mood}/10`,
      description: compact([mood.topic, details].filter(Boolean).join(" · ") || mood.timeOfDay),
      meta: `${formatDate(mood.entryDate)} · ${mood.timeOfDay}`,
      href: `/mood?date=${mood.entryDate}&focus=${mood.id}`,
      searchText: [mood.emotion, mood.topic, mood.timeOfDay, details, `настроение ${mood.mood}`, `сила ${mood.intensity}`, mood.energy == null ? "" : `энергия ${mood.energy}`, mood.sleepHours == null ? "" : `сон ${mood.sleepHours}`, dateVariants(mood.entryDate)].join(" "),
      timestamp: timestamp(mood.entryDate),
    });
  }

  for (const payment of data.payments) {
    items.push({
      id: `payment-${payment.id}`,
      category: "payments",
      title: payment.name,
      description: compact(payment.note || `${payment.required ? "Обязательный" : "Необязательный"} платёж · раз в ${payment.intervalMonths} мес.`),
      meta: `${money(paymentAmount(payment))}${payment.nextDate ? ` · ${formatDate(payment.nextDate)}` : payment.dayOfMonth ? ` · ${payment.dayOfMonth}-го числа` : ""}`,
      href: `/plan?tab=payments&focus=${payment.id}`,
      searchText: [payment.name, payment.note ?? "", payment.sourceType, payment.required ? "обязательный" : "необязательный", "платеж регулярный", amountVariants(paymentAmount(payment)), dateVariants(payment.nextDate)].join(" "),
      timestamp: timestamp(payment.nextDate) || timestamp(payment.updatedAt),
    });
  }

  for (const goal of data.goals) {
    items.push({
      id: `goal-${goal.id}`,
      category: "goals",
      title: goal.name,
      description: goal.targetDate ? `Накопить до ${formatDate(goal.targetDate)}` : "Финансовая цель без заданного срока",
      meta: `${money(goal.savedAmount)} из ${money(goal.targetAmount)}`,
      href: `/plan?tab=goals&focus=${goal.id}`,
      searchText: [goal.name, "цель накопления запас", amountVariants(goal.savedAmount), amountVariants(goal.targetAmount), dateVariants(goal.targetDate)].join(" "),
      timestamp: timestamp(goal.targetDate) || timestamp(goal.updatedAt),
    });
  }

  return items;
}

export function searchGlobalItems(items: GlobalSearchItem[], query: string, limit = 40) {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return items
      .filter((item) => item.category !== "sections" && !item.id.startsWith("wish-"))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.min(limit, 8));
  }
  const tokens = normalized.split(" ").filter(Boolean);
  return items.flatMap((item) => {
    const title = normalizeSearchText(item.title);
    const haystack = normalizeSearchText(`${item.title} ${item.description} ${item.meta} ${item.searchText}`);
    if (!tokens.every((token) => haystack.includes(token))) return [];
    let score = 0;
    for (const token of tokens) {
      if (title === token) score += 100;
      else if (title.startsWith(token)) score += 55;
      else if (title.includes(token)) score += 35;
      else score += 5;
    }
    if (item.category === "sections") score += 2;
    return [{ item, score }];
  }).sort((a, b) => b.score - a.score || b.item.timestamp - a.item.timestamp)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function searchWorkspace(data: Workspace, query: string, limit = 40) {
  return searchGlobalItems(buildGlobalSearchIndex(data), query, limit);
}
