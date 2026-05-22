import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { config } from "dotenv";
import path from "node:path";

const envFile = process.env.NODE_ENV === "production" ? ".env.production" : ".env.development";
config({ path: path.join(__dirname, "..", envFile) });

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randomInt(0, 23), randomInt(0, 59), randomInt(0, 59));
  return d;
}

const DEMO_TARGET_COUNT = 50;
const DEMO_ID_BASE = {
  video: 910000,
  game: 920000,
  imagePost: 930000,
};

function demoId(base: number, index: number): string {
  return String(base + index + 1).padStart(6, "0");
}

function demoSeedKey(kind: "video" | "game" | "image-post", index: number): string {
  return `seed-${kind}-${String(index + 1).padStart(2, "0")}`;
}

function hasSeedKey(extraInfo: unknown, seedKey: string): boolean {
  if (!extraInfo || typeof extraInfo !== "object" || Array.isArray(extraInfo)) return false;
  return (extraInfo as { seedKey?: unknown }).seedKey === seedKey;
}

async function hashPassword(password: string): Promise<string> {
  const { hash } = await import("../src/lib/bcrypt-wasm");
  return hash(password, 10);
}

// ---------------------------------------------------------------------------
// 标签分类 & 标签
// ---------------------------------------------------------------------------

const TAG_CATEGORIES = [
  { name: "游戏IP", slug: "game-ip", color: "#8b5cf6" },
  { name: "创作者", slug: "creator", color: "#ec4899" },
  { name: "渲染类型", slug: "render-type", color: "#06b6d4" },
  { name: "内容标签", slug: "content-tag", color: "#f59e0b" },
  { name: "游戏类型", slug: "game-genre", color: "#10b981" },
];

const TAGS_BY_CATEGORY: Record<string, Array<{ name: string; slug: string }>> = {
  "game-ip": [
    { name: "原神", slug: "genshin" },
    { name: "星穹铁道", slug: "honkai-star-rail" },
    { name: "绝区零", slug: "zzz" },
    { name: "崩坏3", slug: "honkai3" },
    { name: "守望先锋", slug: "overwatch" },
    { name: "蔚蓝档案", slug: "blue-archive" },
    { name: "鸣潮", slug: "wuthering-waves" },
    { name: "少女前线", slug: "girls-frontline" },
    { name: "碧蓝航线", slug: "azur-lane" },
    { name: "Hololive", slug: "hololive" },
    { name: "偶像大师", slug: "idolmaster" },
    { name: "尼尔", slug: "nier" },
    { name: "最终幻想", slug: "final-fantasy" },
    { name: "命运-冠位指定", slug: "fgo" },
  ],
  creator: [
    { name: "StarryMomoko", slug: "starrymomoko" },
    { name: "PastaPaprika", slug: "pastapaprika" },
    { name: "ViciNeko", slug: "vicineko" },
    { name: "Nagoonimation", slug: "nagoonimation" },
    { name: "Mantis-X", slug: "mantis-x" },
    { name: "Croove", slug: "croove" },
    { name: "RedRain", slug: "redrain" },
    { name: "Seneto", slug: "seneto" },
    { name: "Kreon3D", slug: "kreon3d" },
    { name: "Marrubi", slug: "marrubi" },
    { name: "Yuluer", slug: "yuluer" },
    { name: "3Dimm", slug: "3dimm" },
  ],
  "render-type": [
    { name: "3D", slug: "3d" },
    { name: "2D", slug: "2d" },
    { name: "像素风", slug: "pixel" },
    { name: "里番", slug: "anime-hentai" },
  ],
  "content-tag": [
    { name: "合集", slug: "compilation" },
    { name: "短片", slug: "short" },
    { name: "剧情向", slug: "story" },
    { name: "无码", slug: "uncensored" },
    { name: "有码", slug: "censored" },
    { name: "NTR", slug: "ntr" },
  ],
  "game-genre": [
    { name: "SLG", slug: "slg" },
    { name: "RPG", slug: "rpg" },
    { name: "ADV", slug: "adv" },
    { name: "ACT", slug: "act" },
    { name: "AVG", slug: "avg" },
    { name: "VN", slug: "vn" },
  ],
};

// ---------------------------------------------------------------------------
// 用户
// ---------------------------------------------------------------------------

const USERS_DATA = [
  {
    email: "owner@acgn.dev",
    username: "owner",
    nickname: "站长",
    role: "OWNER" as const,
    canUpload: true,
    bio: "ACGN 平台创始人",
  },
  {
    email: "admin@acgn.dev",
    username: "admin",
    nickname: "管理员",
    role: "ADMIN" as const,
    canUpload: true,
    bio: "内容审核 & 站务管理",
    adminScopes: [
      "video:moderate",
      "video:manage",
      "user:view",
      "user:manage",
      "tag:manage",
      "comment:manage",
      "settings:manage",
    ],
  },
  {
    email: "starrymomoko@acgn.dev",
    username: "starrymomoko",
    nickname: "StarryMomoko",
    role: "USER" as const,
    canUpload: true,
    bio: "3D 动画创作者 | Blender & UE5",
  },
  {
    email: "pastapaprika@acgn.dev",
    username: "pastapaprika",
    nickname: "PastaPaprika",
    role: "USER" as const,
    canUpload: true,
    bio: "原神 3D 短片 | 持续更新中",
  },
  {
    email: "vicineko@acgn.dev",
    username: "vicineko",
    nickname: "ViciNeko",
    role: "USER" as const,
    canUpload: true,
    bio: "3D Animator | R18 MMD",
  },
  {
    email: "ntrman@acgn.dev",
    username: "ntrman",
    nickname: "NTRMAN",
    role: "USER" as const,
    canUpload: true,
    bio: "SLG 游戏搬运 & 汉化",
  },
  {
    email: "playmeow@acgn.dev",
    username: "playmeow",
    nickname: "Playmeow",
    role: "USER" as const,
    canUpload: true,
    bio: "日系同人游戏分享",
  },
  {
    email: "viewer@acgn.dev",
    username: "viewer",
    nickname: "匿名路人",
    role: "USER" as const,
    canUpload: false,
    bio: "只看不说话",
  },
  {
    email: "seneto@acgn.dev",
    username: "seneto",
    nickname: "Seneto",
    role: "USER" as const,
    canUpload: true,
    bio: "2D / 3D 动画制作",
  },
  {
    email: "nomeme@acgn.dev",
    username: "nomeme",
    nickname: "NoMeme",
    role: "USER" as const,
    canUpload: true,
    bio: "SLG 游戏汉化搬运",
  },
];

// ---------------------------------------------------------------------------
// 视频数据 — 模拟实际站点的3D渲染动画风格
// ---------------------------------------------------------------------------

interface VideoSeed {
  title: string;
  creator: string;
  tags: string[];
  duration: [number, number];
}

