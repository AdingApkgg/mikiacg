import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import sharp from "sharp";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// 允许的文件类型
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];

// 图片处理配置
interface ImageConfig {
  width: number;
  height: number;
  format: "webp" | "avif";
  quality: number;
  lossless: boolean;
}

const IMAGE_CONFIG: Record<string, ImageConfig> = {
  avatar: { 
    width: 256, 
    height: 256, 
    format: "avif",
    quality: 100,
    lossless: true,
  },
  cover: { 
    width: 1920,
    height: 1080, 
    format: "avif",
    quality: 100,
    lossless: true,
  },
  misc: { 
    width: 1920, 
    height: 1080, 
    format: "webp",
    quality: 85,
    lossless: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null; // avatar, cover, etc.
    const noCompress = formData.get("noCompress") === "true";

    if (!file) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }

    // 验证文件类型
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "不支持的文件类型，请上传 JPEG、PNG、GIF、WebP 或 AVIF 图片" },
        { status: 400 }
      );
    }

    // 检查大小限制
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // 确定上传目录
    const uploadType = type || "misc";
    const uploadPath = join(UPLOAD_DIR, uploadType);
    if (!existsSync(uploadPath)) {
      await mkdir(uploadPath, { recursive: true });
    }

    // 读取文件
    const bytes = await file.arrayBuffer();
    const inputBuffer = Buffer.from(bytes);
    const originalSize = inputBuffer.length;

    let outputBuffer: Buffer;
    let outputExt: string;
    let metadata: { width?: number; height?: number } = {};
    let compressionMode = "none";

    // GIF 保持原样
    if (file.type === "image/gif" || noCompress) {
      outputBuffer = inputBuffer;
      outputExt = file.name.split(".").pop() || "gif";
      compressionMode = "none";
    } else {
      const config = IMAGE_CONFIG[uploadType] || IMAGE_CONFIG.misc;
      
      try {
        // 获取原始图片信息
        const imageInfo = await sharp(inputBuffer).metadata();
        metadata = { width: imageInfo.width, height: imageInfo.height };
        
        // 使用 sharp 进行处理
        let sharpInstance = sharp(inputBuffer, { animated: false });
        
        // 根据类型调整尺寸
        if (uploadType === "avatar") {
          sharpInstance = sharpInstance
            .resize(config.width, config.height, {
              fit: "cover",
              position: "centre",
            });
        } else {
          sharpInstance = sharpInstance
            .resize(config.width, config.height, {
              fit: "inside",
              withoutEnlargement: true,
            });
        }
        
        // 根据配置选择输出格式
        if (config.format === "avif") {
          outputBuffer = await sharpInstance
            .avif({
              quality: config.quality,
              lossless: config.lossless,
              effort: 4,
            })
            .toBuffer();
          outputExt = "avif";
          compressionMode = config.lossless ? "lossless" : "lossy";
        } else {
          outputBuffer = await sharpInstance
            .webp({ 
              quality: config.quality, 
              effort: 4,
              lossless: config.lossless,
            })
            .toBuffer();
          outputExt = "webp";
          compressionMode = config.lossless ? "lossless" : "lossy";
        }
        
        // 如果压缩后比原图大很多，回退到有损压缩
        if (config.lossless && outputBuffer.length > originalSize * 1.5) {
          console.log(`无损压缩后体积过大，回退到有损压缩`);
          
          if (config.format === "avif") {
            outputBuffer = await sharp(inputBuffer)
              .resize(config.width, config.height, {
                fit: "inside",
                withoutEnlargement: true,
              })
              .avif({ quality: 85, lossless: false, effort: 4 })
              .toBuffer();
          } else {
            outputBuffer = await sharp(inputBuffer)
              .resize(config.width, config.height, {
                fit: "inside",
                withoutEnlargement: true,
              })
              .webp({ quality: 85, effort: 4 })
              .toBuffer();
          }
          compressionMode = "lossy-fallback";
        }
      } catch (sharpError) {
        console.error("Sharp processing error:", sharpError);
        outputBuffer = inputBuffer;
        outputExt = file.name.split(".").pop() || "jpg";
        compressionMode = "error-fallback";
      }
    }

    // 生成文件名
    const filename = `${session.user.id}-${Date.now()}.${outputExt}`;
    const filepath = join(uploadPath, filename);

    // 保存文件
    await writeFile(filepath, outputBuffer);

    // 计算压缩率
    const compressedSize = outputBuffer.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    // 返回访问 URL
    const url = `/uploads/${uploadType}/${filename}`;

    return NextResponse.json({
      url,
      success: true,
      originalSize,
      compressedSize,
      compressionRatio: `${compressionRatio}%`,
      format: outputExt,
      compressionMode,
      dimensions: metadata,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
