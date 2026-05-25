import { requireRole } from "@/auth/context";
import { usageThisMonth } from "@/ai/usage";
import { env } from "@/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function AiUsagePage() {
  await requireRole("admin");
  const summary = await usageThisMonth({});
  const budget = env().AI_MONTHLY_TOKEN_BUDGET;
  const pct = Math.min(100, Math.round((summary.totalTokens / budget) * 100));
  const barColor = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-yellow-500" : "bg-primary";
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">AI usage this month</h1>
        <p className="text-muted-foreground text-sm">
          Token consumption versus the monthly budget.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
          <CardDescription>
            {summary.totalTokens.toLocaleString()} / {budget.toLocaleString()} tokens ({pct}%)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted h-3 w-full overflow-hidden rounded">
            <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By feature</CardTitle>
          <CardDescription>Token usage broken down by feature.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(summary.byFeature)
                .sort((a, b) => b[1] - a[1])
                .map(([feature, n]) => (
                  <TableRow key={feature}>
                    <TableCell>{feature}</TableCell>
                    <TableCell className="text-muted-foreground">{n.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              {Object.keys(summary.byFeature).length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-muted-foreground py-4 text-center">
                    No usage recorded yet this month.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