const VIDEOS: VideoSeed[] = [
  // StarryMomoko 原神系列
  {
    title: "【柏妮思的特调饮品】StarryMomoko",
    creator: "starrymomoko",
    tags: ["genshin", "starrymomoko", "3d"],
    duration: [120, 360],
  },
  {
    title: "【流萤 让我进去】StarryMomoko",
    creator: "starrymomoko",
    tags: ["honkai-star-rail", "starrymomoko", "3d"],
    duration: [180, 480],
  },
  {
    title: "【宵宫教你一课】StarryMomoko",
    creator: "starrymomoko",
    tags: ["genshin", "starrymomoko", "3d"],
    duration: [120, 300],
  },
  {
    title: "【绮良良的远方盛宴】StarryMomoko",
    creator: "starrymomoko",
    tags: ["genshin", "starrymomoko", "3d"],
    duration: [150, 420],
  },
  {
    title: "【甘雨的秘密】StarryMomoko",
    creator: "starrymomoko",
    tags: ["genshin", "starrymomoko", "3d"],
    duration: [120, 360],
  },
  {
    title: "【妮露的星期五之夜】StarryMomoko",
    creator: "starrymomoko",
    tags: ["genshin", "starrymomoko", "3d"],
    duration: [180, 480],
  },
  // PastaPaprika 原神系列
  {
    title: "【卡齐娜与空】PastaPaprika",
    creator: "pastapaprika",
    tags: ["genshin", "pastapaprika", "3d"],
    duration: [90, 300],
  },
  {
    title: "【爱诺】PastaPaprika",
    creator: "pastapaprika",
    tags: ["genshin", "pastapaprika", "3d"],
    duration: [60, 240],
  },
  {
    title: "【茜特菈莉】PastaPaprika",
    creator: "pastapaprika",
    tags: ["genshin", "pastapaprika", "3d"],
    duration: [90, 300],
  },
  {
    title: "【知更鸟x花火】PastaPaprika",
    creator: "pastapaprika",
    tags: ["honkai-star-rail", "pastapaprika", "3d"],
    duration: [120, 360],
  },
  {
    title: "【原神秋沙钱汤】PastaPaprika",
    creator: "pastapaprika",
    tags: ["genshin", "pastapaprika", "3d"],
    duration: [60, 180],
  },
  {
    title: "【优菈后宫】PastaPaprika",
    creator: "pastapaprika",
    tags: ["genshin", "pastapaprika", "3d", "compilation"],
    duration: [300, 600],
  },
  {
    title: "【法厄同的宠物】PastaPaprika",
    creator: "pastapaprika",
    tags: ["genshin", "pastapaprika", "3d"],
    duration: [90, 240],
  },
  {
    title: "【芙宁娜x空】PastaPaprika",
    creator: "pastapaprika",
    tags: ["genshin", "pastapaprika", "3d"],
    duration: [120, 300],
  },
  // ViciNeko
  {
    title: "【D.Va 特别训练】ViciNeko",
    creator: "vicineko",
    tags: ["overwatch", "vicineko", "3d"],
    duration: [180, 600],
  },
  { title: "【2B 工厂回忆录】ViciNeko", creator: "vicineko", tags: ["nier", "vicineko", "3d"], duration: [300, 720] },
  {
    title: "【刻晴的雷元素反应】ViciNeko",
    creator: "vicineko",
    tags: ["genshin", "vicineko", "3d"],
    duration: [180, 480],
  },
  // Seneto 2D系列
  { title: "【放学后的秘密】Seneto", creator: "seneto", tags: ["seneto", "2d", "story"], duration: [120, 360] },
  { title: "【游泳课上的往事】Seneto", creator: "seneto", tags: ["seneto", "2d", "story"], duration: [120, 300] },
  { title: "【圆香与内向男生】Seneto", creator: "seneto", tags: ["idolmaster", "seneto", "2d"], duration: [90, 240] },
  // 其他创作者
  {
    title: "【蔚蓝档案 白子特训】Nagoonimation",
    creator: "vicineko",
    tags: ["blue-archive", "nagoonimation", "3d"],
    duration: [180, 480],
  },
  {
    title: "【崩铁 黑天鹅】Croove",
    creator: "starrymomoko",
    tags: ["honkai-star-rail", "croove", "3d"],
    duration: [240, 600],
  },
  {
    title: "【守望先锋 猎空合集】RedRain",
    creator: "vicineko",
    tags: ["overwatch", "redrain", "3d", "compilation"],
    duration: [600, 1200],
  },
  { title: "【绝区零 妮可】Mantis-X", creator: "pastapaprika", tags: ["zzz", "mantis-x", "3d"], duration: [120, 360] },
  {
    title: "【碧蓝航线 大凤】3Dimm",
    creator: "starrymomoko",
    tags: ["azur-lane", "3dimm", "3d"],
    duration: [180, 480],
  },
  {
    title: "【鸣潮 今汐的月下冥想】Yuluer",
    creator: "pastapaprika",
    tags: ["wuthering-waves", "yuluer", "3d"],
    duration: [120, 300],
  },
  {
    title: "【FGO 玛修合集】Marrubi",
    creator: "vicineko",
    tags: ["fgo", "marrubi", "3d", "compilation"],
    duration: [480, 900],
  },
  {
    title: "【原神 雷电将军 4K】Kreon3D",
    creator: "starrymomoko",
    tags: ["genshin", "kreon3d", "3d"],
    duration: [180, 420],
  },
  {
    title: "【星铁 卡芙卡的午后】StarryMomoko",
    creator: "starrymomoko",
    tags: ["honkai-star-rail", "starrymomoko", "3d"],
    duration: [150, 360],
  },
  {
    title: "【最终幻想 蒂法 重制】ViciNeko",
    creator: "vicineko",
    tags: ["final-fantasy", "vicineko", "3d"],
    duration: [240, 600],
  },
];

const VIDEO_SUPPLEMENT_TEMPLATES = [
  { ipTag: "genshin", character: "申鹤", scene: "雪夜练习室" },
  { ipTag: "honkai-star-rail", character: "银狼", scene: "数据迷宫夜巡" },
  { ipTag: "zzz", character: "铃", scene: "录像店的午后" },
  { ipTag: "blue-archive", character: "日奈", scene: "风纪委员会档案" },
  { ipTag: "wuthering-waves", character: "长离", scene: "赤羽回响" },
  { ipTag: "azur-lane", character: "能代", scene: "港区晨练" },
  { ipTag: "fgo", character: "玛修", scene: "迦勒底训练日志" },
  { ipTag: "hololive", character: "星街彗星", scene: "舞台灯光测试" },
  { ipTag: "idolmaster", character: "樋口圆香", scene: "录音棚小剧场" },
  { ipTag: "honkai3", character: "琪亚娜", scene: "月光下的重逢" },
  { ipTag: "overwatch", character: "天使", scene: "守望基地休憩" },
  { ipTag: "nier", character: "2B", scene: "废墟花园巡礼" },
  { ipTag: "final-fantasy", character: "蒂法", scene: "第七天堂夜谈" },
  { ipTag: "girls-frontline", character: "HK416", scene: "安全屋任务记录" },
  { ipTag: "genshin", character: "夜兰", scene: "璃月情报局" },
  { ipTag: "honkai-star-rail", character: "黄泉", scene: "雨夜列车" },
  { ipTag: "zzz", character: "艾莲", scene: "咖啡店打烊后" },
  { ipTag: "blue-archive", character: "爱丽丝", scene: "游戏开发部新企划" },
  { ipTag: "wuthering-waves", character: "秧秧", scene: "风声练习曲" },
  { ipTag: "azur-lane", character: "柴郡", scene: "茶会摄影棚" },
  { ipTag: "fgo", character: "尼禄", scene: "黄金剧场排练" },
  { ipTag: "hololive", character: "白上吹雪", scene: "直播前一小时" },
  { ipTag: "idolmaster", character: "浅仓透", scene: "海边广告拍摄" },
  { ipTag: "honkai3", character: "爱莉希雅", scene: "粉色庭院回忆" },
  { ipTag: "overwatch", character: "猎空", scene: "训练室加速测试" },
  { ipTag: "nier", character: "A2", scene: "荒漠信号塔" },
] as const;

const VIDEO_SUPPLEMENT_CREATORS = ["starrymomoko", "pastapaprika", "vicineko", "seneto"] as const;

