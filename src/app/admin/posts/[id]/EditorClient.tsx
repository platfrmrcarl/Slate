"use client";

import { useState, useTransition } from "react";
import { Editor } from "@/blocks/editor/Editor";
import type { Block } from "@/blocks/types";
import { savePostAction, publishPostAction, deletePostAction } from "@/app/actions/posts";
import { RewritePanel } from "@/app/admin/_components/RewritePanel";
import { AutoSeoButton } from "@/app/admin/_components/AutoSeoButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  postId: string;
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
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append("id", props.postId);
    fd.append("title", title);
    fd.append("slug", slug);
    fd.append("excerpt", excerpt);
    fd.append("blocks", JSON.stringify(blocks));
    fd.append("categoryIds", "[]");
    fd.append("tagIds", "[]");
    fd.append("seoTitle", seoTitle);
    fd.append("seoDescription", seoDescription);
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

  function confirmDestroy(): void {
    setDeleteOpen(false);
    start(async () => {
      const fd = new FormData();
      fd.append("id", props.postId);
      const res = await deletePostAction(undefined, fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Title, slug, and excerpt for this post.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="post-title">Title</Label>
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="post-slug">Slug</Label>
            <Input
              id="post-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="post-excerpt">Excerpt</Label>
            <Input
              id="post-excerpt"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <RewritePanel />

      <Editor initialBlocks={blocks} onChange={setBlocks} />

      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
          <CardDescription>
            Optional search-engine title and description. AI suggestions populate the
            fields but don&apos;t auto-save.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="post-seo-title">SEO title</Label>
            <Input
              id="post-seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="post-seo-description">SEO description</Label>
            <Textarea
              id="post-seo-description"
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={3}
              maxLength={300}
            />
          </div>
          <AutoSeoButton
            title={title}
            blocks={blocks}
            excerpt={excerpt}
            onSuggest={({ seoTitle: t, seoDescription: d }) => {
              setSeoTitle(t);
              setSeoDescription(d);
            }}
          />
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={save} disabled={pending}>
          Save draft
        </Button>
        <Button onClick={publish} disabled={pending}>
          Publish
        </Button>
        <Badge variant="outline" className="ml-1">
          {status}
        </Badge>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger
            render={<Button variant="destructive" className="ml-auto" disabled={pending} />}
          >
            Delete
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this post?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. The post and its content will be removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button variant="destructive" onClick={confirmDestroy} disabled={pending}>
                Delete post
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
