import { describe, expect, it, vi } from "vitest";

const inc = vi.fn();
const recordHist = vi.fn();
const createCounter = vi.fn((name: string) => ({
  add: (n: number, attrs?: Record<string, unknown>) => inc({ name, n, attrs }),
}));
const createHistogram = vi.fn((name: string) => ({
  record: (n: number, attrs?: Record<string, unknown>) => recordHist({ name, n, attrs }),
}));
vi.mock("@opentelemetry/api", async () => {
  return {
    metrics: {
      getMeter: () => ({
        createCounter: (name: string) => createCounter(name),
        createHistogram: (name: string) => createHistogram(name),
      }),
    },
  };
});

const { recordCounter, recordHistogram } = await import("./otel");

describe("recordCounter", () => {
  it("forwards name + value to OTel meter", () => {
    recordCounter("slate.page.publish", 1, { kind: "post" });
    expect(inc).toHaveBeenCalledWith({
      name: "slate.page.publish",
      n: 1,
      attrs: { kind: "post" },
    });
  });

  it("memoizes per-name: many calls for the same metric create exactly one Counter", () => {
    createCounter.mockClear();
    recordCounter("slate.cached.metric");
    recordCounter("slate.cached.metric", 5);
    recordCounter("slate.cached.metric", 1, { k: "v" });
    expect(createCounter.mock.calls.filter(([n]) => n === "slate.cached.metric").length).toBe(1);
  });

  it("creates a separate Counter per distinct name", () => {
    createCounter.mockClear();
    recordCounter("slate.metric.a");
    recordCounter("slate.metric.b");
    expect(
      createCounter.mock.calls.filter(([n]) => ["slate.metric.a", "slate.metric.b"].includes(n))
        .length,
    ).toBe(2);
  });
});

describe("recordHistogram", () => {
  it("forwards name + value to OTel meter", () => {
    recordHistogram("slate.image.transform.ms", 120);
    expect(recordHist).toHaveBeenCalledWith({
      name: "slate.image.transform.ms",
      n: 120,
      attrs: undefined,
    });
  });

  it("memoizes per-name: repeated calls reuse the Histogram instance", () => {
    createHistogram.mockClear();
    recordHistogram("slate.cached.hist", 1);
    recordHistogram("slate.cached.hist", 2);
    recordHistogram("slate.cached.hist", 3);
    expect(createHistogram.mock.calls.filter(([n]) => n === "slate.cached.hist").length).toBe(1);
  });
});
