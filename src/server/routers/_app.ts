import { router } from "../trpc";
import { userRouter } from "./user";
import { videoRouter } from "./video";
import { gameRouter } from "./game";
import { tagRouter } from "./tag";
import { adminRouter } from "./admin";
import { commentRouter } from "./comment";
import { seriesRouter } from "./series";
import { siteRouter } from "./site";

export const appRouter = router({
  user: userRouter,
  video: videoRouter,
  game: gameRouter,
  tag: tagRouter,
  admin: adminRouter,
  comment: commentRouter,
  series: seriesRouter,
  site: siteRouter,
});

export type AppRouter = typeof appRouter;
