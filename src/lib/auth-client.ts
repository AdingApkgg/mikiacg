"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_APP_URL,
  plugins: [usernameClient()],
});

/**
 * 兼容原 next-auth useSession 的 hook：返回 { data, status }，data 含 user（含 role/canUpload 需服务端）
 * 前端 session 只有基础 user 字段；role/canUpload 在服务端 getSession() 中补全。
 */
export function useSession() {
  const { data, error, isPending, refetch } = authClient.useSession();
  const status = isPending ? "loading" : error || !data?.user ? "unauthenticated" : "authenticated";
  const role = (data?.user as { role?: string } | undefined)?.role as "USER" | "ADMIN" | "OWNER" | undefined;
  const rawCanUpload = (data?.user as { canUpload?: boolean } | undefined)?.canUpload;
  // ADMIN/OWNER 始终拥有投稿权限，与服务端 getSession() 逻辑一致
  const canUpload = role === "ADMIN" || role === "OWNER" || rawCanUpload === true;

  const session = data?.user
    ? {
        user: {
          id: data.user.id,
          email: data.user.email ?? "",
          name: data.user.name ?? null,
          image: data.user.image ?? null,
          role,
          canUpload,
        },
        expires: data.session?.expiresAt?.toString?.() ?? "",
      }
    : null;
  return { data: session, status, update: refetch };
}
