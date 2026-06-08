# MoeStream — GitHub Copilot 指引

本项目是 ACGN 流媒体平台，完整约定见项目根目录 `CLAUDE.md`。以下为 Copilot 补全时的关键提示。

## 核心约定

- **语言**: TypeScript strict 模式，界面文案与注释使用**中文**
- **导入路径**: 使用 `@/` 别名（映射 `src/*`），同目录内可用 `./`
- **组件**: 函数组件 + 命名导出（`export function ComponentName()`）
- **样式**: Tailwind CSS v4 类名，条件合并用 `cn()`（`@/lib/utils`）
- **图标**: `lucide-react`
- **日期**: `dayjs`（不要用 `date-fns`）
- **Toast**: `sonner`（`import { toast } from "sonner"`）

## 数据层

- **tRPC**: `trpc.xxx.useQuery()` / `trpc.xxx.useMutation()`（客户端从 `@/lib/trpc` 导入）
- **Prisma**: 查询用 `select` 限制字段，从 `@/lib/prisma` 导入
- **认证**: `useSession()`（`@/lib/auth-client`，非 next-auth）
- **表单**: `react-hook-form` + `zod` 验证
- **搜索**: 全文搜索走 Meilisearch（`@/lib/meilisearch`），写入后用 `@/lib/search-sync` 增量同步索引
- **富文本**: 编辑用 Tiptap（`@/components/editor`），渲染用 react-markdown（`@/components/ui/markdown`），持久化为 Markdown

## 文件命名

- 文件/文件夹: **kebab-case**（`cover-input.tsx`）
- 组件导出: **PascalCase**（`CoverInput`）
- tRPC 路由: **camelCase** + `Router` 后缀（`videoRouter`）
