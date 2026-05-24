import type { ReactNode } from "react";
export function Paragraph({ children }: { children: ReactNode }) {
  return <p className="my-3 leading-relaxed">{children}</p>;
}
