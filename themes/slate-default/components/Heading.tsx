import type { ReactNode } from "react";

const SIZE: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "text-4xl font-extrabold mt-8 mb-4",
  2: "text-3xl font-bold mt-8 mb-3",
  3: "text-2xl font-semibold mt-6 mb-2",
  4: "text-xl font-semibold mt-4 mb-2",
  5: "text-lg font-semibold mt-3 mb-2",
  6: "text-base font-semibold mt-2 mb-1",
};

export function Heading({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return <Tag className={SIZE[level]}>{children}</Tag>;
}
