import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "../../src/server/log";

afterEach(() => vi.restoreAllMocks());

describe("logError", () => {
  it("writes one JSON line with the request id and error, and leaves connection strings out", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    // secretlint-disable-next-line @secretlint/secretlint-rule-database-connection-string -- intentionally fake credential: the test asserts it is redacted
    const error = Object.assign(new Error("connect failed postgres://worker:hunter2@db.internal:5432/app"), { code: "ECONNREFUSED" });
    logError("unexpected route error", { requestId: "req-1", error });
    expect(write).toHaveBeenCalledOnce();
    const line = String(write.mock.calls[0][0]);
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toMatchObject({
      level: "error",
      msg: "unexpected route error",
      requestId: "req-1",
      error: { name: "Error", code: "ECONNREFUSED" },
    });
    expect(line).not.toContain("hunter2");
  });
});
