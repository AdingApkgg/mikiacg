import type { Metadata } from "next";
import FeedbackClient from "./client";

export const metadata: Metadata = {
  title: "反馈与求助",
  description: "提交 BUG、求资源或意见建议",
};

export default function FeedbackPage() {
  return <FeedbackClient />;
}
