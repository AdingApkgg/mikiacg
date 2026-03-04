import { z } from "zod";
import { router, publicProcedure } from "../trpc";

export const stickerRouter = router({
  listPacks: publicProcedure.query(async ({ ctx }) => {
    const packs = await ctx.prisma.stickerPack.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        stickers: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    return packs;
  }),

  listStickers: publicProcedure
    .input(z.object({ packId: z.string() }))
    .query(async ({ ctx, input }) => {
      const stickers = await ctx.prisma.sticker.findMany({
        where: { packId: input.packId },
        orderBy: { sortOrder: "asc" },
      });
      return stickers;
    }),
});
