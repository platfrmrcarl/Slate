export interface TokenInputs {
  primary?: string;
  background?: string;
  foreground?: string;
  fontDisplay?: string;
  fontBody?: string;
  radius?: "none" | "sm" | "md" | "lg";
  containerWidth?: "2xl" | "3xl" | "5xl";
}

const RADIUS_REM: Record<NonNullable<TokenInputs["radius"]>, string> = {
  none: "0",
  sm: "0.25rem",
  md: "0.5rem",
  lg: "1rem",
};

const CONTAINER_REM: Record<NonNullable<TokenInputs["containerWidth"]>, string> = {
  "2xl": "42rem",
  "3xl": "48rem",
  "5xl": "64rem",
};

export function tokensToCss(t: TokenInputs): string {
  const lines = [
    `--color-primary: ${t.primary ?? "#0b5fff"};`,
    `--color-bg: ${t.background ?? "#ffffff"};`,
    `--color-fg: ${t.foreground ?? "#0f172a"};`,
    `--font-display: ${t.fontDisplay ?? "Inter, system-ui, sans-serif"};`,
    `--font-body: ${t.fontBody ?? "Inter, system-ui, sans-serif"};`,
    `--radius: ${RADIUS_REM[t.radius ?? "md"]};`,
    `--container-max: ${CONTAINER_REM[t.containerWidth ?? "3xl"]};`,
  ];
  return `:root { ${lines.join(" ")} }
body { background: var(--color-bg); color: var(--color-fg); font-family: var(--font-body); }
h1,h2,h3,h4,h5,h6 { font-family: var(--font-display); }
a { color: var(--color-primary); }`;
}
