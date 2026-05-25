import { requireRole } from "@/auth/context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function InstallThemePage() {
  await requireRole("admin");
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Install a theme</h1>
        <p className="text-muted-foreground text-sm">
          How to add a new theme to your Slate site.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Compose-time install (v1)</CardTitle>
          <CardDescription>
            In v1, themes that ship React components install at compose time: drop the theme
            folder under <code>themes/&lt;slug&gt;/</code>, add it to the registry, and redeploy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Use the CLI to scaffold a theme directory from a Git URL or a local folder:</p>
          <pre className="bg-muted overflow-x-auto rounded-lg p-3 text-xs">
            <code>{`slate theme install https://github.com/you/your-theme`}</code>
          </pre>
          <p className="text-muted-foreground">
            Customizing tokens (colors, fonts, copy, layout choices) and switching template
            variants happens at runtime without a redeploy.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Runtime install (v2)</CardTitle>
          <CardDescription>
            Runtime install of arbitrary React-component themes lands in v2 via a
            WASM-sandboxed runtime.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
