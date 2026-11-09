"use client";
import Editor from "@monaco-editor/react";

export default function CodeEditor({
  code,
  language,
  onChange,
  readOnly = false,
}: {
  code: string;
  language: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language={language}
      value={code}
      onChange={(value) => onChange(value ?? "")}
      options={{
        minimap: { enabled: false },
        automaticLayout: true,
        fontSize: 14,
        readOnly,
      }}
    />
  );
}
