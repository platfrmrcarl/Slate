import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const REQUIRED_AUTH = {
  AUTH_SECRET: "a".repeat(64),
  APP_URL: "https://example.com",
  PREVIEW_TOKEN_SECRET: "p".repeat(64),
  INTERNAL_JOB_SECRET: "i".repeat(64),
  GCS_BUCKET_MEDIA: "wpk-media-prod",
};

describe("parseEnv", () => {
  it("parses a complete valid environment", () => {
    const env = parseEnv({
      ...REQUIRED_AUTH,
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
      ...REQUIRED_AUTH,
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("defaults PORT to 3000 when omitted", () => {
    const env = parseEnv({
      ...REQUIRED_AUTH,
      NODE_ENV: "development",
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.PORT).toBe(3000);
  });

  it("rejects missing DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        ...REQUIRED_AUTH,
        NODE_ENV: "development",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects non-postgres DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        ...REQUIRED_AUTH,
        NODE_ENV: "development",
        DATABASE_URL: "mysql://localhost/wpk",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("defaults NODE_ENV to 'development' when omitted", () => {
    const env = parseEnv({
      ...REQUIRED_AUTH,
      DATABASE_URL: "postgres://localhost/wpk",
    });
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects invalid NODE_ENV", () => {
    expect(() =>
      parseEnv({
        ...REQUIRED_AUTH,
        NODE_ENV: "staging",
        DATABASE_URL: "postgres://localhost/wpk",
      }),
    ).toThrow(/NODE_ENV/);
  });

  it("rejects invalid LOG_LEVEL", () => {
    expect(() =>
      parseEnv({
        ...REQUIRED_AUTH,
        NODE_ENV: "development",
        DATABASE_URL: "postgres://localhost/wpk",
        LOG_LEVEL: "verbose",
      }),
    ).toThrow(/LOG_LEVEL/);
  });
});

describe("parseEnv (auth additions)", () => {
  const base = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://localhost/wpk",
    AUTH_SECRET: "a".repeat(64),
    APP_URL: "https://example.com",
    PREVIEW_TOKEN_SECRET: "p".repeat(64),
    INTERNAL_JOB_SECRET: "i".repeat(64),
    GCS_BUCKET_MEDIA: "wpk-media-prod",
  };

  it("accepts a complete auth environment", () => {
    const env = parseEnv(base);
    expect(env.AUTH_SECRET).toHaveLength(64);
    expect(env.APP_URL).toBe("https://example.com");
  });

  it("rejects AUTH_SECRET shorter than 32 hex chars", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects non-https APP_URL in production", () => {
    expect(() => parseEnv({ ...base, APP_URL: "http://example.com" })).toThrow(/APP_URL/);
  });

  it("allows http APP_URL in development", () => {
    const env = parseEnv({ ...base, NODE_ENV: "development", APP_URL: "http://localhost:3000" });
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("OAuth credentials are optional", () => {
    const env = parseEnv(base);
    expect(env.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
    expect(env.GITHUB_OAUTH_CLIENT_ID).toBeUndefined();
  });

  it("OAuth credentials require client_id + client_secret together", () => {
    expect(() => parseEnv({ ...base, GOOGLE_OAUTH_CLIENT_ID: "id-only" })).toThrow(
      /GOOGLE_OAUTH_CLIENT_SECRET/,
    );
  });
});

describe("parseEnv (preview + jobs)", () => {
  const base = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://localhost/wpk",
    AUTH_SECRET: "a".repeat(64),
    APP_URL: "https://example.com",
    PREVIEW_TOKEN_SECRET: "p".repeat(64),
    INTERNAL_JOB_SECRET: "i".repeat(64),
    GCS_BUCKET_MEDIA: "wpk-media-prod",
  };

  it("accepts valid PREVIEW_TOKEN_SECRET and INTERNAL_JOB_SECRET", () => {
    const env = parseEnv(base);
    expect(env.PREVIEW_TOKEN_SECRET).toHaveLength(64);
    expect(env.INTERNAL_JOB_SECRET).toHaveLength(64);
  });

  it("rejects missing PREVIEW_TOKEN_SECRET", () => {
    const { PREVIEW_TOKEN_SECRET: _omit, ...rest } = base;
    void _omit;
    expect(() => parseEnv(rest)).toThrow(/PREVIEW_TOKEN_SECRET/);
  });

  it("rejects short PREVIEW_TOKEN_SECRET", () => {
    expect(() => parseEnv({ ...base, PREVIEW_TOKEN_SECRET: "tooshort" })).toThrow(
      /PREVIEW_TOKEN_SECRET/,
    );
  });

  it("rejects missing INTERNAL_JOB_SECRET", () => {
    const { INTERNAL_JOB_SECRET: _omit, ...rest } = base;
    void _omit;
    expect(() => parseEnv(rest)).toThrow(/INTERNAL_JOB_SECRET/);
  });

  it("rejects short INTERNAL_JOB_SECRET", () => {
    expect(() => parseEnv({ ...base, INTERNAL_JOB_SECRET: "tooshort" })).toThrow(
      /INTERNAL_JOB_SECRET/,
    );
  });
});

describe("parseEnv (media additions)", () => {
  const base = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgres://localhost/wpk",
    AUTH_SECRET: "a".repeat(64),
    APP_URL: "https://example.com",
    PREVIEW_TOKEN_SECRET: "p".repeat(64),
    INTERNAL_JOB_SECRET: "i".repeat(64),
    GCS_BUCKET_MEDIA: "wpk-media-prod",
    MEDIA_PUBLIC_URL: "https://cdn.example.com",
  };

  it("accepts media env", () => {
    const env = parseEnv(base);
    expect(env.GCS_BUCKET_MEDIA).toBe("wpk-media-prod");
    expect(env.MEDIA_PUBLIC_URL).toBe("https://cdn.example.com");
  });

  it("rejects missing GCS_BUCKET_MEDIA", () => {
    const { GCS_BUCKET_MEDIA: _omit, ...rest } = base;
    void _omit;
    expect(() => parseEnv(rest)).toThrow(/GCS_BUCKET_MEDIA/);
  });

  it("rejects bucket names with uppercase or invalid chars", () => {
    expect(() => parseEnv({ ...base, GCS_BUCKET_MEDIA: "WPK-Media" })).toThrow(/GCS_BUCKET_MEDIA/);
    expect(() => parseEnv({ ...base, GCS_BUCKET_MEDIA: "bad name" })).toThrow(/GCS_BUCKET_MEDIA/);
  });

  it("allows GCS_EMULATOR_HOST in development", () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
      GCS_EMULATOR_HOST: "http://localhost:4443",
    });
    expect(env.GCS_EMULATOR_HOST).toBe("http://localhost:4443");
  });

  it("rejects GCS_EMULATOR_HOST in production", () => {
    expect(() => parseEnv({ ...base, GCS_EMULATOR_HOST: "http://localhost:4443" })).toThrow(
      /GCS_EMULATOR_HOST/,
    );
  });
});
