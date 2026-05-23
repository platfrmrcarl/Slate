import { requireRole } from "@/auth/context";

export default async function InstallThemePage() {
  await requireRole("admin");
  return (
    <main className="prose mx-auto max-w-2xl p-6">
      <h1>Install a theme</h1>
      <p>
        In v1, themes that ship React components install at <strong>compose time</strong>: drop the
        theme folder under <code>themes/&lt;slug&gt;/</code>, add it to the registry, and redeploy.
      </p>
      <p>Use the CLI to scaffold a theme directory from a Git URL or a local folder:</p>
      <pre>
        <code>{`wpkiller theme install https://github.com/you/your-theme`}</code>
      </pre>
      <p>
        Customizing tokens (colors, fonts, copy, layout choices) and switching template variants
        happens at runtime without a redeploy.
      </p>
      <p className="text-sm text-gray-500">
        Runtime install of arbitrary React-component themes lands in v2 via a WASM-sandboxed
        runtime.
      </p>
    </main>
  );
}