const VIDEO_SUPPLEMENTS: VideoSeed[] = VIDEO_SUPPLEMENT_TEMPLATES.map((item, index) => {
  const creator = VIDEO_SUPPLEMENT_CREATORS[index % VIDEO_SUPPLEMENT_CREATORS.length];
  const renderTag = creator === "seneto" || index % 7 === 0 ? "2d" : "3d";
  return {
    title: `【${item.character} ${item.scene}】Demo Motion ${String(index + 1).padStart(2, "0")}`,
    creator,
    tags: [item.ipTag, creator, renderTag, index % 3 === 0 ? "story" : "short"],
    duration: [90 + (index % 5) * 20, 260 + (index % 6) * 50] as [number, number],
  };
});

const DEMO_VIDEOS: VideoSeed[] = [...VIDEOS, ...VIDEO_SUPPLEMENTS].slice(0, DEMO_TARGET_COUNT);

// ---------------------------------------------------------------------------
// 游戏数据 — 模拟实际站点的日系同人游戏风格
// ---------------------------------------------------------------------------

interface GameSeed {
  title: string;
  gameType: string;
  platform: string;
  isFree: boolean;
  version?: string;
  tags: string[];
}

const GAMES: GameSeed[] = [
  // SLG（占比最大）
  {
    title: "【SLG/双端】魔法战士莉莉安",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver1.0",
  },
  {
    title: "【SLG/双端】服从的魔法少女",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver1.2",
  },
  { title: "【SLG/免费】凤凰计划 V16", gameType: "SLG", platform: "PC", isFree: true, tags: ["slg"], version: "V16" },
  {
    title: "【SLG/双端】恶魔少女",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver2.0",
  },
  { title: "【SLG/电脑】丧尸房客", gameType: "SLG", platform: "PC", isFree: true, tags: ["slg", "ntr"] },
  { title: "【SLG/双端】厕所的地缚灵", gameType: "SLG", platform: "PC,Android", isFree: true, tags: ["slg"] },
  {
    title: "【SLG/双端】导师生活 [重制]",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver0.3",
  },
  {
    title: "【SLG/双端】星陨纪元",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ch2V0.4",
  },
  {
    title: "【SLG/双端】彩色",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver1.1",
  },
  { title: "【SLG/电脑】欲望之旅", gameType: "SLG", platform: "PC", isFree: true, tags: ["slg", "ntr"] },
  { title: "【SLG/双端】妮娜的涩涩日常", gameType: "SLG", platform: "PC,Android", isFree: true, tags: ["slg"] },
  {
    title: "【SLG/免费】扶她生活 扶她阴角的后宫模拟",
    gameType: "SLG",
    platform: "PC",
    isFree: true,
    tags: ["slg"],
    version: "Ver1.3.0",
  },
  // ADV
  {
    title: "【ADV/免费】哥哥，还没准备好接吻吗？[全CG存档]",
    gameType: "ADV",
    platform: "PC",
    isFree: true,
    tags: ["adv"],
  },
  {
    title: "【ADV/双端】魔女之夏 ～少女们的回忆～",
    gameType: "ADV",
    platform: "PC,Android",
    isFree: true,
    tags: ["adv"],
  },
  { title: "【ADV/电脑】樱花学院恋爱物语", gameType: "ADV", platform: "PC", isFree: false, tags: ["adv"] },
  {
    title: "【ADV/免费】黄昏时分的告白 [完整版]",
    gameType: "ADV",
    platform: "PC",
    isFree: true,
    tags: ["adv", "story"],
  },
  // RPG
  {
    title: "【RPG/双端】堕落的圣骑士 ～誓约的终焉～",
    gameType: "RPG",
    platform: "PC,Android",
    isFree: true,
    tags: ["rpg", "pixel"],
  },
  {
    title: "【RPG/电脑】异世界迷宫探索者 Ver2.1",
    gameType: "RPG",
    platform: "PC",
    isFree: false,
    tags: ["rpg", "pixel"],
    version: "Ver2.1",
  },
  {
    title: "【RPG/免费】魔王城的陷落",
    gameType: "RPG",
    platform: "PC",
    isFree: true,
    tags: ["rpg"],
    version: "Ver1.0",
  },
  // ACT
  { title: "【ACT/电脑】暗影猎手 ～月下的追猎～", gameType: "ACT", platform: "PC", isFree: false, tags: ["act"] },
  { title: "【ACT/双端】像素女武神", gameType: "ACT", platform: "PC,Android", isFree: true, tags: ["act", "pixel"] },
];

const GAME_SUPPLEMENTS: GameSeed[] = [
  {
    title: "【SLG/双端】月影旅社 Demo版",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg", "story"],
    version: "Ver0.9.1",
  },
  {
    title: "【SLG/电脑】海滨管理日记",
    gameType: "SLG",
    platform: "PC",
    isFree: true,
    tags: ["slg"],
    version: "Ver1.4",
  },
  {
    title: "【SLG/双端】星港值班室",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ch1V0.7",
  },
  {
    title: "【SLG/电脑】社团经营计划",
    gameType: "SLG",
    platform: "PC",
    isFree: false,
    tags: ["slg", "story"],
    version: "Ver2.0",
  },
  {
    title: "【SLG/双端】魔法学院助教",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver0.8.3",
  },
  {
    title: "【ADV/免费】雨后咖啡馆",
    gameType: "ADV",
    platform: "PC",
    isFree: true,
    tags: ["adv", "story"],
    version: "Ver1.0",
  },
  {
    title: "【ADV/双端】夏日取材旅行",
    gameType: "ADV",
    platform: "PC,Android",
    isFree: true,
    tags: ["adv"],
    version: "Ver1.1",
  },
  {
    title: "【ADV/电脑】旧图书馆的约定",
    gameType: "ADV",
    platform: "PC",
    isFree: false,
    tags: ["adv", "story"],
    version: "Ver1.2",
  },
  {
    title: "【ADV/双端】电波少女通信录",
    gameType: "ADV",
    platform: "PC,Android",
    isFree: true,
    tags: ["adv"],
    version: "Ver0.6",
  },
  {
    title: "【RPG/电脑】露娜与星屑迷宫",
    gameType: "RPG",
    platform: "PC",
    isFree: true,
    tags: ["rpg", "pixel"],
    version: "Ver1.0.5",
  },
  {
    title: "【RPG/双端】遗迹调查团",
    gameType: "RPG",
    platform: "PC,Android",
    isFree: true,
    tags: ["rpg"],
    version: "Ver0.9",
  },
  {
    title: "【RPG/电脑】魔导工坊物语",
    gameType: "RPG",
    platform: "PC",
    isFree: false,
    tags: ["rpg", "story"],
    version: "Ver2.3",
  },
  {
    title: "【RPG/双端】像素王国边境",
    gameType: "RPG",
    platform: "PC,Android",
    isFree: true,
    tags: ["rpg", "pixel"],
    version: "Ver1.7",
  },
  {
    title: "【ACT/电脑】月下疾走",
    gameType: "ACT",
    platform: "PC",
    isFree: true,
    tags: ["act"],
    version: "Ver1.0",
  },
  {
    title: "【ACT/双端】霓虹忍者试炼",
    gameType: "ACT",
    platform: "PC,Android",
    isFree: true,
    tags: ["act", "pixel"],
    version: "Ver0.5",
  },
  {
    title: "【ACT/电脑】机甲少女突击",
    gameType: "ACT",
    platform: "PC",
    isFree: false,
    tags: ["act"],
    version: "Ver1.8",
  },
  {
    title: "【AVG/免费】深夜电台来信",
    gameType: "AVG",
    platform: "PC",
    isFree: true,
    tags: ["avg", "story"],
    version: "Ver1.0",
  },
  {
    title: "【AVG/双端】周末摄影社",
    gameType: "AVG",
    platform: "PC,Android",
    isFree: true,
    tags: ["avg"],
    version: "Ver1.3",
  },
  {
    title: "【VN/电脑】白昼梦手札",
    gameType: "VN",
    platform: "PC",
    isFree: true,
    tags: ["vn", "story"],
    version: "Ver1.0",
  },
  {
    title: "【VN/双端】星空下的便利店",
    gameType: "VN",
    platform: "PC,Android",
    isFree: true,
    tags: ["vn"],
    version: "Ver0.9.8",
  },
  {
    title: "【SLG/双端】温泉街复兴计划",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver1.5",
  },
  {
    title: "【SLG/电脑】边境小镇日常",
    gameType: "SLG",
    platform: "PC",
    isFree: true,
    tags: ["slg", "story"],
    version: "Ver0.4",
  },
  {
    title: "【ADV/免费】迷你偶像企划",
    gameType: "ADV",
    platform: "PC",
    isFree: true,
    tags: ["adv"],
    version: "Ver1.2.1",
  },
  {
    title: "【RPG/双端】晨星炼金术士",
    gameType: "RPG",
    platform: "PC,Android",
    isFree: true,
    tags: ["rpg"],
    version: "Ver1.1",
  },
  {
    title: "【ACT/电脑】幻影剑士序章",
    gameType: "ACT",
    platform: "PC",
    isFree: true,
    tags: ["act"],
    version: "Ver0.7",
  },
  {
    title: "【AVG/双端】甜点屋营业中",
    gameType: "AVG",
    platform: "PC,Android",
    isFree: true,
    tags: ["avg"],
    version: "Ver1.0",
  },
  {
    title: "【VN/电脑】玻璃海岸的信",
    gameType: "VN",
    platform: "PC",
    isFree: false,
    tags: ["vn", "story"],
    version: "Ver1.4",
  },
  {
    title: "【SLG/双端】同好会扩张计划",
    gameType: "SLG",
    platform: "PC,Android",
    isFree: true,
    tags: ["slg"],
    version: "Ver2.1",
  },
  {
    title: "【RPG/电脑】月轮地牢探索",
    gameType: "RPG",
    platform: "PC",
    isFree: true,
    tags: ["rpg", "pixel"],
    version: "Ver1.6",
  },
  {
    title: "【ADV/双端】放课后观察日记",
    gameType: "ADV",
    platform: "PC,Android",
    isFree: true,
    tags: ["adv", "story"],
    version: "Ver0.8",
  },
  {
    title: "【ACT/双端】魔法滑板竞速",
    gameType: "ACT",
    platform: "PC,Android",
    isFree: true,
    tags: ["act"],
    version: "Ver1.0",
  },
];

