import JsonBlock from "./JsonBlock";
import StatusBadge from "./StatusBadge";
import type { StepItemApi } from "@/lib/session-types";

/**
 * 这个文件的作用：
 * - 渲染某个 round 内的单个步骤（Step）。
 * - 重点展示失败信息、耗时、输入输出预览。
 */

type StepItemProps = {
  /** 单个步骤数据 */
  step: StepItemApi;
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function StepItem({ step }: StepItemProps) {
  const failed = step.status === "failed";

  return (
    <article
      style={{
        border: failed ? "1px solid #fca5a5" : "1px solid #e2e8f0",
        borderRadius: 10,
        padding: 10,
        background: failed ? "#fef2f2" : "#ffffff",
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <strong style={{ fontSize: 13, color: "#0f172a" }}>
          {step.step_type} (attempt {step.attempt_index})
        </strong>
        <StatusBadge status={step.status} />
      </header>

      <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 12, color: "#475569" }}>
        <p style={{ margin: 0 }}>
          <strong>Started:</strong> {formatDateTime(step.started_at)}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Finished:</strong> {formatDateTime(step.finished_at)}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Latency:</strong> {step.latency_ms ?? "-"} ms
        </p>
      </div>

      {step.error_code || step.error_message ? (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: "#b91c1c",
            background: "#fff1f2",
            border: "1px solid #fecdd3",
            borderRadius: 8,
            padding: "6px 8px",
          }}
        >
          <strong>Error:</strong> {step.error_code || "-"} {step.error_message || ""}
        </p>
      ) : null}

      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
        <JsonBlock title="Input Preview" value={step.input_preview} collapseLength={220} />
        <JsonBlock title="Output Preview" value={step.output_preview} collapseLength={220} />
      </div>
    </article>
  );
}
