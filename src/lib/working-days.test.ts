import { describe, expect, it } from "vitest";
import {
  dateFromISO,
  incomeDatesForMonth,
  isRussianWorkingDay,
  lastRussianWorkingDay,
  nextSalaryPayment,
  salaryDatesForMonth,
  upcomingIncomePayments,
} from "./working-days";

describe("российский рабочий календарь", () => {
  it("учитывает официальные переносы, а не только субботу и воскресенье", () => {
    expect(isRussianWorkingDay(dateFromISO("2026-01-09"))).toBe(false);
    expect(isRussianWorkingDay(dateFromISO("2026-05-11"))).toBe(false);
    expect(isRussianWorkingDay(dateFromISO("2026-12-31"))).toBe(false);
    expect(isRussianWorkingDay(dateFromISO("2027-11-05"))).toBe(false);
    expect(isRussianWorkingDay(dateFromISO("2027-02-20"))).toBe(true);
  });

  it("переносит первую выплату с воскресенья 15 февраля на пятницу 13", () => {
    const [first] = salaryDatesForMonth(2026, 1, 15);
    expect(first.isoDate).toBe("2026-02-13");
    expect(first.shiftReason).toBe("Воскресенье");
  });

  it("переносит первую выплату с воскресенья 15 ноября на пятницу 13", () => {
    const payment = nextSalaryPayment(15, dateFromISO("2026-11-02"));
    expect(payment.isoDate).toBe("2026-11-13");
    expect(payment.kind).toBe("first");
  });

  it("считает вторую выплату в последний рабочий день месяца", () => {
    expect(salaryDatesForMonth(2026, 10, 15)[1].isoDate).toBe("2026-11-30");
    expect(salaryDatesForMonth(2026, 11, 15)[1].isoDate).toBe("2026-12-30");
    expect(lastRussianWorkingDay(2027, 11).getDate()).toBe(30);
  });

  it("не пропускает выплату, если сегодня день зарплаты", () => {
    expect(nextSalaryPayment(15, dateFromISO("2026-11-13")).isoDate).toBe("2026-11-13");
    expect(nextSalaryPayment(15, dateFromISO("2026-11-14")).isoDate).toBe("2026-11-30");
  });
});

describe("гибкий график дохода", () => {
  it("создаёт одну дату для ежемесячной выплаты", () => {
    const payments = incomeDatesForMonth(2026, 10, { incomeSchedule: "monthly", salaryDay: 20, secondSalaryDay: null });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ isoDate: "2026-11-20", label: "Зарплата", rule: "20-е число" });
  });

  it("использует оба пользовательских дня", () => {
    const payments = incomeDatesForMonth(2026, 10, { incomeSchedule: "twice", salaryDay: 10, secondSalaryDay: 25 });
    expect(payments.map((payment) => payment.isoDate)).toEqual(["2026-11-10", "2026-11-25"]);
    expect(payments.map((payment) => payment.rule)).toEqual(["10-е число", "25-е число"]);
  });

  it("безопасно сокращает 31-е число до конца февраля и переносит выходной", () => {
    const [payment] = incomeDatesForMonth(2026, 1, { incomeSchedule: "monthly", salaryDay: 31, secondSalaryDay: null });
    expect(payment.nominalIsoDate).toBe("2026-02-28");
    expect(payment.isoDate).toBe("2026-02-27");
    expect(payment.shiftReason).toBe("Суббота");
  });

  it("не создаёт плановых выплат для ежедневного, сдельного или нерегулярного дохода", () => {
    const config = { incomeSchedule: "irregular", salaryDay: 15, secondSalaryDay: null } as const;
    expect(incomeDatesForMonth(2026, 10, config)).toEqual([]);
    expect(upcomingIncomePayments(config, dateFromISO("2026-11-10"))).toEqual([]);
  });
});
