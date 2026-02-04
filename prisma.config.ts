import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

// 根据 NODE_ENV 加载对应的环境文件
const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
config({ path: path.join(__dirname, envFile) });

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
