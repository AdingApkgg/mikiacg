"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/lib/toast-with-sound";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { authClient } from "@/lib/auth-client";
import { EmailCodeInput } from "@/components/ui/email-code-input";
import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { UnifiedCaptcha, type CaptchaType } from "@/components/ui/unified-captcha";
import { useSiteConfig } from "@/contexts/site-config";

function getReferralCode(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/(?:^|;\s*)ref_code=([^;]*)/);
  return match?.[1] || undefined;
}

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteConfig = useSiteConfig();
  const [referralCode, setReferralCode] = useState<string | undefined>();

  useEffect(() => {
    const fromUrl = searchParams.get("ref") || undefined;
    const fromCookie = getReferralCode();
    setReferralCode(fromUrl || fromCookie);
  }, [searchParams]);
  const [isLoading, setIsLoading] = useState(false);

  const turnstileSiteKey = siteConfig?.turnstileSiteKey;
  const rawCaptchaType = (siteConfig?.captchaRegister as CaptchaType) || "none";
  const captchaType = rawCaptchaType === "turnstile" && !turnstileSiteKey ? "math" : rawCaptchaType;

  const [captchaKey, setCaptchaKey] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");

  const registerSchema = z.object({
    email: z.string().email("请输入有效的邮箱地址"),
    username: z.string().min(3, "用户名至少3个字符").max(20, "用户名最多20个字符").regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
    password: z.string().min(6, "密码至少6个字符"),
    confirmPassword: z.string(),
    emailCode: z.string().length(6, "请输入6位验证码"),
    captcha: captchaType === "math" ? z.string().min(1, "请输入计算结果") : z.string().optional(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });

  type RegisterFormValues = z.infer<typeof registerSchema>;

  const registerMutation = trpc.user.register.useMutation({
    onError: (error) => {
      toast.error("注册失败", { description: error.message });
    },
  });

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      emailCode: "",
      captcha: "",
    },
  });

  const email = form.watch("email");

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  async function onSubmit(data: RegisterFormValues) {
    setIsLoading(true);
    try {
      // 验证验证码
      if (captchaType !== "none") {
        const captchaRes = await fetch("/api/captcha", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            captchaType === "turnstile"
              ? { type: "turnstile", turnstileToken }
              : { captcha: data.captcha, type: "math" }
          ),
        });
        const captchaResult = await captchaRes.json();

        if (!captchaResult.valid) {
          toast.error(captchaResult.message || "验证失败");
          setCaptchaKey((k) => k + 1);
          setTurnstileToken("");
          form.setValue("captcha", "");
          setIsLoading(false);
          return;
        }
      }

      // 验证邮箱验证码
      const verifyRes = await fetch("/api/email/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: data.email, 
          code: data.emailCode,
          type: "REGISTER",
        }),
      });
      const verifyResult = await verifyRes.json();

      if (!verifyResult.valid) {
        toast.error(verifyResult.message || "验证码错误");
        setIsLoading(false);
        return;
      }

      await registerMutation.mutateAsync({
        email: data.email,
        username: data.username,
        password: data.password,
        referralCode,
      });

      const { error } = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      });

      if (error) {
        toast.success("注册成功", { description: "请手动登录您的账户" });
        router.push("/login");
      } else {
        toast.success("注册成功", { description: "已自动登录" });
        router.push("/");
        router.refresh();
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="container flex items-center justify-center min-h-[calc(100vh-200px)] py-8">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div>
              <CardTitle className="text-2xl">注册</CardTitle>
              <CardDescription>创建一个新账户</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="your@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input placeholder="username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="******" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>确认密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="******" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emailCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱验证码</FormLabel>
                    <FormControl>
                      <EmailCodeInput
                        email={email}
                        type="REGISTER"
                        value={field.value}
                        onChange={field.onChange}
                        error={form.formState.errors.emailCode?.message}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              {captchaType === "math" && (
                <FormField
                  control={form.control}
                  name="captcha"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>验证码</FormLabel>
                      <FormControl>
                        <UnifiedCaptcha
                          type="math"
                          mathValue={field.value || ""}
                          onMathChange={field.onChange}
                          mathError={form.formState.errors.captcha?.message}
                          refreshKey={captchaKey}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}
              {captchaType === "turnstile" && (
                <div className="space-y-2">
                  <UnifiedCaptcha
                    type="turnstile"
                    turnstileSiteKey={turnstileSiteKey}
                    onTurnstileVerify={handleTurnstileVerify}
                    onTurnstileExpire={handleTurnstileExpire}
                    refreshKey={captchaKey}
                  />
                </div>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || (captchaType === "turnstile" && !turnstileToken)}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                注册
              </Button>
            </form>
          </Form>

          <SocialLoginButtons callbackURL="/" />

          <div className="mt-6 text-center text-sm text-muted-foreground">
            已有账户？{" "}
            <Link href="/login" className="text-primary hover:underline">
              立即登录
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
