// PLACEHOLDER: Hand-built approximation of the BlockNote admin editor. Replace
// with a real screenshot of the live editor once we have a polished one.
// Tracking: spec §2.5, Task 6.

import { Card, CardContent } from "@/components/ui/card";

export default function EditorMockup() {
  return (
    <Card className="shadow-2xl">
      <CardContent>
        <div className="mb-6 flex items-center gap-2">
          <div className="bg-border h-2.5 w-2.5 rounded-full" />
          <div className="bg-border h-2.5 w-2.5 rounded-full" />
          <div className="bg-border h-2.5 w-2.5 rounded-full" />
          <div className="text-muted-foreground ml-3 font-mono text-[11px]">
            editor — Untitled Page
          </div>
        </div>
        <div className="space-y-3">
          <div className="bg-border h-3 w-1/3 rounded-sm" />
          <div className="bg-muted-foreground/40 h-6 w-3/4 rounded-sm" />
          <div className="bg-border h-3 w-11/12 rounded-sm" />
          <div className="bg-border h-3 w-9/12 rounded-sm" />
          <div className="bg-background/40 border-l-2 border-[#a8a3ff] py-2 pl-3">
            <div className="bg-border mb-2 h-2.5 w-4/5 rounded-sm" />
            <div className="bg-border h-2.5 w-3/5 rounded-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="bg-border h-16 rounded-sm" />
            <div className="bg-border h-16 rounded-sm" />
            <div className="bg-border h-16 rounded-sm" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
