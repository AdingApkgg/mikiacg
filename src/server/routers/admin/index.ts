import { mergeRouters, router } from "../../trpc";
import { adminStatsRouter } from "./stats";
import { adminUsersRouter } from "./users";
import { adminVideosRouter } from "./videos";
import { adminTagsRouter } from "./tags";
import { adminCommentsRouter } from "./comments";
import { adminConfigRouter } from "./config";
import { adminCoversRouter } from "./covers";
import { adminGamesRouter } from "./games";
import { adminImagesRouter } from "./images";
import { adminExportRouter } from "./export";
import { adminLinksRouter } from "./links";
import { adminBackupsRouter } from "./backups";
import { adminSeriesRouter } from "./series";
import { adminStickersRouter } from "./stickers";
import { adminFilesRouter } from "./files";
import { adminStoragePoliciesRouter } from "./storage-policies";
import { adminGroupsRouter } from "./groups";
import { adminAdsRouter } from "./ads";
import { adminRankingRouter } from "./ranking";
import { adminTicketsRouter } from "./tickets";

export const adminRouter = mergeRouters(
  adminStatsRouter,
  adminUsersRouter,
  adminVideosRouter,
  adminTagsRouter,
  adminCommentsRouter,
  adminConfigRouter,
  adminCoversRouter,
  adminGamesRouter,
  adminImagesRouter,
  adminExportRouter,
  adminLinksRouter,
  adminBackupsRouter,
  adminSeriesRouter,
  adminStickersRouter,
  adminFilesRouter,
  adminStoragePoliciesRouter,
  adminGroupsRouter,
  router({ ads: adminAdsRouter }),
  router({ ranking: adminRankingRouter }),
  adminTicketsRouter,
);
