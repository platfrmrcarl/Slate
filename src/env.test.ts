import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("parses a complete valid environment", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@localhost:5432/wpk",
      LOG_LEVEL: "info",
      PORT: "8080",
    });
    expect(env.NODE_ENV).toBe("production");
    expect(env.DATABASE_URL).toBe("postgres://user:pass@localhost:5432/wpk");
    expect(env.PORT).toBe(8080);
  });

  it("defaults LOG_LEVEL to 'info' when omitted", () => {
    const env = parseEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("defaults PORT to 3000 when omitted", () => {
    const env = parseEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.PORT).toBe(3000);
  });

  it("rejects missing DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects non-postgres DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
        DATABASE_URL: "mysql://localhost/wpk",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("defaults NODE_ENV to 'development' when omitted", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects invalid NODE_ENV", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "staging",
        DATABASE_URL: "postgres://localhost/wpk",
      }),
    ).toThrow(/NODE_ENV/);
  });

  it("rejects invalid LOG_LEVEL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost/wpk",
        LOG_LEVEL: "verbose",
      }),
    ).toThrow(/LOG_LEVEL/);
  });
});