const DEMO_GAMES: GameSeed[] = [...GAMES, ...GAME_SUPPLEMENTS].slice(0, DEMO_TARGET_COUNT);

// ---------------------------------------------------------------------------
// 图片帖子
// ---------------------------------------------------------------------------

interface ImagePostSeed {
  title: string;
  tags: string[];
}

const IMAGE_POSTS: ImagePostSeed[] = [
  { title: "原神 神里绫华 同人插画", tags: ["genshin", "2d"] },
  { title: "星穹铁道 卡芙卡 壁纸合集", tags: ["honkai-star-rail", "2d"] },
  { title: "绝区零 妮可 角色设计图", tags: ["zzz", "2d"] },
  { title: "蔚蓝档案 白子 插画练习", tags: ["blue-archive", "2d"] },
  { title: "原神 纳西妲 Q版头像", tags: ["genshin", "2d"] },
  { title: "崩坏3 爱莉希雅 板绘过程", tags: ["honkai3", "2d"] },
  { title: "守望先锋 D.Va 机甲概念图", tags: ["overwatch", "2d"] },
  { title: "原神 芙宁娜 水彩风", tags: ["genshin", "2d"] },
  { title: "鸣潮 长离 同人图集", tags: ["wuthering-waves", "2d"] },
  { title: "碧蓝航线 信浓 婚纱立绘", tags: ["azur-lane", "2d"] },
  { title: "星铁 黑天鹅 暗系插画", tags: ["honkai-star-rail", "2d"] },
  { title: "FGO 阿尔托莉雅 全形态合集", tags: ["fgo", "2d", "compilation"] },
];

const IMAGE_SUPPLEMENTS: ImagePostSeed[] = [
  { title: "原神 胡桃 夜市灯笼插画", tags: ["genshin", "2d"] },
  { title: "原神 雷电将军 紫电壁纸组", tags: ["genshin", "2d", "compilation"] },
  { title: "原神 珊瑚宫心海 海色图集", tags: ["genshin", "2d"] },
  { title: "星穹铁道 流萤 星海写真", tags: ["honkai-star-rail", "2d"] },
  { title: "星穹铁道 银狼 像素头像包", tags: ["honkai-star-rail", "2d", "pixel"] },
  { title: "星穹铁道 知更鸟 舞台灯光设定", tags: ["honkai-star-rail", "2d"] },
  { title: "绝区零 艾莲 午后速写", tags: ["zzz", "2d"] },
  { title: "绝区零 安比 训练室涂鸦", tags: ["zzz", "2d"] },
  { title: "绝区零 朱鸢 城市夜景壁纸", tags: ["zzz", "2d"] },
  { title: "蔚蓝档案 日奈 风纪笔记", tags: ["blue-archive", "2d"] },
  { title: "蔚蓝档案 爱丽丝 游戏开发部", tags: ["blue-archive", "2d"] },
  { title: "蔚蓝档案 星野 夏日小憩", tags: ["blue-archive", "2d"] },
  { title: "鸣潮 今汐 月白图集", tags: ["wuthering-waves", "2d"] },
  { title: "鸣潮 秧秧 风声练习", tags: ["wuthering-waves", "2d"] },
  { title: "鸣潮 吟霖 红线设定稿", tags: ["wuthering-waves", "2d"] },
  { title: "碧蓝航线 大凤 花嫁图集", tags: ["azur-lane", "2d", "compilation"] },
  { title: "碧蓝航线 柴郡 茶会壁纸", tags: ["azur-lane", "2d"] },
  { title: "碧蓝航线 能代 港区晨光", tags: ["azur-lane", "2d"] },
  { title: "Hololive 星街彗星 舞台海报", tags: ["hololive", "2d"] },
  { title: "Hololive 白上吹雪 直播封面", tags: ["hololive", "2d"] },
  { title: "Hololive 宝钟玛琳 航海插画", tags: ["hololive", "2d"] },
  { title: "偶像大师 浅仓透 海风写真", tags: ["idolmaster", "2d"] },
  { title: "偶像大师 樋口圆香 录音棚", tags: ["idolmaster", "2d"] },
  { title: "偶像大师 市川雏菜 色彩练习", tags: ["idolmaster", "2d"] },
  { title: "崩坏3 爱莉希雅 粉色庭院", tags: ["honkai3", "2d"] },
  { title: "崩坏3 琪亚娜 月光壁纸", tags: ["honkai3", "2d"] },
  { title: "崩坏3 雷电芽衣 雷鸣设定", tags: ["honkai3", "2d"] },
  { title: "守望先锋 天使 基地休憩", tags: ["overwatch", "2d"] },
  { title: "守望先锋 猎空 加速轨迹", tags: ["overwatch", "2d"] },
  { title: "守望先锋 D.Va 机甲贴纸", tags: ["overwatch", "2d"] },
  { title: "尼尔 2B 废墟花园", tags: ["nier", "2d"] },
  { title: "尼尔 A2 荒漠信号塔", tags: ["nier", "2d"] },
  { title: "最终幻想 蒂法 第七天堂", tags: ["final-fantasy", "2d"] },
  { title: "最终幻想 爱丽丝 花店速写", tags: ["final-fantasy", "2d"] },
  { title: "FGO 尼禄 黄金剧场", tags: ["fgo", "2d"] },
  { title: "FGO 贞德 蓝白旗帜", tags: ["fgo", "2d"] },
  { title: "少女前线 HK416 安全屋", tags: ["girls-frontline", "2d"] },
  { title: "少女前线 UMP45 夜间任务", tags: ["girls-frontline", "2d"] },
  { title: "原神 芙宁娜 歌剧院图集", tags: ["genshin", "2d", "compilation"] },
  { title: "星穹铁道 黄泉 雨夜列车", tags: ["honkai-star-rail", "2d"] },
];

