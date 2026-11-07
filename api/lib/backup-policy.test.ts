import { describe, expect, it } from "vitest";
import { DEFAULT_FILE_BACKUP_RETAIN, parseFileBackupRetention } from "./backup-policy";

describe("лимит файловых копий", () => {
  it("сохраняет корректный пользовательский лимит", () => {
    expect(parseFileBackupRetention("3")).toBe(3);
    expect(parseFileBackupRetention("60")).toBe(60);
  });

  it.each([undefined, "", "abc", "NaN", "Infinity", "2", "-10", "2.5"])(
    "использует безопасное значение по умолчанию для %s",
    (value) => expect(parseFileBackupRetention(value)).toBe(DEFAULT_FILE_BACKUP_RETAIN),
  );
});
