import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    session_id?: string;
  }> | {
    session_id?: string;
  };
};

type JsonObject = Record<string, unknown>;

type RoundPayload = {
  round_index: number;
  started_at: string | null;
  finished_at: string | null;
  status: "success" | "failed" | "running";
  user_message: {
    id: string;
    content: string;
    created_at: string;
    error_code: string | null;
    error_message: string | null;
  } | null;
  assistant_message: {
    id: string;
    content: string;
    created_at: string;
    error_code: string | null;
    error_message: string | null;
  } | null;
  debug_result: {
    id: string;
    summary: string | null;
    root_cause: string | null;
    fix: string | null;
    error_code: string | null;
    error_message: string | null;
    status: string;
  } | null;
  steps: Array<{
    id: string;
    step_type: string;
    attempt_index: number;
    status: string;
    started_at: string;
    finished_at: string | null;
    latency_ms: number | null;
    error_code: string | null;
    error_message: string | null;
    input_preview: string | null;
    output_preview: string | null;
  }>;
};

function readRoundIndexFromMetadata(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const roundValue = (metadata as JsonObject).roundIndex;
  if (typeof roundValue !== "number" || !Number.isFinite(roundValue)) return null;
  return roundValue > 0 ? Math.trunc(roundValue) : null;
}

function pickRoundIndex(message: { roundIndex: number | null; metadata: unknown }): number | null {
  if (typeof message.roundIndex === "number" && message.roundIndex > 0) {
    return message.roundIndex;
  }
  return readRoundIndexFromMetadata(message.metadata);
}

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function plusMilliseconds(base: Date, milliseconds?: number | null): Date | null {
  if (!milliseconds || milliseconds <= 0) return null;
  return new Date(base.getTime() + milliseconds);
}

function makePreview(value: unknown, maxLength = 240): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export async function GET(req: Request, context: RouteContext) {
  void req;

  try {
    /**
     * 这里做兼容处理：
     * - 在部分 Next 版本/构建模式下，context.params 可能是 Promise
     * - 在另一些模式下，context.params 直接是普通对象
     * 我们统一用 Promise.resolve 包起来，保证都能拿到稳定的 params 对象。
     */
    const params = await Promise.resolve(context.params);
    const sessionId = params.session_id;
    if (!sessionId) {
      return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { debugResult: true },
        },
        stepAttempts: {
          orderBy: [{ roundIndex: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const sessionPayload = {
      id: session.id,
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
      user_id: session.userId,
      title: session.title,
      last_status: session.lastStatus,
      last_round_index: session.lastRoundIndex,
      last_error_message: session.lastErrorMessage,
    };

    const roundMap = new Map<number, RoundPayload>();

    const ensureRound = (roundIndex: number): RoundPayload => {
      const existing = roundMap.get(roundIndex);
      if (existing) return existing;

      const created: RoundPayload = {
        round_index: roundIndex,
        started_at: null,
        finished_at: null,
        status: "running",
        user_message: null,
        assistant_message: null,
        debug_result: null,
        steps: [],
      };
      roundMap.set(roundIndex, created);
      return created;
    };

    for (const message of session.messages) {
      const roundIndex = pickRoundIndex({
        roundIndex: message.roundIndex,
        metadata: message.metadata,
      });
      if (!roundIndex) continue;

      const round = ensureRound(roundIndex);
      const createdAtIso = message.createdAt.toISOString();
      if (!round.started_at || createdAtIso < round.started_at) round.started_at = createdAtIso;
      if (!round.finished_at || createdAtIso > round.finished_at) round.finished_at = createdAtIso;

      if (message.status === "failed") {
        round.status = "failed";
      }

      if (message.role === "user") {
        round.user_message = {
          id: message.id,
          content: message.errorText || "",
          created_at: createdAtIso,
          error_code: message.errorCode,
          error_message: message.errorMessage,
        };
      }

      if (message.role === "assistant") {
        round.assistant_message = {
          id: message.id,
          content:
            makePreview(message.assistantJson ?? message.rawModelOutput ?? message.errorText, 600) ?? "",
          created_at: createdAtIso,
          error_code: message.errorCode,
          error_message: message.errorMessage,
        };
      }

      if (message.debugResult) {
        round.debug_result = {
          id: message.debugResult.messageId,
          summary: message.debugResult.errorType || null,
          root_cause: message.debugResult.rootCause?.join("\n") || null,
          fix: message.debugResult.fixSuggestions?.join("\n") || null,
          error_code: message.debugResult.errorCode,
          error_message: message.debugResult.errorMessage,
          status: message.debugResult.status,
        };

        if (message.debugResult.status === "failed") {
          round.status = "failed";
        }
      }
    }

    for (const step of session.stepAttempts) {
      const round = ensureRound(step.roundIndex);
      const startedAt = step.createdAt;
      const finishedAt = plusMilliseconds(startedAt, step.durationMs);
      const startedAtIso = startedAt.toISOString();
      const finishedAtIso = toIso(finishedAt);

      if (!round.started_at || startedAtIso < round.started_at) {
        round.started_at = startedAtIso;
      }
      if (finishedAtIso && (!round.finished_at || finishedAtIso > round.finished_at)) {
        round.finished_at = finishedAtIso;
      }
      if (step.status === "failed") {
        round.status = "failed";
      }

      round.steps.push({
        id: step.id,
        step_type: step.stepType,
        attempt_index: step.attempt,
        status: step.status,
        started_at: startedAtIso,
        finished_at: finishedAtIso,
        latency_ms: step.durationMs ?? null,
        error_code: step.errorCode,
        error_message: step.errorMessage,
        input_preview: makePreview(step.payloadIn),
        output_preview: makePreview(step.payloadOut),
      });
    }

    const rounds = [...roundMap.values()].sort((a, b) => a.round_index - b.round_index);

    for (const round of rounds) {
      if (round.status === "failed") continue;

      const hasFailedFields =
        Boolean(round.user_message?.error_code) ||
        Boolean(round.assistant_message?.error_code) ||
        Boolean(round.debug_result?.error_code);

      if (hasFailedFields) {
        round.status = "failed";
        continue;
      }

      const allStepSuccess = round.steps.length > 0 && round.steps.every((step) => step.status === "success");
      round.status = allStepSuccess ? "success" : "running";
    }

    return NextResponse.json({ session: sessionPayload, rounds }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "Next API error", detail: String((e as Error)?.message ?? e) },
      { status: 500 }
    );
  }
}
