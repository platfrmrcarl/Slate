"use client";

import { useState, useTransition } from "react";
import { Editor } from "@/blocks/editor/Editor";
import type { Block } from "@/blocks/types";
import { publishAction, saveDraftAction, unpublishAction, deletePageAction } from "./actions";
import { RewritePanel } from "@/app/admin/_components/RewritePanel";
import { AutoSeoButton } from "@/app/admin/_components/AutoSeoButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [deleteOpen, setDeleteOpen] = useState(false);

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

  function confirmDestroy(): void {
    setDeleteOpen(false);
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
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Title, slug, and excerpt for this page.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="page-title">Title</Label>
            <Input id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="page-slug">Slug</Label>
            <Input id="page-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="page-excerpt">Excerpt</Label>
            <Input id="page-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <RewritePanel />

      <Editor initialBlocks={blocks} onChange={setBlocks} />

      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
          <CardDescription>
            Optional search-engine title and description. AI suggestions populate the fields but
            don&apos;t auto-save.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="page-seo-title">SEO title</Label>
            <Input
              id="page-seo-title"
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              maxLength={120}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="page-seo-description">SEO description</Label>
            <Textarea
              id="page-seo-description"
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

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={save} disabled={pending}>
          Save draft
        </Button>
        <Button variant="outline" onClick={openPreview} disabled={pending}>
          Preview
        </Button>
        {status !== "published" ? (
          <Button onClick={publish} disabled={pending}>
            Publish
          </Button>
        ) : (
          <Button variant="outline" onClick={unpublish} disabled={pending}>
            Unpublish
          </Button>
        )}
        <Badge variant="outline" className="ml-1">
          {status}
        </Badge>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogTrigger
            render={<Button variant="destructive" className="ml-auto" disabled={pending} />}
          >
            Move to trash
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move this page to trash?</DialogTitle>
              <DialogDescription>
                The page will be hidden from your site. You can restore it later from the trash
                list.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <Button variant="destructive" onClick={confirmDestroy} disabled={pending}>
                Move to trash
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
