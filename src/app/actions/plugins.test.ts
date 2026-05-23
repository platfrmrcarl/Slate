import { afterEach, describe, expect, it, vi } from "vitest";

const requireRole = vi.fn().mockResolvedValue({ id: "u-1" });
vi.mock("@/auth/context", () => ({ requireRole: () => requireRole() }));
const setEnabled = vi.fn();
const rotateWebhookSecret = vi.fn();
vi.mock("@/plugins/service", () => ({
  setEnabled: (...a: unknown[]) => setEnabled(...a),
  rotateWebhookSecret: (...a: unknown[]) => rotateWebhookSecret(...a),
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const { enablePluginAction, disablePluginAction, rotateSecretAction } = await import("./plugins");

afterEach(() => {
  setEnabled.mockReset();
  rotateWebhookSecret.mockReset();
  revalidatePath.mockReset();
});

function fd(o: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
}

describe("plugin actions", () => {
  it("enable sets enabled=true", async () => {
    await enablePluginAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(setEnabled).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", true);
  });
  it("disable sets enabled=false", async () => {
    await disablePluginAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(setEnabled).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", false);
  });
  it("rotateSecret calls service", async () => {
    await rotateSecretAction(undefined, fd({ id: "11111111-1111-1111-1111-111111111111" }));
    expect(rotateWebhookSecret).toHaveBeenCalled();
  });
});
