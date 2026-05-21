import { prisma } from "@/lib/prisma";
import { redis, REDIS_AVAILABLE } from "@/lib/redis";
import { getPublicSiteConfig } from "@/lib/site-config";

/**
 * 工单更新邮件通知
 *
 * 30 分钟内同一工单只发一封,避免管理员快速来回回复轰炸用户邮箱。
 * 用户必须有邮箱(可不强求 emailVerified,因为登录时已校验)。
 */

const COOLDOWN_SECONDS = 30 * 60;

type EmailKind = "staff_reply" | "status_change" | "merged";

interface SendTicketUpdateEmailParams {
  userId: string;
  ticketId: string;
  ticketTitle: string;
  kind: EmailKind;
  /** 状态变更时填入新状态(中文) */
  statusLabel?: string;
  /** 管理员回复时,简短摘要(取前 200 字) */
  replyPreview?: string;
}

const KIND_SUBJECT: Record<EmailKind, string> = {
  staff_reply: "工单有新回复",
  status_change: "工单状态变更",
  merged: "工单已合并",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendTicketUpdateEmail(params: SendTicketUpdateEmailParams): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { email: true, nickname: true, username: true },
    });
    if (!user?.email) return;

    // 限流:同一工单 30 分钟内只发一封
    if (REDIS_AVAILABLE) {
      try {
        const key = `ticket_email:${params.ticketId}:${params.userId}`;
        const result = await redis.set(key, "1", "EX", COOLDOWN_SECONDS, "NX");
        if (result !== "OK") return;
      } catch {
        // 限流失败不阻断主流程,继续发送
      }
    }

    const config = await getPublicSiteConfig();
    const siteName = config.siteName || "ACGN Site";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const link = `${appUrl}/feedback/${params.ticketId}`;
    const displayName = user.nickname || user.username || "用户";

    const heading = KIND_SUBJECT[params.kind];
    let body = "";
    if (params.kind === "staff_reply") {
      body = `<p>管理员回复了你的工单。</p>`;
      if (params.replyPreview) {
        body += `<blockquote style="margin:8px 0;padding:8px 12px;border-left:3px solid #ccc;color:#555;background:#f7f7f7;">${escapeHtml(
          params.replyPreview,
        )}</blockquote>`;
      }
    } else if (params.kind === "status_change") {
      body = `<p>工单状态已更新${
        params.statusLabel ? ` 为 <strong>${escapeHtml(params.statusLabel)}</strong>` : ""
      }。</p>`;
    } else if (params.kind === "merged") {
      body = `<p>你的工单已被合并到其他工单,请查看新工单的处理进度。</p>`;
    }

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#222;">
        <h2 style="margin:0 0 16px;font-size:18px;">${escapeHtml(heading)}</h2>
        <p style="margin:0 0 8px;">你好,${escapeHtml(displayName)}:</p>
        <p style="margin:0 0 12px;color:#333;">工单 <strong>${escapeHtml(params.ticketTitle)}</strong></p>
        ${body}
        <p style="margin:24px 0;">
          <a href="${link}" style="display:inline-block;padding:10px 20px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px;">
            查看工单
          </a>
        </p>
        <p style="margin:32px 0 0;color:#999;font-size:12px;">
          本邮件由 ${escapeHtml(siteName)} 自动发出,无需回复。如需取消通知,请到账号设置中关闭邮件提醒。
        </p>
      </div>
    `;

    const subject = `【${siteName}】${heading} - ${params.ticketTitle.slice(0, 60)}`;

    const { sendMail } = await import("@/lib/email");
    await sendMail(user.email, subject, html, siteName);
  } catch (err) {
    // 邮件失败不应影响工单业务,只记日志
    console.error("[ticket-email] send failed", err);
  }
}
