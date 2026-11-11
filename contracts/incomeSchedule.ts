export const incomeScheduleTypes = ["twice", "monthly", "irregular"] as const;

export type IncomeScheduleType = (typeof incomeScheduleTypes)[number];

export type IncomeSourceConfig = {
  id?: number;
  name: string;
  /** Null means the last working day of the month. */
  dayOfMonth: number | null;
};

export type IncomeScheduleConfig = {
  incomeSchedule: IncomeScheduleType;
  salaryDay: number;
  secondSalaryDay: number | null;
  incomeSources?: readonly IncomeSourceConfig[];
};

export function legacyIncomeSources(config: Pick<IncomeScheduleConfig, "incomeSchedule" | "salaryDay" | "secondSalaryDay">): IncomeSourceConfig[] {
  if (config.incomeSchedule === "irregular") return [];
  const sources: IncomeSourceConfig[] = [{
    name: config.incomeSchedule === "monthly" ? "Зарплата" : "Первая зарплата",
    dayOfMonth: config.salaryDay,
  }];
  if (config.incomeSchedule === "twice") {
    sources.push({ name: "Вторая зарплата", dayOfMonth: config.secondSalaryDay });
  }
  return sources;
}

export function configuredIncomeSources(config: IncomeScheduleConfig): readonly IncomeSourceConfig[] {
  if (config.incomeSchedule === "irregular") return [];
  return config.incomeSources ?? legacyIncomeSources(config);
}
