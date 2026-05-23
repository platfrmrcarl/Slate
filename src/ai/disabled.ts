export function aiEnabled(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return !!key && key.startsWith("sk-ant-");
}

export interface DisabledResult {
  kind: "disabled";
  reason: string;
}

export function disabledResult(): DisabledResult {
  return { kind: "disabled", reason: "AI features are disabled (no ANTHROPIC_API_KEY)" };
}
