"use client";

import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

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
    <aside>
      <Card>
        <CardHeader>
          <CardTitle>Assistant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {msgs.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "rounded bg-muted p-2 text-sm"
                    : "rounded p-2 text-sm text-foreground"
                }
              >
                <Badge variant="outline" className="mr-2 font-mono text-[10px] uppercase">
                  {m.role}
                </Badge>
                <span>{m.content}</span>
              </div>
            ))}
          </div>
          <Textarea ref={inputRef} rows={2} placeholder="Ask about this post..." />
          <Button onClick={send} disabled={pending} size="sm">
            {pending ? "Thinking..." : "Send"}
          </Button>
        </CardContent>
      </Card>
    </aside>
  );
}
