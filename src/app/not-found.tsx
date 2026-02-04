import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-lg">
        {/* 错误信息 */}
        <div className="space-y-2">
          <h1 className="text-8xl font-bold text-primary">404</h1>
          <h2 className="text-xl font-medium">页面不存在</h2>
          <p className="text-muted-foreground">
            你访问的页面可能已被删除、移动或从未存在过
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-center">
          <Button asChild>
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              返回首页
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
