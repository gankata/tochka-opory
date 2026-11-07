import { describe, expect, it } from "vitest";
import { decryptArchive, encryptArchive } from "./encrypted-archive";

describe("зашифрованный архив", () => {
  it("восстанавливает данные только с правильным паролем", async () => {
    const encrypted = await encryptArchive({ settings: { startDate: "2026-01-01" }, operations: [1, 2] }, "correct-horse");
    expect(encrypted).not.toContain("startDate");
    expect(await decryptArchive(encrypted, "correct-horse")).toEqual({ settings: { startDate: "2026-01-01" }, operations: [1, 2] });
    await expect(decryptArchive(encrypted, "wrong-password")).rejects.toThrow();
  });
  it("требует ненулевой пароль достаточной длины", async () => {
    await expect(encryptArchive({}, "short")).rejects.toThrow("минимум 8");
  });
});
