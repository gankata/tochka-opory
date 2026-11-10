import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUuid } from "./uuid";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("createUuid", () => {
  it("uses the native implementation when available", () => {
    const randomUUID = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    vi.stubGlobal("crypto", { randomUUID });
    expect(createUuid()).toBe("11111111-2222-4333-8444-555555555555");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("creates a valid UUID through getRandomValues without randomUUID", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: 16 }, (_, index) => index));
        return bytes;
      },
    });
    expect(createUuid()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  });

  it("keeps working in a legacy browser without Web Crypto", () => {
    vi.stubGlobal("crypto", undefined);
    const ids = Array.from({ length: 100 }, () => createUuid());
    expect(ids.every((id) => uuidPattern.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prevents new direct randomUUID calls in application code", () => {
    const offenders = sourceFiles(path.resolve("src"))
      .filter((file) => !file.endsWith(`${path.sep}uuid.ts`) && !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => fs.readFileSync(file, "utf8").includes("crypto.randomUUID("))
      .map((file) => path.relative(process.cwd(), file));
    expect(offenders).toEqual([]);
  });
});
