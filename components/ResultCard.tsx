import { useState } from "react";

type ResultCardProps = {
  title: string;
  items: string[];
};

export default function ResultCard({ title, items }: ResultCardProps) {
  const [copied, setCopied] = useState(false);
  const hasItems = items.length > 0;

  async function onCopy() {
    if (!hasItems) {
      return;
    }
    await navigator.clipboard.writeText(items.join("\n"));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 18, letterSpacing: 0.2, color: "#0f172a" }}>
          {title}
        </h3>
        <button
          type="button"
          onClick={onCopy}
          disabled={!hasItems}
          style={{
            borderRadius: 999,
            border: "1px solid #d8d5ff",
            padding: "6px 12px",
            background: hasItems ? "#f2efff" : "transparent",
            color: hasItems ? "#5b4bff" : "rgba(15, 23, 42, 0.4)",
            cursor: hasItems ? "pointer" : "not-allowed",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 1.2,
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </header>
      {hasItems ? (
        <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 10 }}>
          {items.map((item, idx) => (
            <li key={`${title}-${idx}`} style={{ lineHeight: 1.5, color: "#1e293b" }}>
              {item}
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ margin: 0, color: "rgba(30, 41, 59, 0.6)" }}>No data.</p>
      )}
    </section>
  );
}
