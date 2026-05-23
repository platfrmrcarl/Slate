"use client";

import { useActionState } from "react";
import { submitCommentAction } from "@/app/actions/comments";

interface SubmitState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export function CommentForm({ postId }: { postId: string }): React.ReactElement {
  const [state, action, pending] = useActionState<SubmitState | undefined, FormData>(
    submitCommentAction,
    undefined,
  );
  if (state?.ok) {
    return (
      <p className="mt-6 rounded bg-green-50 p-3 text-sm">
        Thanks — your comment is awaiting moderation.
      </p>
    );
  }
  return (
    <form action={action} className="mt-6 space-y-2">
      <input type="hidden" name="postId" value={postId} />
      {/* Honeypot: hidden from humans, irresistible to bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          name="authorName"
          placeholder="Name"
          required
          className="rounded border px-2 py-1"
          aria-invalid={state?.fieldErrors?.authorName ? true : undefined}
        />
        <input
          name="authorEmail"
          type="email"
          placeholder="Email (not displayed)"
          required
          className="rounded border px-2 py-1"
          aria-invalid={state?.fieldErrors?.authorEmail ? true : undefined}
        />
      </div>
      <textarea
        name="body"
        rows={4}
        placeholder="Add a comment (markdown supported)"
        required
        className="w-full rounded border px-2 py-1"
        aria-invalid={state?.fieldErrors?.body ? true : undefined}
      />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}
