// 职责说明：提供会话列表查询接口，统一返回 snake_case 字段。
// 调用链：UI -> /api/sessions -> Prisma Client -> PostgreSQL

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * 说明：查询会话列表，按 updatedAt 倒序返回。
 * 输入：URL 查询参数 limit（可选，默认 20）。
 * 输出：会话列表（snake_case 字段）。
 * 异常：数据库查询失败返回 500。
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limitParsed = limitRaw ? Number(limitRaw) : 20;
    const limit =
      Number.isFinite(limitParsed) && limitParsed > 0
        ? Math.min(limitParsed, 100)
        : 20;

    const sessions = await prisma.session.findMany({
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        title: true,
      },
    });

    // UI 若使用 camelCase，可在此处统一转为 snake_case 以保持对外一致性。
    const payload = sessions.map((session) => ({
      id: session.id,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
      user_id: session.userId,
      title: session.title,
    }));

    return NextResponse.json({ sessions: payload }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Next API error", detail: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