const DEMO_IMAGE_POSTS: ImagePostSeed[] = [...IMAGE_POSTS, ...IMAGE_SUPPLEMENTS].slice(0, DEMO_TARGET_COUNT);

// ---------------------------------------------------------------------------
// 评论
// ---------------------------------------------------------------------------

const VIDEO_COMMENTS = [
  "画质太好了，4K 看起来效果绝了",
  "模型质量真高",
  "催更！等下一个作品",
  "动作做得好自然",
  "这个光影效果太强了",
  "表情细节到位",
  "等了好久终于更新了",
  "收藏了收藏了",
  "作者大大辛苦了",
  "渲染用了多久啊",
  "物理效果很真实",
  "这个角色选得好",
  "BGM 很搭",
  "有4K版本吗",
  "期待出合集",
  "Blender 还是 UE？",
  "太强了这个表情",
  "镜头运动很流畅",
  "能出教程吗",
  "这个角色终于有人做了",
];

const GAME_COMMENTS = [
  "汉化辛苦了！",
  "安卓端可以正常运行",
  "有攻略吗？卡关了",
  "通关了，CG 很棒",
  "BGM 太好听了",
  "存档放哪里？",
  "感谢分享，下载了",
  "画风好舒服",
  "流程大概多久？",
  "剧情展开很有意思",
  "电脑端运行很流畅",
  "等汉化更新",
  "这个类型真的上头",
  "求补档",
  "希望出续作",
];

const IMAGE_COMMENTS = [
  "画得太好了！",
  "大佬太强了",
  "色彩搭配绝了",
  "能当壁纸吗",
  "这个角色画得太美了",
  "收藏了！",
  "构图很有感觉",
  "期待更多作品",
];

