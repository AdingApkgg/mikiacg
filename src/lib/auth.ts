import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const loginSchema = z.object({
  identifier: z.string().min(1), // 可以是邮箱或用户名
  password: z.string().min(6),
});

// Credentials provider
const credentialsProvider = Credentials({
  name: "credentials",
  credentials: {
    identifier: { label: "邮箱或用户名", type: "text" },
    password: { label: "密码", type: "password" },
  },
  async authorize(credentials) {
    const parsed = loginSchema.safeParse(credentials);
    if (!parsed.success) return null;

    const { identifier, password } = parsed.data;

    // 支持邮箱或用户名登录
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier },
        ],
      },
    });

    if (!user || !user.password) return null;

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.nickname || user.username,
      image: user.avatar,
    };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 天
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [credentialsProvider],
  callbacks: {
    async session({ session, token }) {
      // 检查会话是否被撤销
      if ((token as { isRevoked?: boolean }).isRevoked) {
        // 会话已被撤销，清空用户信息
        session.user = null as unknown as typeof session.user;
        return session;
      }
      
      if (token.sub && session.user) {
        session.user.id = token.sub;
        session.jti = token.jti as string;
        
        // 从数据库获取最新的用户信息
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { nickname: true, avatar: true, username: true, role: true },
        });
        
        if (dbUser) {
          session.user.name = dbUser.nickname || dbUser.username;
          session.user.image = dbUser.avatar;
          session.user.role = dbUser.role;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        
        // 首次登录时生成 jti（JWT ID）
        if (!token.jti) {
          token.jti = nanoid(16);
        }
      }
      
      // 检查会话是否被撤销
      if (token.jti && token.sub) {
        const loginSession = await prisma.loginSession.findUnique({
          where: { jti: token.jti as string },
          select: { isRevoked: true },
        });
        
        if (loginSession?.isRevoked) {
          // 会话已被撤销，返回空 token 使其失效
          return { ...token, isRevoked: true };
        }
      }
      
      return token;
    },
  },
});

// 扩展 NextAuth 类型
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: "USER" | "ADMIN" | "OWNER";
    };
    jti?: string; // JWT ID，用于会话管理
  }
}
