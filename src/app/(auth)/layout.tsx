export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white p-4">
        <h1 className="text-lg font-semibold">Slate</h1>
      </header>
      <main className="mx-auto max-w-md p-8">{children}</main>
    </div>
  );
}
