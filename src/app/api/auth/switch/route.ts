import { NextResponse } from "next/server";

/**
 * 账号切换：Better Auth 下需通过重新登录目标账号实现，暂不支持无密码切换。
 * 若需多账号，请先登出再使用目标账号登录。
 */
export async function POST() {
  return NextResponse.json(
    { error: "账号切换暂不支持，请使用目标账号重新登录" },
    { status: 501 }
  );
}
