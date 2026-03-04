import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const siteConfig = await prisma.siteConfig.findUnique({
    where: { id: "default" },
    select: { referralEnabled: true },
  }).catch(() => null);

  if (!siteConfig?.referralEnabled) {
    return NextResponse.redirect(siteUrl);
  }

  const link = await prisma.referralLink.findUnique({
    where: { code },
    select: { id: true, userId: true, isActive: true, targetUrl: true },
  });

  if (!link || !link.isActive) {
    return NextResponse.redirect(siteUrl);
  }

  // Atomically increment click count
  await prisma.referralLink.update({
    where: { id: link.id },
    data: { clicks: { increment: 1 } },
  });

  // Track daily clicks per user in Redis
  const today = new Date().toISOString().slice(0, 10);
  const dailyClickKey = `ref_daily_clicks:${link.userId}:${today}`;
  try {
    const pipe = redis.pipeline();
    pipe.incr(dailyClickKey);
    pipe.expire(dailyClickKey, 86400 * 2);
    await pipe.exec();
  } catch {
    // Redis down — daily click stat will be inaccurate, non-critical
  }

  const targetUrl = link.targetUrl || siteUrl;
  const response = NextResponse.redirect(targetUrl);

  response.cookies.set("ref_code", code, {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
    sameSite: "lax",
    httpOnly: false,
  });

  return response;
}
