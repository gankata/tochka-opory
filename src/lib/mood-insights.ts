import type { MoodEntry, Transaction } from "@/types";
import { parseDay, roundMoney } from "./utils-app";

const weekdays = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
export function moodByWeekday(entries: MoodEntry[]) {
  return weekdays.map((name, index) => {
    const values = entries.filter((entry) => (parseDay(entry.entryDate).getDay() + 6) % 7 === index).map((entry) => entry.mood);
    return { name, short: name.slice(0, 2), average: values.length ? roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length) : null, count: values.length };
  });
}

export function pearsonCorrelation(pairs: Array<[number, number]>) {
  if (pairs.length < 3) return null;
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const xMean = average(pairs.map(([x]) => x)); const yMean = average(pairs.map(([, y]) => y));
  let numerator = 0; let xSquared = 0; let ySquared = 0;
  for (const [x, y] of pairs) { const xd = x - xMean; const yd = y - yMean; numerator += xd * yd; xSquared += xd * xd; ySquared += yd * yd; }
  const denominator = Math.sqrt(xSquared * ySquared);
  return denominator ? roundMoney(numerator / denominator) : null;
}

export function moodFinanceCorrelations(moods: MoodEntry[], transactions: Transaction[]) {
  const spending = new Map<string, number>();
  for (const transaction of transactions) if (transaction.type === "Расход") spending.set(transaction.operationDate, (spending.get(transaction.operationDate) ?? 0) + Math.abs(transaction.amountRub));
  const dailyMood = new Map<string, number[]>();
  for (const mood of moods) dailyMood.set(mood.entryDate, [...(dailyMood.get(mood.entryDate) ?? []), mood.mood]);
  const expensePairs: Array<[number, number]> = [];
  const sleepPairs: Array<[number, number]> = [];
  const energyPairs: Array<[number, number]> = [];
  for (const [date, values] of dailyMood) {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    expensePairs.push([spending.get(date) ?? 0, average]);
  }
  for (const mood of moods) {
    if (mood.sleepHours != null) sleepPairs.push([mood.sleepHours, mood.mood]);
    if (mood.energy != null) energyPairs.push([mood.energy, mood.mood]);
  }
  return [
    { key: "sleep", label: "Сон и настроение", value: pearsonCorrelation(sleepPairs), count: sleepPairs.length },
    { key: "energy", label: "Энергия и настроение", value: pearsonCorrelation(energyPairs), count: energyPairs.length },
    { key: "expense", label: "Траты дня и настроение", value: pearsonCorrelation(expensePairs), count: expensePairs.length },
  ];
}
