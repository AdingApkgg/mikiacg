import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.mikiacg.vip";
  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "Mikiacg";

  const openapi = `openapi: 3.1.0
info:
  title: ${siteName} API
  description: |
    ${siteName} 是一个 ACGN（动画、漫画、游戏、轻小说）流式媒体内容分享平台。
    
    本 API 文档描述了网站的公开端点和数据结构，主要用于 AI 代理和搜索引擎理解网站内容。
    
    ## 主要功能
    - 浏览 ACGN 相关视频内容
    - 浏览 ACGN 相关游戏资源
    - 按标签分类查找视频和游戏（视频和游戏标签独立管理）
    - 查看用户主页和上传内容
    - 搜索视频
    
    ## 数据源
    - RSS Feed: ${baseUrl}/feed.xml
    - Sitemap: ${baseUrl}/sitemap.xml
    - LLMs.txt: ${baseUrl}/llms.txt
  version: 2.0.0
  contact:
    email: contact@saop.cc
  license:
    name: MIT
    url: https://opensource.org/licenses/MIT

servers:
  - url: ${baseUrl}
    description: Production server

paths:
  /:
    get:
      operationId: getHomepage
      summary: 首页
      description: 获取网站首页，展示最新和热门视频
      responses:
        '200':
          description: HTML 页面
          content:
            text/html:
              schema:
                type: string

  /video/{id}:
    get:
      operationId: getVideo
      summary: 视频详情页
      description: 获取单个视频的详细信息，包括标题、描述、上传者、标签等
      parameters:
        - name: id
          in: path
          required: true
          description: 视频唯一标识符
          schema:
            type: string
      responses:
        '200':
          description: 视频详情页面
          content:
            text/html:
              schema:
                type: string
        '404':
          description: 视频不存在

  /game:
    get:
      operationId: getGameList
      summary: 游戏列表
      description: 获取游戏资源列表，支持按类型、标签筛选和排序
      responses:
        '200':
          description: 游戏列表页面
          content:
            text/html:
              schema:
                type: string

  /game/{id}:
    get:
      operationId: getGame
      summary: 游戏详情页
      description: 获取单个游戏的详细信息，包括标题、类型、描述、截图、下载链接等
      parameters:
        - name: id
          in: path
          required: true
          description: 游戏唯一标识符
          schema:
            type: string
      responses:
        '200':
          description: 游戏详情页面
          content:
            text/html:
              schema:
                type: string
        '404':
          description: 游戏不存在

  /video/tag/{slug}:
    get:
      operationId: getVideoTagList
      summary: 视频标签列表
      description: 获取特定标签下的所有视频
      parameters:
        - name: slug
          in: path
          required: true
          description: 标签 slug
          schema:
            type: string
      responses:
        '200':
          description: 视频标签页面
          content:
            text/html:
              schema:
                type: string

  /game/tag/{slug}:
    get:
      operationId: getGameTagList
      summary: 游戏标签列表
      description: 获取特定标签下的所有游戏
      parameters:
        - name: slug
          in: path
          required: true
          description: 标签 slug
          schema:
            type: string
      responses:
        '200':
          description: 游戏标签页面
          content:
            text/html:
              schema:
                type: string

  /user/{id}:
    get:
      operationId: getUserProfile
      summary: 用户主页
      description: 获取用户的公开资料和上传的视频、游戏
      parameters:
        - name: id
          in: path
          required: true
          description: 用户唯一标识符
          schema:
            type: string
      responses:
        '200':
          description: 用户主页
          content:
            text/html:
              schema:
                type: string

  /search:
    get:
      operationId: searchContent
      summary: 搜索内容
      description: 根据关键词搜索视频和游戏
      parameters:
        - name: q
          in: query
          required: false
          description: 搜索关键词
          schema:
            type: string
      responses:
        '200':
          description: 搜索结果页面
          content:
            text/html:
              schema:
                type: string

  /tags:
    get:
      operationId: getAllTags
      summary: 标签列表
      description: 获取所有可用标签，分为视频标签和游戏标签两类
      responses:
        '200':
          description: 标签列表页面
          content:
            text/html:
              schema:
                type: string

  /feed.xml:
    get:
      operationId: getRssFeed
      summary: RSS Feed
      description: 获取最新视频和游戏的 RSS 订阅源
      responses:
        '200':
          description: RSS XML
          content:
            application/rss+xml:
              schema:
                type: string

  /sitemap.xml:
    get:
      operationId: getSitemap
      summary: Sitemap
      description: 获取网站地图
      responses:
        '200':
          description: Sitemap XML
          content:
            application/xml:
              schema:
                type: string

  /llms.txt:
    get:
      operationId: getLlmsTxt
      summary: LLMs.txt
      description: AI 友好的网站描述文件
      responses:
        '200':
          description: 纯文本描述
          content:
            text/plain:
              schema:
                type: string

components:
  schemas:
    Video:
      type: object
      description: 视频对象
      properties:
        id:
          type: string
          description: 唯一标识符
        title:
          type: string
          description: 视频标题
        description:
          type: string
          nullable: true
          description: 视频描述
        coverUrl:
          type: string
          nullable: true
          description: 封面图片 URL
        videoUrl:
          type: string
          description: 视频播放 URL
        duration:
          type: integer
          nullable: true
          description: 视频时长（秒）
        views:
          type: integer
          description: 观看次数
        createdAt:
          type: string
          format: date-time
          description: 创建时间
        uploader:
          $ref: '#/components/schemas/User'
        tags:
          type: array
          items:
            $ref: '#/components/schemas/Tag'

    Game:
      type: object
      description: 游戏对象
      properties:
        id:
          type: string
          description: 唯一标识符（6 位数字）
        title:
          type: string
          description: 游戏标题
        description:
          type: string
          nullable: true
          description: 游戏介绍
        coverUrl:
          type: string
          nullable: true
          description: 封面图片 URL
        gameType:
          type: string
          nullable: true
          description: 游戏类型（ADV/SLG/RPG/ACT/STG/PZL/AVG/FTG/TAB/OTHER）
        isFree:
          type: boolean
          description: 是否免费
        version:
          type: string
          nullable: true
          description: 游戏版本号
        views:
          type: integer
          description: 浏览次数
        createdAt:
          type: string
          format: date-time
          description: 创建时间
        uploader:
          $ref: '#/components/schemas/User'
        tags:
          type: array
          items:
            $ref: '#/components/schemas/Tag'

    User:
      type: object
      description: 用户对象
      properties:
        id:
          type: string
          description: 唯一标识符
        username:
          type: string
          description: 用户名
        nickname:
          type: string
          nullable: true
          description: 昵称
        avatar:
          type: string
          nullable: true
          description: 头像 URL
        bio:
          type: string
          nullable: true
          description: 个人简介

    Tag:
      type: object
      description: 标签对象
      properties:
        id:
          type: string
          description: 唯一标识符
        name:
          type: string
          description: 标签名称
        slug:
          type: string
          description: URL 友好的标识符
`;

  return new NextResponse(openapi, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
