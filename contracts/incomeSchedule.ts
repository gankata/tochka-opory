export const incomeScheduleTypes = ["twice", "monthly", "irregular"] as const;

export type IncomeScheduleType = (typeof incomeScheduleTypes)[number];

export type IncomeScheduleConfig = {
  incomeSchedule: IncomeScheduleType;
  salaryDay: number;
  secondSalaryDay: number | null;
};
