import Papa from "papaparse";
import { parseSync as parseOfx } from "ofx-js";
import { isCurrencyCode, type CurrencyCode } from "@contracts/currencies";

export type ImportRow = {
  operationDate: string;
  type: "Доход" | "Расход";
  category: string;
  amountRub: number;
  currency: CurrencyCode;
  originalAmount: number;
  exchangeRate: number;
  note: string | null;
  source: string | null;
  externalId: string | null;
};

export const csvFields = ["date", "type", "category", "amount", "currency", "rate", "note", "source", "externalId"] as const;
export type CsvField = (typeof csvFields)[number];
export type CsvMapping = Record<CsvField, string>;
export type CsvTable = { headers: string[]; records: Array<Record<string, string>> };

const synonyms: Record<CsvField, string[]> = {
  date: ["дата", "date", "дата операции", "operation date"],
  type: ["тип", "type", "тип операции"],
  category: ["категория", "category", "категория операции"],
  amount: ["сумма", "amount", "сумма в валюте", "сумма операции", "сумма руб", "сумма rub"],
  currency: ["валюта", "currency", "код валюты"],
  rate: ["курс", "rate", "курс к rub", "курс к руб"],
  note: ["комментарий", "note", "описание", "memo", "назначение"],
  source: ["источник", "source", "магазин", "контрагент", "name"],
  externalId: ["id", "externalid", "fitid", "id операции", "идентификатор"],
};

function cleanHeader(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replaceAll("_", " ").replace(/\s+/g, " ");
}

export function parseCsv(text: string): CsvTable {
  const result = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  if (!result.meta.fields?.length) throw new Error("В CSV не найдены столбцы");
  const fatal = result.errors.find((error) => error.code === "MissingQuotes" || error.code === "TooFewFields");
  if (fatal) throw new Error(`Ошибка CSV в строке ${(fatal.row ?? 0) + 2}: ${fatal.message}`);
  return { headers: result.meta.fields, records: result.data };
}

export function guessMapping(headers: string[]): CsvMapping {
  const normalized = headers.map((header) => ({ header, clean: cleanHeader(header) }));
  return Object.fromEntries(csvFields.map((field) => {
    const match = normalized.find(({ clean }) => synonyms[field].includes(clean))
      ?? normalized.find(({ clean }) => synonyms[field].some((synonym) => clean.includes(synonym)));
    return [field, match?.header ?? ""];
  })) as CsvMapping;
}

export function importDecimal(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  const normalized = String(value ?? "").trim().replace(/\s|_|₽|RUB|rub/gi, "").replace(",", ".");
  const negativeParentheses = /^\(.*\)$/.test(normalized);
  const parsed = Number(normalized.replace(/[()]/g, ""));
  return negativeParentheses ? -parsed : parsed;
}

export function importDate(value: string) {
  const input = value.trim();
  const iso = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const local = input.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (local) return `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`;
  const ofx = input.match(/^(\d{4})(\d{2})(\d{2})/);
  return ofx ? `${ofx[1]}-${ofx[2]}-${ofx[3]}` : "";
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function mapCsvRows(table: CsvTable, mapping: CsvMapping, rates: Record<string, number>) {
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  table.records.forEach((record, index) => {
    const get = (field: CsvField) => mapping[field] ? String(record[mapping[field]] ?? "").trim() : "";
    const operationDate = importDate(get("date"));
    const amount = importDecimal(get("amount"));
    const currencyText = get("currency").toUpperCase() || "RUB";
    const currency = isCurrencyCode(currencyText) ? currencyText : null;
    const typeText = get("type").toLocaleLowerCase("ru-RU");
    const type = /доход|income|credit|deposit|зачисл/.test(typeText) || (!typeText && amount > 0) ? "Доход" as const : "Расход" as const;
    const originalAmount = Math.abs(amount);
    const exchangeRate = importDecimal(get("rate")) || (currency === "RUB" ? 1 : rates[currency ?? ""] ?? 0);
    const line = index + 2;
    if (!validDate(operationDate)) { errors.push(`Строка ${line}: непонятная дата`); return; }
    if (!currency) { errors.push(`Строка ${line}: неподдерживаемая валюта «${currencyText}»`); return; }
    if (!Number.isFinite(originalAmount) || originalAmount <= 0) { errors.push(`Строка ${line}: сумма должна быть больше нуля`); return; }
    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) { errors.push(`Строка ${line}: укажите курс для ${currency}`); return; }
    rows.push({
      operationDate,
      type,
      category: get("category") || "Импорт",
      amountRub: Math.round(originalAmount * exchangeRate * 100) / 100,
      currency,
      originalAmount,
      exchangeRate,
      note: get("note") || null,
      source: get("source") || "CSV-импорт",
      externalId: get("externalId") || null,
    });
  });
  return { rows, errors };
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function parseOfxRows(text: string, rates: Record<string, number>) {
  const document = parseOfx(text) as unknown;
  const found: Array<Record<string, unknown>> = [];
  let detectedCurrency = "";
  const visit = (value: unknown, depth: number) => {
    if (depth > 20 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach((item) => visit(item, depth + 1)); return; }
    const record = value as Record<string, unknown>;
    if (!detectedCurrency && record.CURDEF) detectedCurrency = textValue(record.CURDEF).toUpperCase();
    if (record.TRNAMT != null && record.DTPOSTED != null) found.push(record);
    Object.values(record).forEach((item) => visit(item, depth + 1));
  };
  visit(document, 0);
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  found.forEach((transaction, index) => {
    const operationDate = importDate(textValue(transaction.DTPOSTED));
    const amount = importDecimal(textValue(transaction.TRNAMT));
    const code = detectedCurrency || "RUB";
    const currency = isCurrencyCode(code) ? code : null;
    const originalAmount = Math.abs(amount);
    const exchangeRate = currency === "RUB" ? 1 : rates[currency ?? ""] ?? 0;
    if (!validDate(operationDate) || !currency || !originalAmount || !exchangeRate) {
      errors.push(`Операция OFX ${index + 1}: проверьте дату, сумму, валюту и курс`);
      return;
    }
    const source = textValue(transaction.NAME) || textValue(transaction.PAYEE) || "OFX-импорт";
    const note = textValue(transaction.MEMO) || null;
    rows.push({
      operationDate,
      type: amount >= 0 ? "Доход" : "Расход",
      category: "Импорт",
      amountRub: Math.round(originalAmount * exchangeRate * 100) / 100,
      currency,
      originalAmount,
      exchangeRate,
      note,
      source,
      externalId: textValue(transaction.FITID) || null,
    });
  });
  return { rows, errors };
}
