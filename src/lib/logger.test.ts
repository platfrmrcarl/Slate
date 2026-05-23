import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

describe("createLogger", () => {
  it("returns a logger with standard pino methods", () => {
    const logger = createLogger({ level: "info", env: "production" });
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.fatal).toBe("function");
  });

  it("logs structured JSON in production", () => {
    const writes: string[] = [];
    const logger = createLogger({
      level: "info",
      env: "production",
      destination: { write: (s: string) => writes.push(s) },
    });
    logger.info({ requestId: "abc" }, "hello");
    expect(writes).toHaveLength(1);
    const parsed = JSON.parse(writes[0]!);
    expect(parsed.msg).toBe("hello");
    expect(parsed.requestId).toBe("abc");
    expect(parsed.level).toBe(30);
  });

  it("respects the configured level (warn suppresses info)", () => {
    const writes: string[] = [];
    const logger = createLogger({
      level: "warn",
      env: "production",
      destination: { write: (s: string) => writes.push(s) },
    });
    logger.info("suppressed");
    logger.warn("emitted");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!).msg).toBe("emitted");
  });
});
