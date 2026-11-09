import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold">AI Builder</h1>
      <p className="text-gray-400">
        Describe a React application, edit the generated files in the browser, run it instantly, and deploy it.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/workspace/local" className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500">
          Open local workspace
        </Link>
        <Link href="/dashboard" className="rounded border border-gray-600 px-4 py-2 font-medium hover:bg-gray-800">
          Dashboard
        </Link>
        <Link href="/login" className="rounded border border-gray-600 px-4 py-2 font-medium hover:bg-gray-800">
          Log in / Register
        </Link>
      </div>
      <p className="text-xs text-gray-500">Use Chrome or Edge — WebContainers need a Chromium-based browser.</p>
    </main>
  );
}
