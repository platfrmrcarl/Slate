import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("slate");

const counters = new Map<string, ReturnType<typeof meter.createCounter>>();
const histograms = new Map<string, ReturnType<typeof meter.createHistogram>>();

export function recordCounter(name: string, value = 1, attrs?: Record<string, unknown>): void {
  let c = counters.get(name);
  if (!c) {
    c = meter.createCounter(name);
    counters.set(name, c);
  }
  c.add(value, attrs as Record<string, string | number | boolean>);
}

export function recordHistogram(
  name: string,
  value: number,
  attrs?: Record<string, unknown>,
): void {
  let h = histograms.get(name);
  if (!h) {
    h = meter.createHistogram(name);
    histograms.set(name, h);
  }
  h.record(value, attrs as Record<string, string | number | boolean>);
}
