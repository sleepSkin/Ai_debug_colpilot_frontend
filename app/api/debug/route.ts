// 职责说明：调度推理调用并在事务中落库，同时返回结构化调试结果。
// 调用链：UI -> /api/debug -> FastAPI /debug -> Prisma $transaction -> PostgreSQL

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type DebugRequestBody = {
  language?: unknown;
  errorText?: unknown;
  codeSnippet?: unknown;
  session_id?: unknown;
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
    const language = String(body?.language ?? "").trim();
    const errorText = String(body?.errorText ?? "").trim();
    const codeSnippet = String(body?.codeSnippet ?? "").trim();
    const sessionIdInput =
      typeof body?.session_id === "string" ? body.session_id.trim() : "";

    if (!language || !errorText || !codeSnippet) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const fastapiResp = await fetch(
      `${fastapiBaseUrl.replace(/\/$/, "")}/debug`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, errorText, codeSnippet }),
      }
    );

    const fastapiText = await fastapiResp.text();
    if (!fastapiResp.ok) {
      return NextResponse.json(
        { error: "FastAPI error", detail: fastapiText },
        { status: 502 }
      );
    }

    let fastapiJson: FastApiResponse;
    try {
      fastapiJson = JSON.parse(fastapiText) as FastApiResponse;
    } catch (e: any) {
      return NextResponse.json(
        { error: "FastAPI response parse error", detail: String(e?.message ?? e) },
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

      await tx.message.create({
        data: {
          sessionId: sessionIdValue,
          role: "user",
          language,
          errorText,
          codeSnippet,
        },
      });

      const assistantMessage = await tx.message.create({
        data: {
          sessionId: sessionIdValue,
          role: "assistant",
          language,
          errorText,
          codeSnippet,
          assistantJson: fastapiJson,
          rawModelOutput:
            typeof fastapiJson.raw_model_output === "string"
              ? fastapiJson.raw_model_output
              : null,
        },
      });

      await tx.debugResult.create({
        data: {
          messageId: assistantMessage.id,
          errorType: String(fastapiJson.error_type ?? ""),
          rootCause: toStringArray(fastapiJson.root_cause),
          fixSuggestions: toStringArray(fastapiJson.fix_suggestions),
          prevention: toStringArray(fastapiJson.prevention),
          rawModelOutput:
            typeof fastapiJson.raw_model_output === "string"
              ? fastapiJson.raw_model_output
              : null,
          modelName:
            typeof fastapiJson.model_name === "string"
              ? fastapiJson.model_name
              : null,
          promptVersion:
            typeof fastapiJson.prompt_version === "string"
              ? fastapiJson.prompt_version
              : null,
        },
      });

      await tx.session.update({
        where: { id: sessionIdValue },
        data: { updatedAt: new Date() },
      });

      return sessionIdValue;
    });

    return NextResponse.json(fastapiJson, {
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
