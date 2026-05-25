import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: "system" }),
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  it("renders nothing on the server to avoid SSR hydration mismatch", () => {
    expect(renderToStaticMarkup(<ThemeToggle />)).toBe("");
  });
});
