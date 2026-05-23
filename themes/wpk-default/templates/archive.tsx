import type { ReactNode } from "react";

export default function ArchiveTemplate({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="py-10">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="mt-6">{children}</div>
    </section>
  );
}
