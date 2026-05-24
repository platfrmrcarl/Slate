// PLACEHOLDER: Hand-built approximation of the BlockNote admin editor. Replace
// with a real screenshot of the live editor once we have a polished one.
// Tracking: spec §2.5, Task 6.

export default function EditorMockup() {
  return (
    <div className="rounded-lg border border-[var(--slate-border-strong)] bg-[var(--slate-bg-card)] p-6 shadow-2xl">
      <div className="mb-6 flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--slate-border-strong)]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--slate-border-strong)]" />
        <div className="h-2.5 w-2.5 rounded-full bg-[var(--slate-border-strong)]" />
        <div className="ml-3 font-mono text-[11px] text-[var(--slate-fg-subtle)]">
          editor — Untitled Page
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 w-1/3 rounded-sm bg-[var(--slate-border-strong)]" />
        <div className="h-6 w-3/4 rounded-sm bg-[var(--slate-fg-muted)]/40" />
        <div className="h-3 w-11/12 rounded-sm bg-[var(--slate-border-strong)]" />
        <div className="h-3 w-9/12 rounded-sm bg-[var(--slate-border-strong)]" />
        <div className="border-l-2 border-[#a8a3ff] bg-[var(--slate-bg)]/40 py-2 pl-3">
          <div className="mb-2 h-2.5 w-4/5 rounded-sm bg-[var(--slate-border-strong)]" />
          <div className="h-2.5 w-3/5 rounded-sm bg-[var(--slate-border-strong)]" />
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2">
          <div className="h-16 rounded-sm bg-[var(--slate-border-strong)]" />
          <div className="h-16 rounded-sm bg-[var(--slate-border-strong)]" />
          <div className="h-16 rounded-sm bg-[var(--slate-border-strong)]" />
        </div>
      </div>
    </div>
  );
}
