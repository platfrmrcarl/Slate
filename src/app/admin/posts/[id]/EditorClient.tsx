"use client";

import { useState, useTransition } from "react";
import { Editor } from "@/blocks/editor/Editor";
import type { Block } from "@/blocks/types";
import { savePostAction, publishPostAction, deletePostAction } from "@/app/actions/posts";

interface Props {
  postId: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  initialBlocks: Block[];
}

export function EditorClient(props: Props): React.ReactElement {
  const [title, setTitle] = useState(props.title);
  const [slug, setSlug] = useState(props.slug);
  const [excerpt, setExcerpt] = useState(props.excerpt);
  const [blocks, setBlocks] = useState<Block[]>(props.initialBlocks);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState(props.status);
  const [error, setError] = useState<string | null>(null);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("id", props.postId);
    fd.append("title", title);
    fd.append("slug", slug);
    fd.append("excerpt", excerpt);
    fd.append("blocks", JSON.stringify(blocks));
    fd.append("categoryIds", "[]");
    fd.append("tagIds", "[]");
    return fd;
  }

  function save(): void {
    start(async () => {
      const res = await savePostAction(undefined, buildFormData());
      if (res?.error) setError(res.error);
    });
  }

  function publish(): void {
    start(async () => {
      const res = await savePostAction(undefined, buildFormData());
      if (res?.error) {
        setError(res.error);
        return;
      }
      const pubFd = new FormData();
      pubFd.append("id", props.postId);
      const pubRes = await publishPostAction(undefined, pubFd);
      if (pubRes?.error) setError(pubRes.error);
      else setStatus("published");
    });
  }

  function destroy(): void {
    if (!confirm("Delete this post?")) return;
    start(async () => {
      const fd = new FormData();
      fd.append("id", props.postId);
      const res = await deletePostAction(undefined, fd);
      if (res?.error) setError(res.error);
    });
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

      <Editor initialBlocks={blocks} onChange={setBlocks} />

      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={pending} className="rounded border px-4 py-2">
          Save draft
        </button>
        <button
          onClick={publish}
          disabled={pending}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Publish
        </button>
        <span className="text-xs text-gray-500">status: {status}</span>
        <button
          onClick={destroy}
          disabled={pending}
          className="ml-auto rounded border border-red-300 px-4 py-2 text-red-700"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
