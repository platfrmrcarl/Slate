import Link from "next/link";
import type { Route } from "next";

const VARIANT: Record<string, string> = {
  primary: "bg-[var(--color-primary)] text-white",
  secondary: "border border-current",
  ghost: "underline",
};

export function Button({
  href,
  label,
  variant = "primary",
}: {
  href: string;
  label: string;
  variant?: string;
}) {
  const cls = VARIANT[variant] ?? VARIANT.primary;
  return (
    <Link
      href={href as Route}
      className={`inline-flex items-center rounded-[var(--radius)] px-4 py-2 text-sm font-medium ${cls}`}
    >
      {label}
    </Link>
  );
}
