"use client";

import { useState, useTransition } from "react";
import { Editor } from "@/blocks/editor/Editor";
import type { Block } from "@/blocks/types";
import { publishAction, saveDraftAction, unpublishAction, deletePageAction } from "./actions";
import { RewritePanel } from "@/app/admin/_components/RewritePanel";
import { AutoSeoButton } from "@/app/admin/_components/AutoSeoButton";

interface Props {
  pageId: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  initialBlocks: Block[];
  seoTitle: string;
  seoDescription: string;
}

export function EditorClient(props: Props): React.ReactElement {
  const [title, setTitle] = useState(props.title);
  const [slug, setSlug] = useState(props.slug);
  const [excerpt, setExcerpt] = useState(props.excerpt);
  const [blocks, setBlocks] = useState<Block[]>(props.initialBlocks);
  const [seoTitle, setSeoTitle] = useState(props.seoTitle);
  const [seoDescription, setSeoDescription] = useState(props.seoDescription);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(props.status);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("title", title);
    fd.append("slug", slug);
    fd.append("excerpt", excerpt);
    fd.append("blocks", JSON.stringify(blocks));
    fd.append("seoTitle", seoTitle);
    fd.append("seoDescription", seoDescription);
    return fd;
  }

  function save(): void {
    start(async () => {
      await saveDraftAction(props.pageId, buildFormData());
    });
  }

  function publish(): void {
    start(async () => {
      await saveDraftAction(props.pageId, buildFormData());
      await publishAction(props.pageId);
      setStatus("published");
    });
  }

  function unpublish(): void {
    start(async () => {
      await unpublishAction(props.pageId);
      setStatus("draft");
    });
  }

  function destroy(): void {
    if (!confirm("Move this page to trash?")) return;
    start(async () => {
      await deletePageAction(props.pageId);
    });
  }

  async function openPreview(): Promise<void> {
    const res = await fetch(`/api/preview/issue?pageId=${props.pageId}`, { method: "POST" });
    if (!res.ok) return;
    const { url } = (await res.json()) as { url: string };
    window.open(url, "_blank");
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 rounded border bg-white p-4">
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="rounded border p-2"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-gray-600">Excerpt</span>
          <input
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className="rounded border p-2"
          />
        </label>
      </div>

      <RewritePanel />

      <Editor initialBlocks={blocks} onChange={setBlocks} />

      <details className="rounded border bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium">SEO</summary>
        <div className="mt-3 grid gap-3">
          <label className="grid gap-1">
            <span className="text-gray-600">SEO title</span>
            <input
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              maxLength={120}
              className="rounded border p-2"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-gray-600">SEO description</span>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
              maxLength={300}
              className="rounded border p-2"
            />
          </label>
          <AutoSeoButton
            title={title}
            blocks={blocks}
            excerpt={excerpt}
            onSuggest={({ seoTitle: t, seoDescription: d }) => {
              setSeoTitle(t);
              setSeoDescription(d);
            }}
          />
          <p className="text-xs text-gray-500">
            AI suggestions populate the fields but don&apos;t auto-save. Click <em>Save draft</em>
            when ready.
          </p>
        </div>
      </details>

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={pending} className="rounded border px-4 py-2">
          Save draft
        </button>
        <button onClick={openPreview} disabled={pending} className="rounded border px-4 py-2">
          Preview
        </button>
        {status !== "published" ? (
          <button
            onClick={publish}
            disabled={pending}
            className="rounded bg-black px-4 py-2 text-white"
          >
            Publish
          </button>
        ) : (
          <button onClick={unpublish} disabled={pending} className="rounded border px-4 py-2">
            Unpublish
          </button>
        )}
        <button
          onClick={destroy}
          disabled={pending}
          className="ml-auto rounded border border-red-300 px-4 py-2 text-red-700"
        >
          Move to trash
        </button>
      </div>
    </div>
  );
}
