"use client";

import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function SidebarChat({ postId }: { postId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [pending, setPending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function send() {
    const text = inputRef.current?.value.trim();
    if (!text) return;
    setMsgs((m) => [...m, { role: "user", content: text }]);
    setPending(true);
    if (inputRef.current) inputRef.current.value = "";
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        sessionId: sessionId ?? undefined,
        contextRef: `post:${postId}`,
      }),
    });
    if (!res.ok) {
      setMsgs((m) => [...m, { role: "assistant", content: `[error ${res.status}]` }]);
      setPending(false);
      return;
    }
    const body = (await res.json()) as { sessionId: string; reply: string; disabled?: boolean };
    setSessionId(body.sessionId);
    setMsgs((m) => [
      ...m,
      { role: "assistant", content: body.disabled ? "AI is disabled." : body.reply },
    ]);
    setPending(false);
  }

  return (
    <aside className="rounded border p-3 text-sm">
      <h2 className="mb-2 text-base font-semibold">Assistant</h2>
      <div className="mb-2 max-h-72 space-y-2 overflow-y-auto">
        {msgs.map((m, i) => (
          <p
            key={i}
            className={m.role === "user" ? "rounded bg-gray-100 p-2" : "p-2 text-gray-800"}
          >
            <span className="mr-1 font-mono text-xs uppercase text-gray-500">{m.role}:</span>
            {m.content}
          </p>
        ))}
      </div>
      <textarea
        ref={inputRef}
        rows={2}
        placeholder="Ask about this post..."
        className="w-full rounded border px-2 py-1"
      />
      <button
        onClick={send}
        disabled={pending}
        className="mt-2 rounded bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {pending ? "Thinking..." : "Send"}
      </button>
    </aside>
  );
}
