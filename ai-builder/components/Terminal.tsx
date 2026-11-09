"use client";
import { useEffect, useRef } from "react";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

export default function Terminal({ logs, onClear }: { logs: string; onClear: () => void }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [logs]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-1 text-xs uppercase tracking-wide text-gray-500">
        Terminal
        <button onClick={onClear} className="hover:text-gray-300">Clear</button>
      </div>
      <pre ref={ref} className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-green-300">
        {logs.replace(ANSI, "") || "Click Run to install dependencies and start the dev server."}
      </pre>
    </div>
  );
}
