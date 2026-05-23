import pino, { type Logger, type LoggerOptions, type DestinationStream } from "pino";
import { env } from "@/env";

export interface CreateLoggerOptions {
  level: LoggerOptions["level"];
  env: "development" | "test" | "production";
  destination?: DestinationStream;
}

export function createLogger(opts: CreateLoggerOptions): Logger {
  const base: LoggerOptions = {
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label, number) => ({ level: number, levelLabel: label }),
    },
  };
  if (opts.level !== undefined) {
    base.level = opts.level;
  }
  if (opts.env === "development") {
    base.transport = {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
    };
  }
  if (opts.destination) return pino(base, opts.destination);
  return pino(base);
}

let cached: Logger | undefined;

export function logger(): Logger {
  if (!cached) {
    const e = env();
    cached = createLogger({ level: e.LOG_LEVEL, env: e.NODE_ENV });
  }
  return cached;
}
