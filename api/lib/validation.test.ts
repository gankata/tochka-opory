import { describe, expect, it } from "vitest";
import { dateString } from "./validation";

describe("календарная дата", () => {
  it.each(["2026-02-28", "2028-02-29", "2026-11-07"])("принимает существующую дату %s", (value) => {
    expect(dateString.parse(value)).toBe(value);
  });

  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-04-31", "2026-01-00", "07.11.2026"])(
    "отклоняет несуществующую или неправильно записанную дату %s",
    (value) => expect(dateString.safeParse(value).success).toBe(false),
  );
});
