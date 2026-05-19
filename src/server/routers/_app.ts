import { router } from "../trpc";
import { userRouter } from "./user";
import { videoRouter } from "./video";
import { gameRouter } from "./game";
import { imageRouter } from "./image";
import { tagRouter } from "./tag";
import { adminRouter } from "./admin";
import { commentRouter } from "./comment";
import { gameCommentRouter } from "./game-comment";
import { imagePostCommentRouter } from "./image-comment";
import { seriesRouter } from "./series";
import { siteRouter } from "./site";
import { setupRouter } from "./setup";
import { stickerRouter } from "./sticker";
import { referralRouter } from "./referral";
import { redeemRouter } from "./redeem";
import { paymentRouter } from "./payment";
import { notificationRouter } from "./notification";
import { followRouter } from "./follow";
import { messageRouter } from "./message";
import { channelRouter } from "./channel";
import { guestbookRouter } from "./guestbook";
import { fileRouter } from "./file";
import { importRouter } from "./import";
import { apiKeyRouter } from "./api-key";
import { openApiRouter } from "./open-api";
import { searchRouter } from "./search";
import { playlistRouter } from "./playlist";
import { adRouter } from "./ad";
import { rankingRouter } from "./ranking";
import { ticketRouter } from "./ticket";

export const appRouter = router({
  user: userRouter,
  video: videoRouter,
  game: gameRouter,
  image: imageRouter,
  tag: tagRouter,
  admin: adminRouter,
  comment: commentRouter,
  gameComment: gameCommentRouter,
  imagePostComment: imagePostCommentRouter,
  series: seriesRouter,
  site: siteRouter,
  setup: setupRouter,
  sticker: stickerRouter,
  referral: referralRouter,
  redeem: redeemRouter,
  payment: paymentRouter,
  notification: notificationRouter,
  follow: followRouter,
  message: messageRouter,
  channel: channelRouter,
  guestbook: guestbookRouter,
  file: fileRouter,
  import: importRouter,
  apiKey: apiKeyRouter,
  openApi: openApiRouter,
  search: searchRouter,
  playlist: playlistRouter,
  ad: adRouter,
  ranking: rankingRouter,
  ticket: ticketRouter,
});

export type AppRouter = typeof appRouter;
