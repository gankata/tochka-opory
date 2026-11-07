import { normalizeOperationCategory } from "@contracts/operationCategories";

export type CategoryTone = {
  dot: string;
  backgroundColor: string;
  color: string;
  borderColor: string;
};

const palette: CategoryTone[] = [
  { dot: "#347563", backgroundColor: "#e5f0eb", color: "#285d4e", borderColor: "#cee2d8" },
  { dot: "#a06b18", backgroundColor: "#faf0dc", color: "#785116", borderColor: "#eddcbc" },
  { dot: "#357aa5", backgroundColor: "#e5f0f6", color: "#2b607f", borderColor: "#cddfea" },
  { dot: "#b54c64", backgroundColor: "#f8e8ec", color: "#8f3c50", borderColor: "#eccfd7" },
  { dot: "#7760a5", backgroundColor: "#eeeaf5", color: "#5e4b82", borderColor: "#ded5eb" },
  { dot: "#b75e3e", backgroundColor: "#f8eae4", color: "#904a32", borderColor: "#ebd2c7" },
  { dot: "#4c6bb1", backgroundColor: "#e9edf7", color: "#3c568b", borderColor: "#d3dcee" },
  { dot: "#287f82", backgroundColor: "#e4f0ef", color: "#226668", borderColor: "#c9dfdd" },
  { dot: "#a34851", backgroundColor: "#f5e8e9", color: "#813a41", borderColor: "#e7cfd2" },
  { dot: "#6c7d37", backgroundColor: "#eef1e3", color: "#55632d", borderColor: "#dce3c8" },
  { dot: "#5e58a0", backgroundColor: "#ebeaf5", color: "#4b477e", borderColor: "#d8d5e9" },
  { dot: "#806249", backgroundColor: "#f0ebe5", color: "#644e3c", borderColor: "#dfd4c9" },
];

const assigned: Record<string, number> = {
  "зарплата": 0,
  "аванс": 7,
  "премия": 9,
  "подработка": 6,
  "подработка и прочий доход": 6,
  "проценты по вкладу": 10,
  "возврат налога": 2,
  "другой доход": 0,
  "еда": 1,
  "транспорт": 2,
  "здоровье и лекарства": 3,
  "быт и одежда": 4,
  "развлечения и кафе": 5,
  "подарки и прочее": 10,
  "непредвиденное": 8,
  "неучтённое (по сверке)": 11,
  "аренда квартиры": 11,
  "коммуналка": 6,
  "телефония": 10,
  "интернет": 7,
  "подписка zwift": 9,
  "vpn": 4,
  "подписка банка": 0,
  "обмен валюты": 2,
};

export function categoryTone(name: string): CategoryTone {
  const normalized = normalizeOperationCategory(name);
  let index = assigned[normalized];
  if (index == null) {
    index = 0;
    for (const character of normalized) index = (index * 31 + character.charCodeAt(0)) % palette.length;
  }
  return palette[index];
}
