import { render } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock next/navigation's notFound to throw a recognizable error so we can assert
// on its invocation instead of hitting Next's actual 404 plumbing.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import MarketingHome from "./page";

describe("MarketingHome", () => {
  const originalFlag = process.env.SLATE_MARKETING_HOME;
  beforeEach(() => {
    delete process.env.SLATE_MARKETING_HOME;
  });
  afterEach(() => {
    if (originalFlag === undefined) delete process.env.SLATE_MARKETING_HOME;
    else process.env.SLATE_MARKETING_HOME = originalFlag;
  });

  it("404s when SLATE_MARKETING_HOME is unset", () => {
    expect(() => render(<MarketingHome />)).toThrow("NEXT_NOT_FOUND");
  });

  it("renders the hero when SLATE_MARKETING_HOME=1", () => {
    process.env.SLATE_MARKETING_HOME = "1";
    const { getByText } = render(<MarketingHome />);
    expect(getByText(/should have been/)).toBeTruthy();
    expect(getByText("Start free →")).toBeTruthy();
  });
});
