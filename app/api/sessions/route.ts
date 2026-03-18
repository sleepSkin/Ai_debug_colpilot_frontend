import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * 作用/业务含义：
 * 查询会话列表，供会话页面或调试历史入口展示。
 *
 * 入参说明：
 * - req.query.limit: 可选，默认 20，最大 100。
 *
 * 返回值结构：
 * - 成功：{ sessions: Array<{ id, created_at, updated_at, user_id, title, last_status }> }
 * - 失败：{ error, detail }
 *
 * 安全与权限：
 * - 当前未接入用户鉴权，后续应按 userId 做数据隔离过滤。
 *
 * 关键边界条件：
 * - limit 非法时回退默认值 20。
 * - 数据库异常时返回 500，避免泄漏堆栈细节。
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limitParsed = limitRaw ? Number(limitRaw) : 20;
    const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 100) : 20;

    const sessions = await prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        stepAttempts: {
          orderBy: { roundIndex: "desc" },
          take: 1,
          select: { roundIndex: true },
        },
        messages: {
          where: { status: "failed" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { errorMessage: true },
        },
      },
    });

    const payload = sessions.map((session) => {
      const fallbackRoundIndex = session.stepAttempts[0]?.roundIndex ?? 0;
      const lastRoundIndex =
        session.lastRoundIndex && session.lastRoundIndex > 0
          ? session.lastRoundIndex
          : fallbackRoundIndex;

      const fallbackErrorMessage = session.messages[0]?.errorMessage ?? null;
      const lastErrorMessage = session.lastErrorMessage ?? fallbackErrorMessage;

      return {
        id: session.id,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
        user_id: session.userId,
        title: session.title,
        last_status: session.lastStatus,
        last_round_index: lastRoundIndex,
        last_error_message: lastErrorMessage,
      };
    });

    return NextResponse.json({ sessions: payload }, { status: 200 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: "Next API error", detail: String((e as Error)?.message ?? e) },
      { status: 500 }
    );
  }
}
