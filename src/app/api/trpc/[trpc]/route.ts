import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/trpc";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
    // 与客户端 httpBatchLink 的 methodOverride: "POST" 配套：
    // 允许 query 通过 POST 调用，避免批量操作（如正则编辑）的大数组撑爆 URL 长度
    allowMethodOverride: true,
  });

export { handler as GET, handler as POST };
