/**
 * 创建单个用户（邮箱+密码，Better Auth 兼容）
 * 用法: pnpm tsx scripts/create-user.ts <email> <username> <nickname> <password>
 * 示例: pnpm tsx scripts/create-user.ts user@example.com asuna Asuna mypassword123
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";

if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: ".env.production" });
} else {
  dotenv.config({ path: ".env.development" });
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function usage() {
  console.error("用法: pnpm tsx scripts/create-user.ts <email> <username> <nickname> <password>");
  console.error("示例: pnpm tsx scripts/create-user.ts user@example.com asuna Asuna mypassword123");
}

async function main() {
  const [emailArg, usernameArg, nicknameArg, passwordArg] = process.argv.slice(2);
  if (!emailArg || !usernameArg || !nicknameArg || !passwordArg) {
    usage();
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const username = usernameArg.toLowerCase().trim();
  const nickname = nicknameArg.trim();
  const password = passwordArg;

  if (password.length < 6) {
    console.error("密码至少 6 位");
    process.exit(1);
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true, email: true, username: true },
  });
  if (existing) {
    console.error(`用户已存在: ${existing.email} / @${existing.username} (id: ${existing.id})`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      username,
      displayUsername: nickname,
      nickname,
      role: "USER",
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      type: "credential",
      provider: "credential",
      providerAccountId: user.id,
      password: hashedPassword,
    },
  });

  console.log("用户已创建:");
  console.log("  ID:", user.id);
  console.log("  邮箱:", user.email);
  console.log("  用户名:", user.username);
  console.log("  昵称:", user.nickname);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
