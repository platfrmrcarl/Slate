import type { ReactNode } from "react";

export default function PageTemplate({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="prose py-10">
      <h1>{title}</h1>
      {children}
    </article>
  );
}
