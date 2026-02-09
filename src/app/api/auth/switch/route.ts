import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";

/**
 * HMAC-SHA256 签名 cookie value（与 better-call 的 signCookieValue 一致）
 */
async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  const base64Sig = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${value}.${base64Sig}`);
}

/**
 * 账号切换：验证 JWT 切换令牌，为目标用户创建新的 Better Auth session。
 */
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: "缺少切换令牌" }, { status: 400 });
    }

    // 1. 验证 JWT 切换令牌
    const secret = new TextEncoder().encode(
      process.env.BETTER_AUTH_SECRET || "fallback-secret"
    );
    let userId: string;
    try {
      const { payload } = await jwtVerify(token, secret);
      if (payload.type !== "switch" || !payload.sub) {
        return NextResponse.json({ error: "无效的令牌" }, { status: 401 });
      }
      userId = payload.sub;
    } catch {
      return NextResponse.json(
        { error: "令牌已过期或无效" },
        { status: 401 }
      );
    }

    // 2. 查找目标用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        username: true,
        avatar: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 3. 使用 Better Auth 内部 API 创建 session
    const ctx = await auth.$context;
    const session = await ctx.internalAdapter.createSession(
      user.id,
      false // dontRememberMe = false → 记住登录
    );

    if (!session) {
      return NextResponse.json(
        { error: "创建会话失败" },
        { status: 500 }
      );
    }

    // 4. 构建 response
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.nickname || user.username,
        email: user.email,
        image: user.avatar,
      },
    });

    // 5. 设置 session cookie（与 Better Auth 的 setSessionCookie 行为一致）
    const cookieName = ctx.authCookies.sessionToken.name;
    const cookieAttrs = ctx.authCookies.sessionToken.attributes;
    const signedValue = await signCookieValue(session.token, ctx.secret);

    const isSecure = cookieAttrs.secure ?? false;
    const baseCookieParts = [
      `Path=${cookieAttrs.path ?? "/"}`,
      cookieAttrs.httpOnly !== false ? "HttpOnly" : "",
      isSecure ? "Secure" : "",
      `SameSite=${cookieAttrs.sameSite ?? "Lax"}`,
    ].filter(Boolean);

    // 设置新的 session_token cookie
    response.headers.append(
      "Set-Cookie",
      [
        `${cookieName}=${signedValue}`,
        `Max-Age=${ctx.sessionConfig.expiresIn}`,
        ...baseCookieParts,
      ].join("; ")
    );

    // 清除旧的 session_data 缓存 cookie（强制 Better Auth 重新从数据库加载 session）
    const sessionDataName = ctx.authCookies.sessionData.name;
    response.headers.append(
      "Set-Cookie",
      [
        `${sessionDataName}=`,
        `Max-Age=0`,
        ...baseCookieParts,
      ].join("; ")
    );

    // 清除可能分块的 session_data cookie（Better Auth 对大数据会分块存储）
    for (let i = 0; i < 5; i++) {
      response.headers.append(
        "Set-Cookie",
        [
          `${sessionDataName}.${i}=`,
          `Max-Age=0`,
          ...baseCookieParts,
        ].join("; ")
      );
    }

    return response;
  } catch (error) {
    console.error("Account switch error:", error);
    return NextResponse.json(
      { error: "切换失败，请重试" },
      { status: 500 }
    );
  }
}
