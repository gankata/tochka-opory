import { describe, expect, it } from "vitest";
import { guessMapping, importDate, importDecimal, mapCsvRows, parseCsv, parseOfxRows } from "./transaction-import";

describe("разбор банковских файлов", () => {
  it("понимает русские CSV, запятую в сумме и локальную дату", () => {
    const table = parseCsv("Дата;Тип;Категория;Сумма;Валюта;Магазин;Комментарий\n04.11.2026;Расход;Кафе;\"1 234,50\";RUB;Кофейня;Завтрак");
    expect(guessMapping(table.headers)).toMatchObject({ date: "Дата", amount: "Сумма", source: "Магазин" });
    const result = mapCsvRows(table, guessMapping(table.headers), {});
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ operationDate: "2026-11-04", amountRub: 1234.5, type: "Расход", source: "Кофейня" });
  });
  it("возвращает ошибки по строкам и использует курс валюты", () => {
    const table = parseCsv("date,amount,currency\n2026-11-04,10,USD\nbad,2,USD");
    const result = mapCsvRows(table, guessMapping(table.headers), { USD: 80 });
    expect(result.rows[0]).toMatchObject({ amountRub: 800, type: "Доход" });
    expect(result.errors).toHaveLength(1);
  });
  it("читает OFX и FITID", () => {
    const result = parseOfxRows(`<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>RUB</CURDEF><BANKTRANLIST><STMTTRN><TRNAMT>-42.50</TRNAMT><DTPOSTED>20261104000000</DTPOSTED><FITID>abc-1</FITID><NAME>Store</NAME><MEMO>Lunch</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`, {});
    expect(result.rows[0]).toMatchObject({ amountRub: 42.5, externalId: "abc-1", type: "Расход" });
  });
  it("не принимает несуществующие даты и отрицательные скобки", () => {
    expect(importDate("04/11/2026")).toBe("2026-11-04");
    expect(importDecimal("(1 250,25)")).toBe(-1250.25);
    const table = parseCsv("date,amount\n2026-02-30,10");
    expect(mapCsvRows(table, guessMapping(table.headers), {}).errors[0]).toContain("непонятная дата");
  });
});
