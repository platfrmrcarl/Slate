import type { ReactNode } from "react";

export default function HomeTemplate({ children }: { children: ReactNode }) {
  return <main className="py-10">{children}</main>;
}
