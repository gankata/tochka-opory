export type CategoryRule = {
  name: string;
  matchField: "source" | "note" | "category" | "any";
  pattern: string;
  operationType: "Доход" | "Расход" | "Обмен" | "Любой";
  category: string;
  priority: number;
  enabled: boolean;
};

export type RulePack = { format: "tochka-opory.rules"; version: 1; rules: CategoryRule[] };

export function createRulePack(rules: CategoryRule[]): RulePack {
  return { format: "tochka-opory.rules", version: 1, rules };
}

export function parseRulePack(text: string): CategoryRule[] {
  const value = JSON.parse(text) as Partial<RulePack>;
  if (value.format !== "tochka-opory.rules" || value.version !== 1 || !Array.isArray(value.rules) || value.rules.length > 500) {
    throw new Error("Это не поддерживаемый пакет правил «Точки опоры»");
  }
  const fields = new Set(["source", "note", "category", "any"]);
  const types = new Set(["Доход", "Расход", "Обмен", "Любой"]);
  return value.rules.map((source, index) => {
    const row = source as CategoryRule;
    const label = `Правило ${index + 1}`;
    if (!row || typeof row.name !== "string" || !row.name.trim() || row.name.length > 160 || typeof row.pattern !== "string" || !row.pattern.trim() || row.pattern.length > 190 || typeof row.category !== "string" || !row.category.trim() || row.category.length > 160) throw new Error(`${label}: проверьте название, текст и категорию`);
    if (!fields.has(row.matchField) || !types.has(row.operationType)) throw new Error(`${label}: неизвестное поле или тип`);
    if (!Number.isInteger(row.priority) || row.priority < 0 || row.priority > 10000 || typeof row.enabled !== "boolean") throw new Error(`${label}: неверный приоритет или состояние`);
    return { name: row.name.trim(), matchField: row.matchField, pattern: row.pattern.trim(), operationType: row.operationType, category: row.category.trim(), priority: row.priority, enabled: row.enabled };
  });
}
