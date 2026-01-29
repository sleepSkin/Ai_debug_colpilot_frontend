// 职责说明：提供单个会话详情与消息记录查询接口。
// 调用链：UI -> /api/sessions/[session_id] -> Prisma Client -> PostgreSQL

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    session_id?: string;
  };
};

/**
 * 说明：查询指定会话的元信息与消息详情，消息按 createdAt 升序返回。
 * 输入：路径参数 session_id。
 * 输出：session + messages（snake_case 字段，assistant 附带 debug_result）。
 * 异常：会话不存在返回 404；数据库查询失败返回 500。
 */
export async function GET(req: Request, context: RouteContext) {
  try {
    const sessionId = context.params.session_id;
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          include: { debugResult: true },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    const sessionPayload = {
      id: session.id,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      user_id: session.userId,
      title: session.title,
    };

    const messagesPayload = session.messages.map((message) => ({
      id: message.id,
      session_id: message.sessionId,
      role: message.role,
      language: message.language,
      error_text: message.errorText,
      code_snippet: message.codeSnippet,
      assistant_json: message.assistantJson,
      raw_model_output: message.rawModelOutput,
      created_at: message.createdAt,
      debug_result: message.debugResult
        ? {
            message_id: message.debugResult.messageId,
            error_type: message.debugResult.errorType,
            root_cause: message.debugResult.rootCause,
            fix_suggestions: message.debugResult.fixSuggestions,
            prevention: message.debugResult.prevention,
            raw_model_output: message.debugResult.rawModelOutput,
            model_name: message.debugResult.modelName,
            prompt_version: message.debugResult.promptVersion,
            created_at: message.debugResult.createdAt,
          }
        : null,
    }));

    return NextResponse.json(
      { session: sessionPayload, messages: messagesPayload },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Next API error", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
