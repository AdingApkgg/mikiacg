import { prisma } from "@/lib/prisma";
import { meili, INDEX } from "@/lib/meilisearch";

function readVideoExtra(json: unknown): { author: string; keywords: string } {
  if (!json || typeof json !== "object") return { author: "", keywords: "" };
  const o = json as Record<string, unknown>;
  const author = typeof o.author === "string" ? o.author : "";
  const kw = Array.isArray(o.keywords) ? o.keywords.filter((x): x is string => typeof x === "string") : [];
  return { author, keywords: kw.join(" ") };
}

function readGameExtra(json: unknown): {
  originalName: string;
  originalAuthor: string;
  keywords: string;
} {
  if (!json || typeof json !== "object") {
    return { originalName: "", originalAuthor: "", keywords: "" };
  }
  const o = json as Record<string, unknown>;
  const originalName = typeof o.originalName === "string" ? o.originalName : "";
  const originalAuthor = typeof o.originalAuthor === "string" ? o.originalAuthor : "";
  const kw = Array.isArray(o.keywords) ? o.keywords.filter((x): x is string => typeof x === "string") : [];
  return { originalName, originalAuthor, keywords: kw.join(" ") };
}

async function ignore404(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (e: unknown) {
    const err = e as { httpStatus?: number; code?: string };
    if (err.httpStatus === 404 || err.code === "document_not_found") return;
    throw e;
  }
}

export async function syncVideo(id: string): Promise<void> {
  const row = await prisma.video.findUnique({
    where: { id },
    include: {
      uploader: { select: { username: true, nickname: true } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { likes: true } },
    },
  });
  if (!row) {
    await deleteVideo(id);
    return;
  }
  if (row.status !== "PUBLISHED") {
    await ignore404(meili.index(INDEX.video).deleteDocument(id));
    return;
  }
  const extra = readVideoExtra(row.extraInfo);
  const tagNames = row.tags.map((t) => t.tag.name);
  const tagSlugs = row.tags.map((t) => t.tag.slug);
  const tagIds = row.tags.map((t) => t.tag.id);
  await meili.index(INDEX.video).addDocuments([
    {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      status: row.status,
      tagNames,
      tagSlugs,
      tagIds,
      uploaderId: row.uploaderId,
      uploaderUsername: row.uploader.username,
      uploaderNickname: row.uploader.nickname ?? "",
      author: extra.author,
      keywords: extra.keywords,
      isNsfw: row.isNsfw,
      createdAtTs: row.createdAt.getTime(),
      publishedAtTs: (row.publishedAt ?? row.createdAt).getTime(),
      views: row.views,
      likes: row._count.likes,
    },
  ]);
}

export async function deleteVideo(id: string): Promise<void> {
  await ignore404(meili.index(INDEX.video).deleteDocument(id));
}

export async function syncGame(id: string): Promise<void> {
  const row = await prisma.game.findUnique({
    where: { id },
    include: {
      uploader: { select: { username: true, nickname: true } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
      aliases: { select: { name: true } },
      _count: { select: { likes: true } },
    },
  });
  if (!row) {
    await deleteGame(id);
    return;
  }
  if (row.status !== "PUBLISHED") {
    await ignore404(meili.index(INDEX.game).deleteDocument(id));
    return;
  }
  const extra = readGameExtra(row.extraInfo);
  const tagNames = row.tags.map((t) => t.tag.name);
  const tagSlugs = row.tags.map((t) => t.tag.slug);
  const tagIds = row.tags.map((t) => t.tag.id);
  const aliases = row.aliases.map((a) => a.name);
  await meili.index(INDEX.game).addDocuments([
    {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      status: row.status,
      tagNames,
      tagSlugs,
      tagIds,
      gameType: row.gameType ?? "",
      isFree: row.isFree,
      isNsfw: row.isNsfw,
      createdAtTs: row.createdAt.getTime(),
      publishedAtTs: (row.publishedAt ?? row.createdAt).getTime(),
      views: row.views,
      downloads: row.downloads,
      likes: row._count.likes,
      aliases,
      originalName: extra.originalName,
      originalAuthor: extra.originalAuthor,
      keywords: extra.keywords,
      uploaderNickname: row.uploader.nickname ?? "",
      uploaderUsername: row.uploader.username,
    },
  ]);
}

export async function deleteGame(id: string): Promise<void> {
  await ignore404(meili.index(INDEX.game).deleteDocument(id));
}

export async function syncImagePost(id: string): Promise<void> {
  const row = await prisma.imagePost.findUnique({
    where: { id },
    include: {
      uploader: { select: { username: true, nickname: true } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { likes: true } },
    },
  });
  if (!row) {
    await deleteImagePost(id);
    return;
  }
  if (row.status !== "PUBLISHED") {
    await ignore404(meili.index(INDEX.image).deleteDocument(id));
    return;
  }
  const tagNames = row.tags.map((t) => t.tag.name);
  const tagSlugs = row.tags.map((t) => t.tag.slug);
  const tagIds = row.tags.map((t) => t.tag.id);
  await meili.index(INDEX.image).addDocuments([
    {
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      status: row.status,
      tagNames,
      tagSlugs,
      tagIds,
      uploaderNickname: row.uploader.nickname ?? "",
      uploaderUsername: row.uploader.username,
      isNsfw: row.isNsfw,
      createdAtTs: row.createdAt.getTime(),
      publishedAtTs: (row.publishedAt ?? row.createdAt).getTime(),
      views: row.views,
      likes: row._count.likes,
    },
  ]);
}

export async function deleteImagePost(id: string): Promise<void> {
  await ignore404(meili.index(INDEX.image).deleteDocument(id));
}

export async function syncTag(id: string): Promise<void> {
  const row = await prisma.tag.findUnique({
    where: { id },
    include: { aliases: { select: { name: true } } },
  });
  if (!row) {
    await deleteTag(id);
    return;
  }
  const aliasNames = row.aliases.map((a) => a.name);
  await meili.index(INDEX.tag).addDocuments([
    {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      categoryId: row.categoryId ?? "",
      aliasNames,
      videoCount: row.videoCount,
      gameCount: row.gameCount,
      imagePostCount: row.imagePostCount,
    },
  ]);
}

export async function deleteTag(id: string): Promise<void> {
  await ignore404(meili.index(INDEX.tag).deleteDocument(id));
}

export async function syncUser(id: string): Promise<void> {
  const row = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      nickname: true,
      bio: true,
      role: true,
      isBanned: true,
    },
  });
  if (!row) {
    await deleteUser(id);
    return;
  }
  const videoCount = await prisma.video.count({
    where: { uploaderId: id, status: "PUBLISHED" },
  });
  await meili.index(INDEX.user).addDocuments([
    {
      id: row.id,
      username: row.username,
      nickname: row.nickname ?? "",
      bio: row.bio ?? "",
      role: row.role,
      isBanned: row.isBanned,
      videoCount,
    },
  ]);
}

export async function deleteUser(id: string): Promise<void> {
  await ignore404(meili.index(INDEX.user).deleteDocument(id));
}
