// 职责说明：调度推理调用并在事务中落库，同时返回结构化调试结果。
// 调用链：UI -> /api/debug -> FastAPI /debug -> Prisma $transaction -> PostgreSQL
// 输出
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DebugRequestBody = {
  input?: unknown;
  sessionId?: unknown;
};

type FastApiResponse = {
  error_type?: unknown;
  root_cause?: unknown;
  fix_suggestions?: unknown;
  prevention?: unknown;
  raw_model_output?: unknown;
  model_name?: unknown;
  prompt_version?: unknown;
  [key: string]: unknown;
};

/**
 * 说明：将未知输入安全转换为字符串数组。
 * 输入：可能为数组或其他类型的值。
 * 输出：字符串数组，非数组输入将返回空数组。
 * 异常：无。
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function pickFirstString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

/**
 * 说明：接收调试请求，调用 FastAPI 推理并使用事务写入会话相关数据。
 * 输入：JSON body（language、errorText、codeSnippet、可选 session_id）。
 * 输出：FastAPI 结构化结果 + X-Session-Id 响应头。
 * 异常：FastAPI 失败返回 502；数据库写入失败返回 500。
 */
export async function POST(req: Request) {
  try {
    const fastapiBaseUrl = process.env.FASTAPI_BASE_URL;
    if (!fastapiBaseUrl) {
      return NextResponse.json(
        { error: "Missing FASTAPI_BASE_URL" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as DebugRequestBody;
    const input = toTrimmedString(body?.input);
    const sessionIdInput =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

    if (!input) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const baseUrl = fastapiBaseUrl.replace(/\/$/, "");
    console.log("FASTAPI_BASE_URL=", process.env.FASTAPI_BASE_URL);
    console.log("parse url =", `${process.env.FASTAPI_BASE_URL}/parse`);
    const parseResp = await fetch(`${baseUrl}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_input: input }),
    });

    const parseText = await parseResp.text();
    if (!parseResp.ok) {
      return NextResponse.json(
        { error: "FastAPI parse error", detail: parseText },
        { status: 502 }
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(parseText) as Record<string, unknown>;
    } catch (e: any) {
      return NextResponse.json(
        { error: "FastAPI parse response parse error", detail: String(e?.message ?? e) },
        { status: 502 }
      );
    }

    const debugResp = await fetch(`${baseUrl}/debug`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_input: input, parsed }),
    });

    const debugText = await debugResp.text();
    if (!debugResp.ok) {
      return NextResponse.json(
        { error: "FastAPI debug error", detail: debugText },
        { status: 502 }
      );
    }

    let debugJson: FastApiResponse;
    try {
      debugJson = JSON.parse(debugText) as FastApiResponse;
    } catch (e: any) {
      return NextResponse.json(
        { error: "FastAPI debug response parse error", detail: String(e?.message ?? e) },
        { status: 502 }
      );
    }

    // 事务从此处开始：在推理结果已成功返回后再写库，避免长事务锁表。
    // 写入包括：session（必要时创建）、user message、assistant message、debug_result。
    // 若任一步骤失败，Prisma 会自动回滚，确保不会出现半成品数据。
    // 事务成功后再统一更新时间戳，保证会话列表排序稳定。
    const sessionId = await prisma.$transaction(async (tx) => {
      let sessionIdValue = sessionIdInput;

      if (sessionIdValue) {
        const existing = await tx.session.findUnique({
          where: { id: sessionIdValue },
          select: { id: true },
        });
        if (!existing) {
          await tx.session.create({ data: { id: sessionIdValue } });
        }
      } else {
        const created = await tx.session.create({ data: {} });
        sessionIdValue = created.id;
      }

      const language = pickFirstString(parsed, ["language", "lang"]) || "unknown";
      const codeSnippet = pickFirstString(parsed, [
        "code_snippet",
        "code",
        "snippet",
        "related_code",
      ]);

      await tx.message.create({
        data: {
          sessionId: sessionIdValue,
          role: "user",
          language,
          errorText: input,
          codeSnippet,
          assistantJson: { parsed },
        },
      });

      const assistantMessage = await tx.message.create({
        data: {
          sessionId: sessionIdValue,
          role: "assistant",
          language,
          errorText: input,
          codeSnippet,
          assistantJson: debugJson,
          rawModelOutput:
            typeof debugJson.raw_model_output === "string"
              ? debugJson.raw_model_output
              : debugText,
        },
      });

      await tx.debugResult.create({
        data: {
          messageId: assistantMessage.id,
          errorType: String(debugJson.error_type ?? ""),
          rootCause: toStringArray(debugJson.root_cause),
          fixSuggestions: toStringArray(debugJson.fix_suggestions),
          prevention: toStringArray(debugJson.prevention),
          rawModelOutput:
            typeof debugJson.raw_model_output === "string"
              ? debugJson.raw_model_output
              : debugText,
          modelName:
            typeof debugJson.model_name === "string"
              ? debugJson.model_name
              : null,
          promptVersion:
            typeof debugJson.prompt_version === "string"
              ? debugJson.prompt_version
              : null,
        },
      });

      await tx.session.update({
        where: { id: sessionIdValue },
        data: { updatedAt: new Date() },
      });

      return sessionIdValue;
    });

    const responsePayload = {
      error_type: String(debugJson.error_type ?? ""),
      root_cause: toStringArray(debugJson.root_cause),
      fix_suggestions: toStringArray(debugJson.fix_suggestions),
      prevention: toStringArray(debugJson.prevention),
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: { "X-Session-Id": sessionId },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Next API error", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
