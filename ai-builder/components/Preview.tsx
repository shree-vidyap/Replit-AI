"use client";
import { useRef } from "react";
import { Maximize2 } from "lucide-react";

export default function Preview({ url, running }: { url: string | null; running: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2 text-xs uppercase tracking-wide text-gray-500">
        <span>Live preview</span>
        {url && (
          <button onClick={() => frame.current?.requestFullscreen()}
            className="flex items-center gap-1 rounded border border-gray-700 px-2 py-1 normal-case text-gray-300 hover:bg-gray-800">
            <Maximize2 size={12} /> Full screen
          </button>
        )}
      </div>
      {url ? (
        <iframe ref={frame} src={url} className="flex-1 bg-white" title="Live preview" allow="fullscreen" />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">
          {running ? "Starting dev server..." : "Press Run to see your app here."}
        </div>
      )}
    </div>
  );
}
