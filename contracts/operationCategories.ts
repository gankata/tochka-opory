export const incomeCategoryOptions = [
  "Зарплата",
  "Аванс",
  "Премия",
  "Подработка",
  "Подработка и прочий доход",
  "Проценты по вкладу",
  "Возврат налога",
  "Другой доход",
] as const;

export const exchangeCategoryOptions = ["Обмен валюты"] as const;

export function normalizeOperationCategory(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function isIncomeOnlyCategory(value: string) {
  const normalized = normalizeOperationCategory(value);
  return incomeCategoryOptions.some(
    (category) => normalizeOperationCategory(category) === normalized,
  );
}
