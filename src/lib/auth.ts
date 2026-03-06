import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username, customSession } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { hash, compare } from "@/lib/bcrypt-wasm";
import { getOrSet, deleteCache } from "@/lib/redis";

interface OAuthProviderCredentials {
  clientId?: string | null;
  clientSecret?: string | null;
}

interface OAuthConfig {
  google?: OAuthProviderCredentials;
  github?: OAuthProviderCredentials;
  discord?: OAuthProviderCredentials;
  apple?: OAuthProviderCredentials;
  twitter?: OAuthProviderCredentials;
  facebook?: OAuthProviderCredentials;
  microsoft?: OAuthProviderCredentials;
  twitch?: OAuthProviderCredentials;
  spotify?: OAuthProviderCredentials;
  linkedin?: OAuthProviderCredentials;
  gitlab?: OAuthProviderCredentials;
  reddit?: OAuthProviderCredentials;
}

const OAUTH_PROVIDER_KEYS = [
  "Google", "Github", "Discord", "Apple", "Twitter", "Facebook",
  "Microsoft", "Twitch", "Spotify", "Linkedin", "Gitlab", "Reddit",
] as const;

interface OAuthAndSiteConfig {
  oauth: OAuthConfig;
  siteUrl: string | null;
}

async function getOAuthAndSiteConfig(): Promise<OAuthAndSiteConfig> {
  try {
    return await getOrSet(
      "oauth:config",
      async () => {
        const select: Record<string, true> = { siteUrl: true };
        for (const k of OAUTH_PROVIDER_KEYS) {
          select[`oauth${k}ClientId`] = true;
          select[`oauth${k}ClientSecret`] = true;
        }
        const config = await prisma.siteConfig.findUnique({
          where: { id: "default" },
          select,
        }) as Record<string, string | null> | null;
        if (!config) return { oauth: {}, siteUrl: null };
        const oauth: OAuthConfig = {};
        for (const key of OAUTH_PROVIDER_KEYS) {
          const id = config[`oauth${key}ClientId`];
          const secret = config[`oauth${key}ClientSecret`];
          if (id && secret) {
            (oauth as Record<string, OAuthProviderCredentials>)[key.toLowerCase()] = { clientId: id, clientSecret: secret };
          }
        }
        return { oauth, siteUrl: config.siteUrl || null };
      },
      300
    );
  } catch {
    return { oauth: {}, siteUrl: null };
  }
}

function buildSocialProviders(cfg: OAuthConfig) {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};
  for (const [name, creds] of Object.entries(cfg)) {
    if (creds?.clientId && creds?.clientSecret) {
      providers[name] = { clientId: creds.clientId, clientSecret: creds.clientSecret };
    }
  }
  return providers;
}

function createAuthInstance(oauthConfig: OAuthConfig, siteUrl?: string) {
  const baseURL = siteUrl || process.env.BETTER_AUTH_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return betterAuth({
    baseURL,
    trustedOrigins: [
      baseURL,
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
        hash: (password) => hash(password, 10),
        verify: (data) => compare(data.password, data.hash),
      },
    },
    socialProviders: buildSocialProviders(oauthConfig),
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.username) {
              const prefix = (user.email?.split("@")[0] || "user").replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 14);
              const suffix = Math.random().toString(36).slice(2, 6);
              return { data: { ...user, username: `${prefix}_${suffix}` } };
            }
            return { data: user };
          },
        },
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
        idToken: "id_token",
      },
      accountLinking: {
        enabled: true,
        trustedProviders: [
        "google", "github", "discord", "apple", "twitter", "facebook",
        "microsoft", "twitch", "spotify", "linkedin", "gitlab", "reddit",
      ],
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
        generateId: false,
      },
    },
  });
}

// 静态 auth 实例用于不涉及 OAuth 的操作（session 读取等）
export const auth = createAuthInstance({});

// 动态 auth 实例缓存（含 DB 中的 OAuth 配置）
let _cachedAuth: ReturnType<typeof createAuthInstance> | null = null;
let _cachedConfigHash = "";

/**
 * 获取包含最新 OAuth 配置的 auth 实例。
 * 配置通过 Redis 缓存 5 分钟，admin 保存时主动失效。
 */
export async function getAuthWithOAuth() {
  const { oauth, siteUrl } = await getOAuthAndSiteConfig();
  const configHash = JSON.stringify({ oauth, siteUrl });

  if (_cachedAuth && _cachedConfigHash === configHash) {
    return _cachedAuth;
  }

  _cachedAuth = createAuthInstance(oauth, siteUrl || undefined);
  _cachedConfigHash = configHash;
  return _cachedAuth;
}

/** admin 保存 OAuth 配置后调用，清除缓存强制下次请求重建实例 */
export async function invalidateOAuthConfig() {
  _cachedAuth = null;
  _cachedConfigHash = "";
  await deleteCache("oauth:config");
}

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
export async function getSession(req?: Request): Promise<AppSession | null> {
  let reqHeaders: Headers;
  if (req) {
    reqHeaders = req.headers;
  } else {
    const { headers } = await import("next/headers");
    reqHeaders = await headers();
  }
  const authInstance = await getAuthWithOAuth();
  const result = await authInstance.api.getSession({ headers: reqHeaders });
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
