import { requireRole } from "@/auth/context";
import { usageThisMonth } from "@/ai/usage";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export default async function AiUsagePage() {
  await requireRole("admin");
  const summary = await usageThisMonth({});
  const budget = env().AI_MONTHLY_TOKEN_BUDGET;
  const pct = Math.min(100, Math.round((summary.totalTokens / budget) * 100));
  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">AI usage this month</h1>
      <p className="text-sm text-gray-600">
        {summary.totalTokens.toLocaleString()} / {budget.toLocaleString()} tokens ({pct}%)
      </p>
      <div className="my-4 h-3 w-full overflow-hidden rounded bg-gray-200">
        <div
          className={`h-full ${pct >= 90 ? "bg-red-600" : pct >= 70 ? "bg-yellow-500" : "bg-green-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <h2 className="mb-2 text-lg font-semibold">By feature</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Feature</th>
            <th>Tokens</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(summary.byFeature)
            .sort((a, b) => b[1] - a[1])
            .map(([feature, n]) => (
              <tr key={feature} className="border-b">
                <td className="py-2">{feature}</td>
                <td>{n.toLocaleString()}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </main>
  );
}
