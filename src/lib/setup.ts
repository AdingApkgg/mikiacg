import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { memGetOrSet, memDelete } from "@/lib/memory-cache";

export const isSetupComplete = cache(async (): Promise<boolean> => {
  try {
    return await memGetOrSet(
      "setup:complete",
      async () => {
        const owner = await prisma.user.findFirst({
          where: { role: "OWNER" },
          select: { id: true },
        });
        return !!owner;
      },
      300 * 1000,
    );
  } catch (error) {
    console.error("[setup] Failed to check setup status", error);
    throw error;
  }
});

export function invalidateSetupCache() {
  memDelete("setup:complete");
}
