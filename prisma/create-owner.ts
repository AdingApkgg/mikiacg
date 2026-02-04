import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

// 站长用户配置 - 请修改以下信息
const OWNER_CONFIG = {
  email: "i@mikiacg.com",      // 修改为你的邮箱
  username: "mikiacg",               // 修改为你想要的用户名
  password: "12345678",         // 修改为你的密码（至少6位）
  nickname: "Miroacg",                // 显示昵称
};

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  console.log("Creating owner user...");

  try {
    // 检查是否已存在
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: OWNER_CONFIG.email },
          { username: OWNER_CONFIG.username },
        ],
      },
    });

    if (existing) {
      console.log(`User already exists: ${existing.email} (${existing.username})`);
      console.log(`Current role: ${existing.role}`);
      
      // 如果存在但不是 OWNER，升级为 OWNER
      if (existing.role !== "OWNER") {
        await prisma.user.update({
          where: { id: existing.id },
          data: { role: "OWNER" },
        });
        console.log("Upgraded to OWNER role!");
      }
      return;
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(OWNER_CONFIG.password, 12);

    // 创建站长用户
    const owner = await prisma.user.create({
      data: {
        email: OWNER_CONFIG.email,
        username: OWNER_CONFIG.username,
        password: hashedPassword,
        nickname: OWNER_CONFIG.nickname,
        role: "OWNER",
        emailVerified: new Date(), // 站长账号默认已验证
      },
    });

    console.log("Owner user created successfully!");
    console.log(`  Email: ${owner.email}`);
    console.log(`  Username: ${owner.username}`);
    console.log(`  Role: ${owner.role}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
