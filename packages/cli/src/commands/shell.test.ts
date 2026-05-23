import { describe, expect, it } from "vitest";
import { shellCommand } from "./shell";

describe("shell command", () => {
  it("constructs with name 'shell'", () => {
    const cmd = shellCommand();
    expect(cmd.name()).toBe("shell");
    expect(cmd.description()).toContain("REPL");
  });
});
