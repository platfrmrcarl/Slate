import type { ReactNode } from "react";

export default function PostTemplate({
  children,
  title,
  publishedAt,
  authorName,
}: {
  children: ReactNode;
  title: string;
  publishedAt?: Date | null;
  authorName?: string;
}) {
  return (
    <article className="py-10">
      <h1 className="text-4xl font-extrabold">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">
        {publishedAt?.toISOString().slice(0, 10)} · {authorName ?? ""}
      </p>
      <div className="prose mt-8">{children}</div>
    </article>
  );
}
