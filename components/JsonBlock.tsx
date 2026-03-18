/**
 * 这个文件的作用：
 * - 统一展示结构化数据（对象）或长文本。
 * - 自动处理空值、长文本折叠，避免详情页变得过长难读。
 */

type JsonBlockProps = {
  /** 区块标题，例如 "Debug Result" / "Input Preview" */
  title: string;
  /** 可展示的值，可以是 string、object、null 等 */
  value: unknown;
  /** 文本折叠阈值，默认 280 字符 */
  collapseLength?: number;
};

/**
 * 将任意输入变成可展示文本：
 * - string 直接用
 * - object 用 JSON.stringify
 * - null/undefined 返回 null，供上层显示 Empty
 */
function toDisplayText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function JsonBlock({ title, value, collapseLength = 280 }: JsonBlockProps) {
  const displayText = toDisplayText(value);

  if (!displayText) {
    return (
      <section
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: 10,
          background: "#f8fafc",
        }}
      >
        <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 13 }}>{title}</p>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Empty</p>
      </section>
    );
  }

  const isLong = displayText.length > collapseLength;
  const shortText = isLong ? `${displayText.slice(0, collapseLength)}...` : displayText;

  return (
    <section
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 10,
        background: "#f8fafc",
      }}
    >
      <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 13 }}>{title}</p>

      {isLong ? (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 12, color: "#475569", marginBottom: 8 }}>
            Expand full content
          </summary>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontSize: 12,
              lineHeight: 1.45,
              color: "#0f172a",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {displayText}
          </pre>
        </details>
      ) : (
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            fontSize: 12,
            lineHeight: 1.45,
            color: "#0f172a",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          }}
        >
          {shortText}
        </pre>
      )}
    </section>
  );
}
