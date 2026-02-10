import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username, customSession } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  trustedOrigins: [
    process.env.BETTER_AUTH_BASE_URL ?? "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL ?? "",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.*:3000",
    "http://10.*:3000",
  ].filter(Boolean),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 6,
    password: {
      hash: (password) => bcrypt.hash(password, 10),
      verify: (data) => bcrypt.compare(data.password, data.hash),
    },
  },
  plugins: [
    username({
      minUsernameLength: 1,
      maxUsernameLength: 64,
    }),
    customSession(async ({ user, session }) => {
      if (!user?.id) return { user, session };
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { role: true, canUpload: true, adsEnabled: true },
      });
      if (!dbUser) return { user, session };
      const canUpload =
        dbUser.role === "ADMIN" ||
        dbUser.role === "OWNER" ||
        dbUser.canUpload === true;
      return {
        session,
        user: {
          ...user,
          role: dbUser.role,
          canUpload,
          adsEnabled: dbUser.adsEnabled ?? true,
        },
      };
    }),
  ],
  user: {
    modelName: "user",
    fields: {
      name: "nickname",
      image: "avatar",
    },
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
      canUpload: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      adsEnabled: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
    },
  },
  session: {
    modelName: "session",
    fields: {
      token: "sessionToken",
      expiresAt: "expires",
    },
    expiresIn: 60 * 60 * 24 * 30, // 30 天
    updateAge: 60 * 60 * 24, // 1 天更新一次
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 分钟
    },
  },
  account: {
    modelName: "account",
    fields: {
      providerId: "provider",
      accountId: "providerAccountId",
      accessToken: "access_token",
      refreshToken: "refresh_token",
    },
  },
  verification: {
    modelName: "verification",
  },
  pages: {
    signIn: "/login",
  },
  advanced: {
    database: {
      generateId: false, // 让数据库序列生成用户 ID（自增数字），其他表仍由 Prisma @default(cuid()) 处理
    },
  },
});

/** 应用内使用的 Session 类型（与 next-auth 兼容的 shape） */
export interface AppSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role?: "USER" | "ADMIN" | "OWNER";
    canUpload?: boolean;
    /** 是否加载广告；false 表示站长/管理员已关闭该用户的广告 */
    adsEnabled?: boolean;
  };
  /** Better Auth 使用 session.token；兼容旧逻辑用 jti 表示同一值 */
  jti?: string;
  session: { id: string; token: string; expiresAt: Date };
}

/** 服务端获取当前 session（用于 tRPC、API 等） */
export async function getSession(): Promise<AppSession | null> {
  const { headers } = await import("next/headers");
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) return null;
  const { user, session } = result as { user: { id: string; email: string; name?: string | null; image?: string | null }; session: { id: string; token: string; expiresAt: Date } };
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, canUpload: true, adsEnabled: true, nickname: true, username: true, avatar: true },
  });
  const canUpload =
    dbUser?.role === "ADMIN" ||
    dbUser?.role === "OWNER" ||
    dbUser?.canUpload === true;
  const sessionPayload = session
    ? { id: session.id, token: session.token, expiresAt: session.expiresAt }
    : { id: "", token: "", expiresAt: new Date(0) };
  return {
    jti: session?.token ?? undefined,
    user: {
      id: user.id,
      email: user.email,
      name: (dbUser?.nickname || dbUser?.username) ?? user.name ?? null,
      image: dbUser?.avatar ?? user.image ?? null,
      role: (dbUser?.role as "USER" | "ADMIN" | "OWNER") ?? "USER",
      canUpload,
      adsEnabled: dbUser?.adsEnabled ?? true,
    },
    session: sessionPayload,
  };
}
