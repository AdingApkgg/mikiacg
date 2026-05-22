import { config } from "dotenv";
config({ path: ".env.development" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const MIN_PUBLISHED_CONTENT = 50;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const p = new PrismaClient({ adapter });
  const [v, i, g, t, u] = await Promise.all([
    p.video.count({ where: { status: "PUBLISHED" } }),
    p.imagePost.count({ where: { status: "PUBLISHED" } }),
    p.game.count({ where: { status: "PUBLISHED" } }),
    p.tag.count(),
    p.user.count(),
  ]);
  const gameAuthors = await p.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(DISTINCT "extraInfo"->>'originalAuthor')::int AS c
    FROM "Game"
    WHERE status = 'PUBLISHED'
      AND "extraInfo" ? 'originalAuthor'
      AND "extraInfo"->>'originalAuthor' <> ''
  `;
  const videoAuthors = await p.$queryRaw<Array<{ c: number }>>`
    SELECT COUNT(DISTINCT "extraInfo"->>'author')::int AS c
    FROM "Video"
    WHERE status = 'PUBLISHED'
      AND "extraInfo" ? 'author'
      AND "extraInfo"->>'author' <> ''
  `;
  const result = {
    videos: v,
    imagePosts: i,
    games: g,
    tags: t,
    users: u,
    distinctVideoAuthors: videoAuthors[0]?.c ?? 0,
    distinctGameAuthors: gameAuthors[0]?.c ?? 0,
  };
  console.log(result);

  const failures = [
    ["videos", v],
    ["games", g],
    ["imagePosts", i],
  ].filter(([, count]) => Number(count) < MIN_PUBLISHED_CONTENT);

  if (failures.length > 0) {
    console.error(
      `Published demo content below ${MIN_PUBLISHED_CONTENT}: ${failures
        .map(([name, count]) => `${name}=${count}`)
        .join(", ")}`,
    );
    process.exitCode = 1;
  }

  await p.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
