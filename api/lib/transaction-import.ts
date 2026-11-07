export type ImportRule = {
  id: number;
  matchField: "source" | "note" | "category" | "any";
  pattern: string;
  operationType: "Доход" | "Расход" | "Обмен" | "Любой";
  category: string;
  priority: number;
  enabled: boolean;
};

export type ImportTransaction = {
  operationDate: string;
  type: "Доход" | "Расход" | "Обмен";
  category: string;
  amountRub: number;
  currency: string;
  originalAmount: number | null;
  exchangeRate: number | null;
  note?: string | null;
  source?: string | null;
  externalId?: string | null;
};

function normalized(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

export function applyCategoryRules<T extends ImportTransaction>(transaction: T, rules: ImportRule[]) {
  const rule = [...rules]
    .filter((candidate) => candidate.enabled && (candidate.operationType === "Любой" || candidate.operationType === transaction.type))
    .sort((a, b) => a.priority - b.priority || a.id - b.id)
    .find((candidate) => {
      const pattern = normalized(candidate.pattern);
      if (!pattern) return false;
      const fields = candidate.matchField === "any"
        ? [transaction.source, transaction.note, transaction.category]
        : [transaction[candidate.matchField]];
      return fields.some((field) => normalized(field).includes(pattern));
    });
  return rule ? { ...transaction, category: rule.category } : transaction;
}

export function transactionFingerprint(transaction: ImportTransaction) {
  return JSON.stringify([
    transaction.operationDate,
    transaction.type,
    transaction.category,
    Math.round(transaction.amountRub * 100) / 100,
    transaction.currency,
    Math.round((transaction.originalAmount ?? 0) * 100) / 100,
    normalized(transaction.source),
    normalized(transaction.note),
  ]);
}
