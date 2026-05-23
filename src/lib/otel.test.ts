import { describe, expect, it, vi } from "vitest";

const inc = vi.fn();
const recordHist = vi.fn();
vi.mock("@opentelemetry/api", async () => {
  return {
    metrics: {
      getMeter: () => ({
        createCounter: (name: string) => ({
          add: (n: number, attrs?: Record<string, unknown>) => inc({ name, n, attrs }),
        }),
        createHistogram: (name: string) => ({
          record: (n: number, attrs?: Record<string, unknown>) =>
            recordHist({ name, n, attrs }),
        }),
      }),
    },
  };
});

const { recordCounter, recordHistogram } = await import("./otel");

describe("recordCounter", () => {
  it("forwards name + value to OTel meter", () => {
    recordCounter("wpk.page.publish", 1, { kind: "post" });
    expect(inc).toHaveBeenCalledWith({
      name: "wpk.page.publish",
      n: 1,
      attrs: { kind: "post" },
    });
  });
});

describe("recordHistogram", () => {
  it("forwards name + value to OTel meter", () => {
    recordHistogram("wpk.image.transform.ms", 120);
    expect(recordHist).toHaveBeenCalledWith({
      name: "wpk.image.transform.ms",
      n: 120,
      attrs: undefined,
    });
  });
});
