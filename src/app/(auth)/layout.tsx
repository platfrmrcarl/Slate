import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="border-border border-b p-4">
        <h1 className="text-lg font-semibold">Slate</h1>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
