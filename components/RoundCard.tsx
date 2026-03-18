import JsonBlock from "./JsonBlock";
import StatusBadge from "./StatusBadge";
import StepItem from "./StepItem";
import type { SessionDetail } from "@/lib/session-types";

/**
 * 这个文件的作用：
 * - 渲染 Session 详情中的一个 Round 卡片。
 * - 展示 round 状态、user/assistant 消息、debug_result 和 steps。
 */

type RoundData = SessionDetail["rounds"][number];

type RoundCardProps = {
  /** 当前 round 数据 */
  round: RoundData;
  /** 当前 round 是否展开 */
  expanded: boolean;
  /** 切换展开/收起时触发 */
  onToggle: (roundIndex: number) => void;
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export default function RoundCard({ round, expanded, onToggle }: RoundCardProps) {
  const failed = round.status === "failed";

  return (
    <article
      style={{
        border: failed ? "1px solid #fca5a5" : "1px solid #dbe4f0",
        borderRadius: 12,
        background: failed ? "#fff7f7" : "#ffffff",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(round.roundIndex)}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          textAlign: "left",
          padding: "12px 14px",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <strong style={{ fontSize: 15, color: "#0f172a" }}>Round {round.roundIndex}</strong>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {formatDateTime(round.startedAt)} ~ {formatDateTime(round.finishedAt)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <StatusBadge status={round.status} />
          <span style={{ fontSize: 12, color: "#475569" }}>{expanded ? "Collapse" : "Expand"}</span>
        </div>
      </button>

      {expanded ? (
        <div style={{ borderTop: "1px solid #e2e8f0", padding: 14, display: "grid", gap: 10 }}>
          <JsonBlock title="User Message" value={round.userMessage?.content ?? null} collapseLength={260} />
          <JsonBlock title="Assistant Message" value={round.assistantMessage?.content ?? null} collapseLength={260} />

          <JsonBlock
            title="Debug Result Summary"
            value={{
              summary: round.debugResult?.summary ?? null,
              rootCause: round.debugResult?.root_cause ?? null,
              fix: round.debugResult?.fix ?? null,
              errorCode: round.debugResult?.error_code ?? null,
              errorMessage: round.debugResult?.error_message ?? null,
            }}
            collapseLength={260}
          />

          <section style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#0f172a" }}>
              Steps ({round.steps.length})
            </p>
            {round.steps.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>No steps in this round.</p>
            ) : (
              round.steps.map((step) => <StepItem key={step.id} step={step} />)
            )}
          </section>
        </div>
      ) : null}
    </article>
  );
}