const GUESTBOOK_MESSAGES = [
  "发现了一个宝藏网站！已收藏",
  "界面好好看，求问技术栈",
  "希望能加入更多资源",
  "站长加油！支持支持",
  "终于找到一个好用的 ACG 站了",
  "请问怎么成为投稿者？",
  "建议增加弹幕功能",
  "手机端体验很不错",
  "希望加入更多游戏IP的标签",
  "网站速度好快",
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0]);
  const prisma = new PrismaClient({ adapter });

  console.log("🌱 Seeding database...\n");

  try {
    // ============================== 标签分类 & 标签 ==============================
    console.log("📌 创建标签分类 & 标签...");

    const categoryRecords: Record<string, string> = {};
    for (let i = 0; i < TAG_CATEGORIES.length; i++) {
      const cat = TAG_CATEGORIES[i];
      const record = await prisma.tagCategory.upsert({
        where: { slug: cat.slug },
        update: { name: cat.name, color: cat.color, sortOrder: i },
        create: { name: cat.name, slug: cat.slug, color: cat.color, sortOrder: i },
      });
      categoryRecords[cat.slug] = record.id;
    }

    const tagRecords: Record<string, { id: string }> = {};
    for (const [catSlug, tags] of Object.entries(TAGS_BY_CATEGORY)) {
      const categoryId = categoryRecords[catSlug];
      for (const tag of tags) {
        const record = await prisma.tag.upsert({
          where: { slug: tag.slug },
          update: { categoryId },
          create: { name: tag.name, slug: tag.slug, categoryId },
        });
        tagRecords[tag.slug] = record;
      }
    }
    const totalTags = Object.keys(tagRecords).length;
    console.log(`   ✓ 创建 ${TAG_CATEGORIES.length} 个分类、${totalTags} 个标签`);

    // ============================== 用户组 ==============================
    console.log("👥 创建用户组...");
    const GROUP_SEEDS = [
      {
        name: "默认用户组",
        description: "新注册用户的默认组",
        role: "USER" as const,
        permissions: {
          canUpload: false,
          canComment: true,
          canDanmaku: true,
          canChat: true,
          canDownload: false,
          adsEnabled: true,
        },
        adminScopes: undefined,
        storageQuota: BigInt(5368709120), // 5GB
        isDefault: true,
        isSystem: true,
        color: "#6B7280",
        sortOrder: 0,
      },
      {
        name: "投稿用户组",
        description: "具有投稿权限的用户",
        role: "USER" as const,
        permissions: {
          canUpload: true,
          canComment: true,
          canDanmaku: true,
          canChat: true,
          canDownload: true,
          adsEnabled: true,
        },
        adminScopes: undefined,
        storageQuota: BigInt(21474836480), // 20GB
        isDefault: false,
        isSystem: true,
        color: "#3B82F6",
        sortOrder: 1,
      },
      {
        name: "内容审核组",
        description: "负责内容审核的管理员",
        role: "ADMIN" as const,
        permissions: {
          canUpload: true,
          canComment: true,
          canDanmaku: true,
          canChat: true,
          canDownload: true,
          adsEnabled: false,
        },
        adminScopes: ["video:moderate", "comment:manage"],
        storageQuota: BigInt(21474836480), // 20GB
        isDefault: false,
        isSystem: true,
        color: "#F59E0B",
        sortOrder: 2,
      },
      {
        name: "全权管理组",
        description: "拥有所有管理权限的管理员",
        role: "ADMIN" as const,
        permissions: {
          canUpload: true,
          canComment: true,
          canDanmaku: true,
          canChat: true,
          canDownload: true,
          adsEnabled: false,
        },
        adminScopes: [
          "video:moderate",
          "video:manage",
          "user:view",
          "user:manage",
          "tag:manage",
          "settings:manage",
          "comment:manage",
        ],
        storageQuota: BigInt(53687091200), // 50GB
        isDefault: false,
        isSystem: true,
        color: "#EF4444",
        sortOrder: 3,
      },
      {
        name: "站长组",
        description: "站长专属组，拥有最高权限",
        role: "OWNER" as const,
        permissions: {
          canUpload: true,
          canComment: true,
          canDanmaku: true,
          canChat: true,
          canDownload: true,
          adsEnabled: false,
        },
        adminScopes: undefined,
        storageQuota: BigInt(107374182400), // 100GB
        isDefault: false,
        isSystem: true,
        color: "#D97706",
        sortOrder: 99,
      },
    ];

    const groupRecords: Record<string, string> = {};
    for (const g of GROUP_SEEDS) {
      const group = await prisma.userGroup.upsert({
        where: { name: g.name },
        update: {},
        create: {
          name: g.name,
          description: g.description,
          role: g.role,
          permissions: g.permissions,
          adminScopes: g.adminScopes ?? undefined,
          storageQuota: g.storageQuota,
          isDefault: g.isDefault,
          isSystem: g.isSystem,
          color: g.color,
          sortOrder: g.sortOrder,
        },
      });
      groupRecords[g.name] = group.id;
    }
    console.log(`   ✓ 创建 ${GROUP_SEEDS.length} 个用户组`);

    // ============================== 用户 ==============================
    console.log("👤 创建用户...");
    const defaultPassword = await hashPassword("password123");
    const userRecords: Array<{ id: string; username: string; role: string }> = [];

    for (const u of USERS_DATA) {
      const existingByEmail = await prisma.user.findUnique({ where: { email: u.email } });
      if (existingByEmail) {
        userRecords.push({ id: existingByEmail.id, username: u.username, role: u.role });
        continue;
      }

      const existingByUsername = await prisma.user.findUnique({ where: { username: u.username } });
      if (existingByUsername) {
        userRecords.push({ id: existingByUsername.id, username: u.username, role: u.role });
        continue;
      }

      const groupId =
        u.role === "OWNER"
          ? groupRecords["站长组"]
          : u.role === "ADMIN"
            ? groupRecords["全权管理组"]
            : u.canUpload
              ? groupRecords["投稿用户组"]
              : groupRecords["默认用户组"];

      const user = await prisma.user.create({
        data: {
          email: u.email,
          username: u.username,
          displayUsername: u.nickname,
          nickname: u.nickname,
          role: u.role,
          canUpload: u.canUpload,
          bio: u.bio,
          adminScopes: (u as { adminScopes?: string[] }).adminScopes ?? undefined,
          groupId,
          createdAt: daysAgo(randomInt(30, 180)),
        },
      });

      await prisma.account.create({
        data: {
          userId: user.id,
          type: "credential",
          provider: "credential",
          providerAccountId: user.id,
          password: defaultPassword,
        },
      });

      userRecords.push({ id: user.id, username: u.username, role: u.role });
    }
    console.log(`   ✓ 创建 ${userRecords.length} 个用户（密码统一为 password123）`);

    const uploaderMap: Record<string, string> = {};
    for (const u of userRecords) {
      uploaderMap[u.username] = u.id;
    }
    const allUserIds = userRecords.map((u) => u.id);
    const uploaderIds = userRecords
      .filter((u) => USERS_DATA.find((d) => d.username === u.username)?.canUpload)
      .map((u) => u.id);

    async function resolveDemoVideoId(desiredId: string, seedKey: string, title: string, index: number): Promise<string> {
      const existing = await prisma.video.findUnique({
        where: { id: desiredId },
        select: { id: true, title: true, videoUrl: true, extraInfo: true },
      });
      if (!existing || hasSeedKey(existing.extraInfo, seedKey)) return desiredId;
      if (existing.title === title && existing.videoUrl.startsWith("https://example.com/videos/")) return desiredId;

      const existingSeed = await prisma.video.findFirst({
        where: { title, videoUrl: { startsWith: "https://example.com/videos/" } },
        select: { id: true },
      });
      if (existingSeed) return existingSeed.id;

      for (let offset = 0; offset < 100; offset++) {
        const fallbackId = demoId(950000 + index * 100, offset);
        const fallback = await prisma.video.findUnique({
          where: { id: fallbackId },
          select: { title: true, videoUrl: true, extraInfo: true },
        });
        if (!fallback || hasSeedKey(fallback.extraInfo, seedKey)) return fallbackId;
        if (fallback.title === title && fallback.videoUrl.startsWith("https://example.com/videos/")) return fallbackId;
      }

      throw new Error(`无法为演示视频分配安全 ID: ${title}`);
    }

    async function resolveDemoGameId(desiredId: string, seedKey: string, title: string, index: number): Promise<string> {
      const existing = await prisma.game.findUnique({
        where: { id: desiredId },
        select: { id: true, title: true, description: true, extraInfo: true },
      });
      if (!existing || hasSeedKey(existing.extraInfo, seedKey)) return desiredId;
      if (existing.title === title && existing.description?.startsWith(`${title} ——`)) return desiredId;

      const existingSeed = await prisma.game.findFirst({
        where: { title, description: { startsWith: `${title} ——` } },
        select: { id: true },
      });
      if (existingSeed) return existingSeed.id;

      for (let offset = 0; offset < 100; offset++) {
        const fallbackId = demoId(960000 + index * 100, offset);
        const fallback = await prisma.game.findUnique({
          where: { id: fallbackId },
          select: { title: true, description: true, extraInfo: true },
        });
        if (!fallback || hasSeedKey(fallback.extraInfo, seedKey)) return fallbackId;
        if (fallback.title === title && fallback.description?.startsWith(`${title} ——`)) return fallbackId;
      }

      throw new Error(`无法为演示游戏分配安全 ID: ${title}`);
    }

    async function resolveDemoImagePostId(
      desiredId: string,
      title: string,
      index: number,
    ): Promise<string> {
      const existing = await prisma.imagePost.findUnique({
        where: { id: desiredId },
        select: { id: true, title: true, description: true },
      });
      if (!existing) return desiredId;
      if (existing.title === title && existing.description?.startsWith(`${title} ——`)) return desiredId;

      const existingSeed = await prisma.imagePost.findFirst({
        where: { title, description: { startsWith: `${title} ——` } },
        select: { id: true },
      });
      if (existingSeed) return existingSeed.id;

      for (let offset = 0; offset < 100; offset++) {
        const fallbackId = demoId(970000 + index * 100, offset);
        const fallback = await prisma.imagePost.findUnique({
          where: { id: fallbackId },
          select: { title: true, description: true },
        });
        if (!fallback) return fallbackId;
        if (fallback.title === title && fallback.description?.startsWith(`${title} ——`)) return fallbackId;
      }

      throw new Error(`无法为演示图片帖子分配安全 ID: ${title}`);
    }

    // ============================== 站点配置 ==============================
    console.log("⚙️  初始化站点配置...");
    await prisma.siteConfig.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        siteName: "ACGN Dev",
        siteDescription: "ACGN 内容平台 —— 发现最新 ACGN 视频、游戏与插画内容",
        siteKeywords: "ACGN,动漫,游戏,原神,星穹铁道,绝区零,3D动画,同人游戏,二次元",
        allowRegistration: true,
        allowUpload: true,
        allowComment: true,
        sectionVideoEnabled: true,
        sectionImageEnabled: true,
        sectionGameEnabled: true,
        announcementEnabled: true,
        announcement: "本站目前正在填充资源，感谢大家支持！",
      },
    });
    console.log("   ✓ 站点配置已初始化");

    // ============================== 视频 ==============================
    console.log("🎬 创建视频...");
    const videoRecords: Array<{ id: string; uploaderId: string }> = [];

    for (let i = 0; i < DEMO_VIDEOS.length; i++) {
      const v = DEMO_VIDEOS[i];
      const seedKey = demoSeedKey("video", i);
      const vid = await resolveDemoVideoId(demoId(DEMO_ID_BASE.video, i), seedKey, v.title, i);
      const uploaderId = uploaderMap[v.creator] || pick(uploaderIds);
      const createdAt = daysAgo(randomInt(1, 45));
      const duration = v.duration[0] + ((i * 37) % (v.duration[1] - v.duration[0] + 1));
      const description = `${v.title} —— 3D 渲染动画作品`;
      const coverUrl = `https://picsum.photos/seed/video-${seedKey}/1280/720`;
      const videoUrl = `https://example.com/videos/${vid}/master.m3u8`;
      const extraInfo = {
        seedKind: "demo",
        seedKey,
        intro: description,
        author: v.creator,
        keywords: v.tags,
        notices: [{ type: "info", content: "本内容为本地开发演示数据。" }],
      };

      const video = await prisma.video.upsert({
        where: { id: vid },
        update: {
          title: v.title,
          description,
          coverUrl,
          videoUrl,
          duration,
          status: "PUBLISHED",
          uploaderId,
          extraInfo,
        },
        create: {
          id: vid,
          title: v.title,
          description,
          coverUrl,
          videoUrl,
          duration,
          views: randomInt(50, 2000),
          status: "PUBLISHED",
          uploaderId,
          createdAt,
          updatedAt: createdAt,
          extraInfo,
        },
      });

      for (const slug of v.tags) {
        const tag = tagRecords[slug];
        if (!tag) continue;
        await prisma.tagOnVideo.create({ data: { videoId: video.id, tagId: tag.id } }).catch(() => {});
      }

      videoRecords.push({ id: video.id, uploaderId });
    }
    console.log(`   ✓ 创建 ${videoRecords.length} 个视频`);

    // ============================== 合集 ==============================
    console.log("📚 创建合集...");
    const seriesCreator = uploaderMap["starrymomoko"] || uploaderIds[0];
    const series1 = await prisma.series.upsert({
      where: { id: "seed-series-starrymomoko-genshin" },
      update: {
        title: "StarryMomoko 原神合集",
        description: "StarryMomoko 创作的原神系列 3D 动画",
        creatorId: seriesCreator,
      },
      create: {
        id: "seed-series-starrymomoko-genshin",
        title: "StarryMomoko 原神合集",
        description: "StarryMomoko 创作的原神系列 3D 动画",
        creatorId: seriesCreator,
      },
    });
    const smVideos = videoRecords.filter((_, i) => DEMO_VIDEOS[i]?.creator === "starrymomoko").slice(0, 6);
    for (let i = 0; i < smVideos.length; i++) {
      await prisma.seriesEpisode
        .create({ data: { seriesId: series1.id, videoId: smVideos[i].id, episodeNum: i + 1 } })
        .catch(() => {});
    }

    const ppCreator = uploaderMap["pastapaprika"] || uploaderIds[0];
    const series2 = await prisma.series.upsert({
      where: { id: "seed-series-pastapaprika-genshin" },
      update: {
        title: "PastaPaprika 原神系列",
        description: "PastaPaprika 创作的原神角色短片",
        creatorId: ppCreator,
      },
      create: {
        id: "seed-series-pastapaprika-genshin",
        title: "PastaPaprika 原神系列",
        description: "PastaPaprika 创作的原神角色短片",
        creatorId: ppCreator,
      },
    });
    const ppVideos = videoRecords.filter((_, i) => DEMO_VIDEOS[i]?.creator === "pastapaprika").slice(0, 6);
    for (let i = 0; i < ppVideos.length; i++) {
      await prisma.seriesEpisode
        .create({ data: { seriesId: series2.id, videoId: ppVideos[i].id, episodeNum: i + 1 } })
        .catch(() => {});
    }
    console.log("   ✓ 创建 2 个合集");

    // ============================== 游戏 ==============================
    console.log("🎮 创建游戏...");
    const gameRecords: Array<{ id: string }> = [];

    for (let i = 0; i < DEMO_GAMES.length; i++) {
      const g = DEMO_GAMES[i];
      const seedKey = demoSeedKey("game", i);
      const gid = await resolveDemoGameId(demoId(DEMO_ID_BASE.game, i), seedKey, g.title, i);
      const platforms = g.platform.split(",").map((platform) => platform.trim());
      const uploaderId = platforms.includes("Android")
        ? uploaderMap["playmeow"] || pick(uploaderIds)
        : uploaderMap["ntrman"] || pick(uploaderIds);
      const createdAt = daysAgo(randomInt(1, 60));
      const description = `${g.title} —— ${g.gameType}类型${g.isFree ? "免费" : "付费"}游戏`;
      const version = g.version || `Ver${1 + (i % 2)}.${i % 10}`;
      const coverUrl = `https://picsum.photos/seed/game-${seedKey}/960/540`;
      const extraInfo = {
        seedKind: "demo",
        seedKey,
        originalName: g.title.replace(/^【[^】]+】/, ""),
        originalAuthor: i % 2 === 0 ? "Demo Circle" : "Sample Studio",
        fileSize: `${300 + ((i * 137) % 2800)} MB`,
        platforms,
        screenshots: Array.from({ length: 4 }, (_, idx) => `https://picsum.photos/seed/game-${seedKey}-${idx}/1280/720`),
        keywords: g.tags,
        notices: [{ type: "info", content: "本内容为本地开发演示数据。" }],
      };

      const game = await prisma.game.upsert({
        where: { id: gid },
        update: {
          title: g.title,
          description,
          coverUrl,
          gameType: g.gameType,
          isFree: g.isFree,
          version,
          status: "PUBLISHED",
          uploaderId,
          extraInfo,
        },
        create: {
          id: gid,
          title: g.title,
          description,
          coverUrl,
          gameType: g.gameType,
          isFree: g.isFree,
          version,
          views: randomInt(50, 1000),
          downloads: randomInt(5, 300),
          status: "PUBLISHED",
          uploaderId,
          createdAt,
          updatedAt: createdAt,
          extraInfo,
        },
      });

      for (const slug of g.tags) {
        const tag = tagRecords[slug];
        if (!tag) continue;
        await prisma.tagOnGame.create({ data: { gameId: game.id, tagId: tag.id } }).catch(() => {});
      }

      gameRecords.push({ id: game.id });
    }
    console.log(`   ✓ 创建 ${gameRecords.length} 个游戏`);

    // ============================== 图片帖子 ==============================
    console.log("🖼️  创建图片帖子...");
    const imageRecords: Array<{ id: string }> = [];

    for (let i = 0; i < DEMO_IMAGE_POSTS.length; i++) {
      const p = DEMO_IMAGE_POSTS[i];
      const seedKey = demoSeedKey("image-post", i);
      const iid = await resolveDemoImagePostId(demoId(DEMO_ID_BASE.imagePost, i), p.title, i);
      const uploaderId = uploaderIds[i % uploaderIds.length] || pick(uploaderIds);
      const imageCount = 2 + (i % 7);
      const images = Array.from(
        { length: imageCount },
        (_, idx) => `https://picsum.photos/seed/image-${seedKey}-${idx}/900/1200`,
      );
      const createdAt = daysAgo(randomInt(1, 45));
      const description = `${p.title} —— 同人创作，本地开发演示图帖。`;

      const post = await prisma.imagePost.upsert({
        where: { id: iid },
        update: {
          title: p.title,
          description,
          images,
          status: "PUBLISHED",
          uploaderId,
        },
        create: {
          id: iid,
          title: p.title,
          description,
          images,
          views: randomInt(30, 5000),
          status: "PUBLISHED",
          uploaderId,
          createdAt,
          updatedAt: createdAt,
        },
      });

      for (const slug of p.tags) {
        const tag = tagRecords[slug];
        if (!tag) continue;
        await prisma.tagOnImagePost.create({ data: { imagePostId: post.id, tagId: tag.id } }).catch(() => {});
      }

      imageRecords.push({ id: post.id });
    }
    console.log(`   ✓ 创建 ${imageRecords.length} 个图片帖子`);

    // ============================== 评论 ==============================
    console.log("💬 创建评论...");
    let commentCount = 0;

    for (const video of videoRecords) {
      const existingCommentCount = await prisma.comment.count({ where: { videoId: video.id } });
      if (existingCommentCount > 0) continue;

      const count = randomInt(2, 8);
      const topIds: string[] = [];
      for (let c = 0; c < count; c++) {
        const isReply = c > 1 && topIds.length > 0 && Math.random() > 0.5;
        const comment = await prisma.comment.create({
          data: {
            content: pick(VIDEO_COMMENTS),
            userId: pick(allUserIds),
            videoId: video.id,
            parentId: isReply ? pick(topIds) : null,
            likes: randomInt(0, 20),
            createdAt: daysAgo(randomInt(0, 30)),
          },
        });
        if (!isReply) topIds.push(comment.id);
        commentCount++;
      }
    }

    for (const game of gameRecords.slice(0, 12)) {
      const existingCommentCount = await prisma.gameComment.count({ where: { gameId: game.id } });
      if (existingCommentCount > 0) continue;

      const count = randomInt(2, 5);
      for (let c = 0; c < count; c++) {
        await prisma.gameComment.create({
          data: {
            content: pick(GAME_COMMENTS),
            userId: pick(allUserIds),
            gameId: game.id,
            likes: randomInt(0, 10),
            createdAt: daysAgo(randomInt(0, 30)),
          },
        });
        commentCount++;
      }
    }

    for (const post of imageRecords) {
      const existingCommentCount = await prisma.imagePostComment.count({ where: { imagePostId: post.id } });
      if (existingCommentCount > 0) continue;

      const count = randomInt(1, 4);
      for (let c = 0; c < count; c++) {
        await prisma.imagePostComment.create({
          data: {
            content: pick(IMAGE_COMMENTS),
            userId: pick(allUserIds),
            imagePostId: post.id,
            likes: randomInt(0, 8),
            createdAt: daysAgo(randomInt(0, 20)),
          },
        });
        commentCount++;
      }
    }
    console.log(`   ✓ 创建 ${commentCount} 条评论`);

    // ============================== 互动数据 ==============================
    console.log("❤️  创建互动数据...");
    for (const userId of allUserIds) {
      for (const v of pickN(videoRecords, randomInt(5, 15))) {
        await prisma.like
          .create({ data: { userId, videoId: v.id, createdAt: daysAgo(randomInt(0, 45)) } })
          .catch(() => {});
      }
      for (const v of pickN(videoRecords, randomInt(2, 8))) {
        await prisma.favorite
          .create({ data: { userId, videoId: v.id, createdAt: daysAgo(randomInt(0, 45)) } })
          .catch(() => {});
      }
      for (const v of pickN(videoRecords, randomInt(5, 20))) {
        await prisma.watchHistory
          .create({
            data: { userId, videoId: v.id, progress: randomInt(0, 600), createdAt: daysAgo(randomInt(0, 30)) },
          })
          .catch(() => {});
      }
      for (const g of pickN(gameRecords, randomInt(2, 6))) {
        await prisma.gameLike
          .create({ data: { userId, gameId: g.id, createdAt: daysAgo(randomInt(0, 45)) } })
          .catch(() => {});
      }
      for (const g of pickN(gameRecords, randomInt(1, 4))) {
        await prisma.gameFavorite
          .create({ data: { userId, gameId: g.id, createdAt: daysAgo(randomInt(0, 45)) } })
          .catch(() => {});
      }
      for (const p of pickN(imageRecords, randomInt(1, 5))) {
        await prisma.imagePostLike
          .create({ data: { userId, imagePostId: p.id, createdAt: daysAgo(randomInt(0, 30)) } })
          .catch(() => {});
      }
      for (const p of pickN(imageRecords, randomInt(0, 3))) {
        await prisma.imagePostFavorite
          .create({ data: { userId, imagePostId: p.id, createdAt: daysAgo(randomInt(0, 30)) } })
          .catch(() => {});
      }
    }
    console.log(`   ✓ 创建互动数据（点赞、收藏、观看记录）`);

    // ============================== 播放列表 ==============================
    console.log("📋 创建播放列表...");
    const plUser = userRecords.find((u) => u.username === "viewer")!;
    const playlist = await prisma.playlist.upsert({
      where: { id: "seed-playlist-genshin-favorites" },
      update: { name: "原神合集收藏", description: "收藏的原神相关 3D 动画", isPublic: true, userId: plUser.id },
      create: {
        id: "seed-playlist-genshin-favorites",
        name: "原神合集收藏",
        description: "收藏的原神相关 3D 动画",
        isPublic: true,
        userId: plUser.id,
      },
    });
    const genshinVideos = videoRecords.filter((_, i) => DEMO_VIDEOS[i]?.tags.includes("genshin"));
    for (let i = 0; i < genshinVideos.length; i++) {
      await prisma.playlistItem
        .create({ data: { playlistId: playlist.id, videoId: genshinVideos[i].id, sortOrder: i } })
        .catch(() => {});
    }
    console.log("   ✓ 创建 1 个播放列表");

    // ============================== 关注 ==============================
    console.log("🤝 创建关注关系...");
    let followCount = 0;
    for (const user of userRecords) {
      for (const target of pickN(
        userRecords.filter((u) => u.id !== user.id),
        randomInt(1, 4),
      )) {
        await prisma.follow.create({ data: { followerId: user.id, followingId: target.id } }).catch(() => {});
        followCount++;
      }
    }
    console.log(`   ✓ 创建 ${followCount} 个关注关系`);

    // ============================== 通知 ==============================
    console.log("🔔 创建通知...");
    for (const user of userRecords.slice(0, 6)) {
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: "SYSTEM",
          title: "欢迎加入！",
          content: "感谢注册，快去探索精彩内容吧",
          createdAt: daysAgo(randomInt(10, 30)),
        },
      });
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: "LIKE",
          title: "有人给你的作品点赞了",
          content: "你的投稿获得了新的点赞！",
          data: { videoId: pick(videoRecords).id },
          createdAt: daysAgo(randomInt(0, 10)),
        },
      });
    }
    console.log("   ✓ 创建通知消息");

    // ============================== 留言板 ==============================
    console.log("📝 创建留言板消息...");
    for (const msg of GUESTBOOK_MESSAGES) {
      await prisma.guestbookMessage.create({
        data: { content: msg, userId: pick(allUserIds), likes: randomInt(0, 15), createdAt: daysAgo(randomInt(0, 60)) },
      });
    }
    console.log(`   ✓ 创建 ${GUESTBOOK_MESSAGES.length} 条留言`);

    // ============================== 友情链接 ==============================
    console.log("🔗 创建友情链接...");
    const friendLinks = [
      { name: "Bangumi", url: "https://bgm.tv", description: "番组计划 · 动画数据库" },
      { name: "DLsite", url: "https://www.dlsite.com", description: "同人作品贩售平台" },
      { name: "Pixiv", url: "https://www.pixiv.net", description: "插画 · 同人创作社区" },
    ];
    for (let i = 0; i < friendLinks.length; i++) {
      await prisma.friendLink.upsert({
        where: { id: `seed-friend-${i}` },
        update: {},
        create: { id: `seed-friend-${i}`, ...friendLinks[i], sort: friendLinks.length - i, visible: true },
      });
    }
    console.log(`   ✓ 创建 ${friendLinks.length} 个友情链接`);

    // ============================== 搜索记录 ==============================
    console.log("🔍 创建搜索记录...");
    const searchKeywords = [
      "原神",
      "星穹铁道",
      "绝区零",
      "守望先锋",
      "SLG",
      "ViciNeko",
      "蔚蓝档案",
      "3D",
      "RPG",
      "StarryMomoko",
    ];
    for (const keyword of searchKeywords) {
      await prisma.searchRecord.create({
        data: {
          keyword,
          userId: pick(allUserIds),
          resultCount: randomInt(3, 80),
          createdAt: daysAgo(randomInt(0, 14)),
        },
      });
    }
    console.log(`   ✓ 创建 ${searchKeywords.length} 条搜索记录`);

    // ============================== 完成 ==============================
    console.log("\n✅ Seed 完成！\n");
    console.log("📋 数据概览：");
    console.log(`   用户组: ${GROUP_SEEDS.length} 个`);
    console.log(`   标签分类: ${TAG_CATEGORIES.length} 个`);
    console.log(`   标签: ${totalTags} 个`);
    console.log(`   用户: ${userRecords.length} 个`);
    console.log(`   视频: ${videoRecords.length} 个`);
    console.log(`   游戏: ${gameRecords.length} 个`);
    console.log(`   图帖: ${imageRecords.length} 个`);
    console.log("");
    console.log("🔑 测试账号：");
    for (const u of USERS_DATA) {
      console.log(`   ${u.email} / password123 (${u.role}${u.canUpload ? ", 可投稿" : ""})`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
