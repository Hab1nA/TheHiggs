// ============================================================
// Web Tools — 服务端联网能力（搜索 + 图片搜索 + 资源下载）
// ============================================================
//
// 搜索策略（多 Provider 降级链）：
//   webSearch:  Serper.dev → Bing HTML Scraping → 空结果
//   imageSearch: Serper.dev → Pixabay → Pexels → Bing Image Scraping → 空结果
//
// 安全原则：
//   1. 所有网络请求在服务端发起，客户端不可直接访问外网
//   2. AI 通过 tool calling 自主决定是否联网，非自动触发
//   3. 资源下载后转为 data URL 或代理 URL 嵌入 UI
//   4. 搜索结果经过安全清洗（去除脚本、追踪参数等）
//   5. 所有请求带超时保护，超时后 graceful fallback
//
// ============================================================

// -----------------------------------------------------------
// 类型定义
// -----------------------------------------------------------

export interface WebSearchParams {
  query: string;
  /** 最大结果数（默认 15，上限 30） */
  maxResults?: number;
  /** 搜索语言偏好（如 "zh-CN", "en"） */
  language?: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  /** 来源可信度标记 */
  sourceReliability: "high" | "medium" | "low";
}

export interface WebSearchOutput {
  query: string;
  results: WebSearchResult[];
  searchedAt: string;
  /** 使用的搜索提供者 */
  provider?: string;
  /** 如果搜索失败，这里给出原因 */
  error?: string;
}

// --- 图片搜索类型 ---

export interface ImageSearchParams {
  query: string;
  /** 最大结果数（默认 20，上限 50） */
  maxResults?: number;
  /** 图片类型过滤 */
  imageType?: "photo" | "illustration" | "all";
  /** 图片方向 */
  orientation?: "horizontal" | "vertical" | "all";
  /** 安全搜索级别 */
  safeSearch?: "strict" | "moderate" | "off";
}

export interface ImageSearchResult {
  title: string;
  /** 图片直链 URL（可直接下载） */
  imageUrl: string;
  /** 缩略图 URL */
  thumbnailUrl?: string;
  /** 图片来源页面 */
  sourceUrl: string;
  /** 来源网站名 */
  sourceName?: string;
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
}

export interface ImageSearchOutput {
  query: string;
  results: ImageSearchResult[];
  searchedAt: string;
  /** 使用的搜索提供者 */
  provider?: string;
  error?: string;
}

export interface ResourceDownloadParams {
  url: string;
  /** 期望的资源类型 */
  expectedType?: "image" | "json" | "text" | "auto";
  /** 图片最大边长（px，默认 1600） */
  maxImageWidth?: number;
  /** 超时毫秒（默认 30000） */
  timeoutMs?: number;
}

export interface ResourceDownloadOutput {
  url: string;
  /** MIME 类型 */
  contentType: string;
  /** 资源类型 */
  resourceType: "image" | "json" | "text" | "unknown";
  /** Data URL（对图片）或文本内容 */
  data: string;
  /** 原始字节大小 */
  byteSize: number;
  downloadedAt: string;
  /** 如果下载失败，这里给出原因 */
  error?: string;
}

// -----------------------------------------------------------
// 配置
// -----------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_SEARCH_RESULTS = 15;
const MAX_SEARCH_RESULTS = 30;
const DEFAULT_MAX_IMAGE_RESULTS = 20;
const MAX_IMAGE_RESULTS = 50;
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // 20 MB 上限

/** 允许下载的 Content-Type 白名单 */
const ALLOWED_CONTENT_TYPES = [
  "image/", // 通配：匹配所有 image/* 类型
  "application/octet-stream", // CDN 通用 fallback（许多图床用此代替正确 MIME）
  "application/json",
  "application/xml",
  "text/plain",
  "text/html",
  "text/xml",
];

/** 常见图片 URL 后缀（用于 Content-Type 为 octet-stream 时的回退判定） */
const IMAGE_URL_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
  ".svg",
  ".ico",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".jxl",
]);

/** 检查 URL 是否看起来像图片（基于路径扩展名） */
function urlLooksLikeImage(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    // 去除查询参数干扰后检查扩展名
    const dotIdx = pathname.lastIndexOf(".");
    if (dotIdx < 0) return false;
    const ext = pathname.slice(dotIdx).split("?")[0];
    return IMAGE_URL_EXTENSIONS.has(ext);
  } catch {
    return false;
  }
}

/** 根据 URL 扩展名猜测图片 MIME 类型（用于 octet-stream 回退） */
function guessImageMimeFromUrl(url: string): string {
  const extMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".jxl": "image/jxl",
  };
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const dotIdx = pathname.lastIndexOf(".");
    if (dotIdx >= 0) {
      const ext = pathname.slice(dotIdx).split("?")[0];
      if (extMap[ext]) return extMap[ext];
    }
  } catch {
    // ignore
  }
  return "image/jpeg"; // 默认假设 JPEG
}

/** 允许的图片 MIME 类型 */
const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
]);

// -----------------------------------------------------------
// API Keys（从环境变量读取）
// -----------------------------------------------------------

const SERPER_API_KEY = process.env.SERPER_API_KEY;
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

if (SERPER_API_KEY) console.log("[WebTools] Serper.dev API key configured");
if (PIXABAY_API_KEY) console.log("[WebTools] Pixabay API key configured");
if (PEXELS_API_KEY) console.log("[WebTools] Pexels API key configured");
if (!SERPER_API_KEY && !PIXABAY_API_KEY && !PEXELS_API_KEY) {
  console.log(
    "[WebTools] No search API keys — using Bing scraping fallback (free, no key needed)",
  );
}

// -----------------------------------------------------------
// Proxy-Aware Fetch — 通过 WEB_PROXY_URL 环境变量配置代理
// -----------------------------------------------------------

import type { Dispatcher } from "undici";
import { ProxyAgent, fetch as undiciFetch } from "undici";

/** 代理 dispatcher（如果 WEB_PROXY_URL 存在） */
const PROXY_URL = process.env.WEB_PROXY_URL;
const PROXY_DISPATCHER: Dispatcher | undefined = PROXY_URL
  ? new ProxyAgent(PROXY_URL)
  : undefined;

if (PROXY_URL) {
  console.log("[WebTools] Proxy configured:", PROXY_URL);
} else {
  console.log("[WebTools] No WEB_PROXY_URL set, using direct fetch");
}

/** Proxy-aware fetch：有代理时走 undici ProxyAgent，否则走全局 fetch */
async function proxyFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  if (PROXY_DISPATCHER) {
    return (await undiciFetch(
      input as string,
      {
        ...init,
        dispatcher: PROXY_DISPATCHER,
      } as Parameters<typeof undiciFetch>[1],
    )) as unknown as Response;
  }
  return globalThis.fetch(input, init);
}

// -----------------------------------------------------------
// 通用浏览器 Headers
// -----------------------------------------------------------

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
};

// ============================================================
// Provider 1: Serper.dev（Google 搜索结果，推荐）
// ============================================================

interface SerperOrganicResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
}

interface SerperImageResult {
  title: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  thumbnailUrl?: string;
  source?: string;
  domain?: string;
  link?: string;
  position?: number;
}

interface SerperWebResponse {
  organic?: SerperOrganicResult[];
}

interface SerperImageResponse {
  images?: SerperImageResult[];
}

async function searchViaSerper(
  params: WebSearchParams,
): Promise<WebSearchOutput | null> {
  if (!SERPER_API_KEY) return null;

  const limit = Math.min(
    params.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
    MAX_SEARCH_RESULTS,
  );

  try {
    const response = await proxyFetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: params.query,
        num: limit,
        gl: params.language === "zh-CN" ? "cn" : "us",
        hl: params.language === "zh-CN" ? "zh-cn" : "en",
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[WebTools] Serper web search HTTP", response.status);
      return null;
    }

    const data = (await response.json()) as SerperWebResponse;
    const results: WebSearchResult[] = (data.organic ?? [])
      .slice(0, limit)
      .map((r) => ({
        title: r.title,
        url: r.link,
        snippet: r.snippet ?? "",
        sourceReliability: "high" as const,
      }));

    return {
      query: params.query,
      results,
      searchedAt: new Date().toISOString(),
      provider: "serper",
    };
  } catch (err) {
    console.warn(
      "[WebTools] Serper search failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function searchImagesViaSerper(
  params: ImageSearchParams,
): Promise<ImageSearchOutput | null> {
  if (!SERPER_API_KEY) return null;

  const limit = Math.min(
    params.maxResults ?? DEFAULT_MAX_IMAGE_RESULTS,
    MAX_IMAGE_RESULTS,
  );

  try {
    const response = await proxyFetch("https://google.serper.dev/images", {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: params.query,
        num: limit,
        gl: "us",
        hl: "en",
      }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[WebTools] Serper image search HTTP", response.status);
      return null;
    }

    const data = (await response.json()) as SerperImageResponse;
    const results: ImageSearchResult[] = (data.images ?? [])
      .slice(0, limit)
      .map((img) => ({
        title: img.title,
        imageUrl: img.imageUrl,
        thumbnailUrl: img.thumbnailUrl,
        sourceUrl: img.link ?? img.imageUrl,
        sourceName: img.domain ?? img.source,
        width: img.imageWidth,
        height: img.imageHeight,
      }));

    return {
      query: params.query,
      results,
      searchedAt: new Date().toISOString(),
      provider: "serper",
    };
  } catch (err) {
    console.warn(
      "[WebTools] Serper image search failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ============================================================
// Provider 2: Bing HTML Scraping（免费，无需 API Key）
// ============================================================

async function searchViaBingScraping(
  params: WebSearchParams,
): Promise<WebSearchOutput | null> {
  const limit = Math.min(
    params.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS,
    MAX_SEARCH_RESULTS,
  );

  const encodedQuery = encodeURIComponent(params.query);
  const langParam =
    params.language === "zh-CN" ? "&setlang=zh-CN" : "&setlang=en";
  const url = `https://www.bing.com/search?q=${encodedQuery}${langParam}&count=${limit}`;

  try {
    const response = await proxyFetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[WebTools] Bing scraping HTTP", response.status);
      return null;
    }

    const html = await response.text();
    const results = parseBingSearchResults(html, limit);

    if (results.length === 0) {
      console.warn("[WebTools] Bing scraping returned 0 results");
      return null;
    }

    return {
      query: params.query,
      results,
      searchedAt: new Date().toISOString(),
      provider: "bing-scraping",
    };
  } catch (err) {
    console.warn(
      "[WebTools] Bing scraping failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** 解析 Bing 搜索结果 HTML */
function parseBingSearchResults(
  html: string,
  limit: number,
): WebSearchResult[] {
  const results: WebSearchResult[] = [];

  // Bing result pattern: <li class="b_algo">...<h2><a href="URL">TITLE</a></h2>...<p>SNIPPET</p>...</li>
  const resultPattern =
    /<li\s+class="b_algo"[^>]*>[\s\S]*?<h2[^>]*>\s*<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?[\s\S]*?<\/li>/gi;

  let match: RegExpExecArray | null;
  while (
    (match = resultPattern.exec(html)) !== null &&
    results.length < limit
  ) {
    const resultUrl = match[1];
    const title = stripHtmlTags(match[2]).trim();
    const snippet = match[3] ? stripHtmlTags(match[3]).trim() : "";

    if (!title || !resultUrl) continue;

    // Skip Bing's own results and ad links
    if (
      resultUrl.includes("bing.com/search") ||
      resultUrl.includes("go.microsoft.com") ||
      resultUrl.includes("bing.com/aclick")
    ) {
      continue;
    }

    results.push({
      title,
      url: resultUrl,
      snippet,
      sourceReliability: "medium",
    });
  }

  return results;
}

async function searchImagesViaBingScraping(
  params: ImageSearchParams,
): Promise<ImageSearchOutput | null> {
  const limit = Math.min(
    params.maxResults ?? DEFAULT_MAX_IMAGE_RESULTS,
    MAX_IMAGE_RESULTS,
  );

  const encodedQuery = encodeURIComponent(params.query);
  const url = `https://www.bing.com/images/search?q=${encodedQuery}&form=HDRSC3&first=1&tsc=ImageHoverTitle`;

  try {
    const response = await proxyFetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn("[WebTools] Bing image scraping HTTP", response.status);
      return null;
    }

    const html = await response.text();
    const results = parseBingImageResults(html, limit, params.query);

    if (results.length === 0) {
      console.warn("[WebTools] Bing image scraping returned 0 results");
      return null;
    }

    return {
      query: params.query,
      results,
      searchedAt: new Date().toISOString(),
      provider: "bing-image-scraping",
    };
  } catch (err) {
    console.warn(
      "[WebTools] Bing image scraping failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** 解析 Bing 图片搜索结果 */
function parseBingImageResults(
  html: string,
  limit: number,
  query: string,
): ImageSearchResult[] {
  const results: ImageSearchResult[] = [];

  // Strategy 1: Parse m= attribute which contains HTML-entity-encoded JSON
  // Format: m="{&quot;murl&quot;:&quot;URL&quot;,&quot;turl&quot;:&quot;THUMB&quot;,&quot;t&quot;:&quot;TITLE&quot;,...}"
  const mAttrPattern = /\bm="(\{[^"]{100,})"/g;
  let match: RegExpExecArray | null;
  while ((match = mAttrPattern.exec(html)) !== null && results.length < limit) {
    const data = decodeHtmlEntities(match[1]);
    const murlMatch = data.match(/"murl"\s*:\s*"(https?:[^"]+)"/);
    const turlMatch = data.match(/"turl"\s*:\s*"(https?:[^"]+)"/);
    const titleMatch = data.match(/"t"\s*:\s*"([^"]+)"/);
    const purlMatch = data.match(/"purl"\s*:\s*"(https?:[^"]+)"/);

    if (!murlMatch) continue;

    const imageUrl = murlMatch[1];
    try {
      new URL(imageUrl);
    } catch {
      continue;
    }

    results.push({
      title: titleMatch?.[1] || query,
      imageUrl,
      thumbnailUrl: turlMatch?.[1],
      sourceUrl: purlMatch?.[1] || imageUrl,
      sourceName: extractDomain(purlMatch?.[1] || imageUrl),
    });
  }

  // Strategy 2: Fallback — parse murl&quot; directly
  if (results.length === 0) {
    const murlPrefix = "murl&quot;:&quot;";
    let idx = 0;
    while (
      (idx = html.indexOf(murlPrefix, idx)) !== -1 &&
      results.length < limit
    ) {
      const start = idx + murlPrefix.length;
      const end = html.indexOf("&quot;", start);
      if (end === -1) break;

      const imageUrl = decodeHtmlEntities(html.substring(start, end));
      try {
        new URL(imageUrl);
      } catch {
        idx = end + 6;
        continue;
      }

      // Look for turl and title in the next 1000 chars
      const after = html.substring(end, end + 1000);
      const turlPrefix = "turl&quot;:&quot;";
      const turlIdx = after.indexOf(turlPrefix);
      let thumbnailUrl: string | undefined;
      if (turlIdx >= 0) {
        const turlStart = turlIdx + turlPrefix.length;
        const turlEnd = after.indexOf("&quot;", turlStart);
        if (turlEnd !== -1) {
          thumbnailUrl = decodeHtmlEntities(
            after.substring(turlStart, turlEnd),
          );
        }
      }

      const titlePrefix = "t&quot;:&quot;";
      const titleIdx = after.indexOf(titlePrefix);
      let title = query;
      if (titleIdx >= 0) {
        const titleStart = titleIdx + titlePrefix.length;
        const titleEnd = after.indexOf("&quot;", titleStart);
        if (titleEnd !== -1) {
          title = decodeHtmlEntities(after.substring(titleStart, titleEnd));
        }
      }

      results.push({
        title,
        imageUrl,
        thumbnailUrl,
        sourceUrl: imageUrl,
        sourceName: extractDomain(imageUrl),
      });

      idx = end + 6;
    }
  }

  return results;
}

// ============================================================
// Provider 3: Pixabay（免费图片搜索 API）
// ============================================================

interface PixabayHit {
  id: number;
  tags: string;
  webformatURL: string;
  largeImageURL: string;
  previewURL: string;
  imageWidth: number;
  imageHeight: number;
  pageURL: string;
  user: string;
}

interface PixabayResponse {
  total: number;
  totalHits: number;
  hits: PixabayHit[];
}

async function searchImagesViaPixabay(
  params: ImageSearchParams,
): Promise<ImageSearchOutput | null> {
  if (!PIXABAY_API_KEY) return null;

  const limit = Math.min(
    params.maxResults ?? DEFAULT_MAX_IMAGE_RESULTS,
    MAX_IMAGE_RESULTS,
  );

  const imageTypeMap: Record<string, string> = {
    photo: "photo",
    illustration: "illustration",
    all: "all",
  };

  const searchParams = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q: params.query,
    image_type: imageTypeMap[params.imageType ?? "all"] ?? "all",
    per_page: String(limit),
    safesearch: params.safeSearch === "off" ? "false" : "true",
  });

  if (params.orientation && params.orientation !== "all") {
    searchParams.set("orientation", params.orientation);
  }

  try {
    const response = await proxyFetch(
      `https://pixabay.com/api/?${searchParams}`,
      {
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.warn("[WebTools] Pixabay API HTTP", response.status);
      return null;
    }

    const data = (await response.json()) as PixabayResponse;

    if (!data.hits || data.hits.length === 0) {
      return {
        query: params.query,
        results: [],
        searchedAt: new Date().toISOString(),
        provider: "pixabay",
        error: "No images found",
      };
    }

    const results: ImageSearchResult[] = data.hits.map((hit) => ({
      title: hit.tags || params.query,
      imageUrl: hit.largeImageURL || hit.webformatURL,
      thumbnailUrl: hit.previewURL || hit.webformatURL,
      sourceUrl: hit.pageURL,
      sourceName: "Pixabay",
      width: hit.imageWidth,
      height: hit.imageHeight,
    }));

    return {
      query: params.query,
      results,
      searchedAt: new Date().toISOString(),
      provider: "pixabay",
    };
  } catch (err) {
    console.warn(
      "[WebTools] Pixabay search failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ============================================================
// Provider 4: Pexels（免费图片搜索 API）
// ============================================================

interface PexelsPhoto {
  id: number;
  url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
  width: number;
  height: number;
  photographer: string;
}

interface PexelsResponse {
  photos: PexelsPhoto[];
  total_results: number;
}

async function searchImagesViaPexels(
  params: ImageSearchParams,
): Promise<ImageSearchOutput | null> {
  if (!PEXELS_API_KEY) return null;

  const limit = Math.min(
    params.maxResults ?? DEFAULT_MAX_IMAGE_RESULTS,
    MAX_IMAGE_RESULTS,
  );

  const searchParams = new URLSearchParams({
    query: params.query,
    per_page: String(limit),
    orientation:
      params.orientation === "all" ? "all" : (params.orientation ?? "all"),
  });

  try {
    const response = await proxyFetch(
      `https://api.pexels.com/v1/search?${searchParams}`,
      {
        headers: {
          Authorization: PEXELS_API_KEY,
        },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      },
    );

    if (!response.ok) {
      console.warn("[WebTools] Pexels API HTTP", response.status);
      return null;
    }

    const data = (await response.json()) as PexelsResponse;

    if (!data.photos || data.photos.length === 0) {
      return {
        query: params.query,
        results: [],
        searchedAt: new Date().toISOString(),
        provider: "pexels",
        error: "No images found",
      };
    }

    const results: ImageSearchResult[] = data.photos.map((photo) => ({
      title: photo.alt || params.query,
      imageUrl: photo.src.large2x || photo.src.large || photo.src.original,
      thumbnailUrl: photo.src.medium || photo.src.small,
      sourceUrl: photo.url,
      sourceName: "Pexels",
      width: photo.width,
      height: photo.height,
    }));

    return {
      query: params.query,
      results,
      searchedAt: new Date().toISOString(),
      provider: "pexels",
    };
  } catch (err) {
    console.warn(
      "[WebTools] Pexels search failed:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ============================================================
// 搜索编排（Fallback Chain）
// ============================================================

/**
 * 网络搜索 — 多 Provider 降级链
 * 优先级：Serper.dev → Bing HTML Scraping
 */
export async function webSearch(
  params: WebSearchParams,
): Promise<WebSearchOutput> {
  // Provider 1: Serper.dev (Google 搜索，最高质量)
  const serperResult = await searchViaSerper(params);
  if (serperResult && serperResult.results.length > 0) {
    console.log(
      `[WebTools] webSearch via serper: ${serperResult.results.length} results`,
    );
    return serperResult;
  }

  // Provider 2: Bing HTML Scraping (免费，无需 key)
  const bingResult = await searchViaBingScraping(params);
  if (bingResult && bingResult.results.length > 0) {
    console.log(
      `[WebTools] webSearch via bing-scraping: ${bingResult.results.length} results`,
    );
    return bingResult;
  }

  // 所有 Provider 都失败
  console.warn("[WebTools] All web search providers failed");
  return {
    query: params.query,
    results: [],
    searchedAt: new Date().toISOString(),
    error:
      "All search providers failed. Configure SERPER_API_KEY for best results, or check network connectivity.",
  };
}

/**
 * 图片搜索 — 多 Provider 降级链
 * 优先级：Serper.dev → Pixabay → Pexels → Bing Image Scraping
 */
export async function imageSearch(
  params: ImageSearchParams,
): Promise<ImageSearchOutput> {
  // Provider 1: Serper.dev (Google 图片搜索，最高质量)
  const serperResult = await searchImagesViaSerper(params);
  if (serperResult && serperResult.results.length > 0) {
    console.log(
      `[WebTools] imageSearch via serper: ${serperResult.results.length} results`,
    );
    return serperResult;
  }

  // Provider 2: Pixabay (免费图片 API，高质量)
  const pixabayResult = await searchImagesViaPixabay(params);
  if (pixabayResult && pixabayResult.results.length > 0) {
    console.log(
      `[WebTools] imageSearch via pixabay: ${pixabayResult.results.length} results`,
    );
    return pixabayResult;
  }

  // Provider 3: Pexels (免费图片 API)
  const pexelsResult = await searchImagesViaPexels(params);
  if (pexelsResult && pexelsResult.results.length > 0) {
    console.log(
      `[WebTools] imageSearch via pexels: ${pexelsResult.results.length} results`,
    );
    return pexelsResult;
  }

  // Provider 4: Bing Image Scraping (免费，无需 key)
  const bingResult = await searchImagesViaBingScraping(params);
  if (bingResult && bingResult.results.length > 0) {
    console.log(
      `[WebTools] imageSearch via bing-image-scraping: ${bingResult.results.length} results`,
    );
    return bingResult;
  }

  // 所有 Provider 都失败
  console.warn("[WebTools] All image search providers failed");
  return {
    query: params.query,
    results: [],
    searchedAt: new Date().toISOString(),
    error:
      "All image search providers failed. Configure PIXABAY_API_KEY or SERPER_API_KEY for best results.",
  };
}

// -----------------------------------------------------------
// Resource Download 实现
// -----------------------------------------------------------

/**
 * 从指定 URL 下载资源，并转换为安全格式嵌入 UI。
 * - 图片 → data: URL（base64）
 * - JSON/文本 → 原样返回
 * - 自动检测 MIME 类型
 * - 超时 & 大小限制保护
 */
export async function downloadResource(
  params: ResourceDownloadParams,
): Promise<ResourceDownloadOutput> {
  const { url, expectedType = "auto", timeoutMs = DEFAULT_TIMEOUT_MS } = params;

  // 基本 URL 校验：仅允许 http/https
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return createDownloadError(url, "Invalid URL format");
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return createDownloadError(
      url,
      `Protocol "${parsedUrl.protocol}" not allowed. Only http/https.`,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await proxyFetch(url, {
      signal: controller.signal,
      headers: {
        ...BROWSER_HEADERS,
        Accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: parsedUrl.origin + "/",
      },
    });

    if (!response.ok) {
      // 重试策略：
      //   1) 400/403/429 → 不带 Referer 重试（常见反盗链）
      //   2) 5xx / 非标准码（如花瓣 CDN 的 567）→ 先不带 Referer 重试，再尝试最小 Headers
      const shouldRetry =
        [400, 403, 429].includes(response.status) || response.status >= 500;
      if (shouldRetry) {
        // 第一次重试：不带 Referer
        console.warn(
          `[WebTools] Download got HTTP ${response.status}, retrying without Referer...`,
        );
        const retryController = new AbortController();
        const retryTimeout = setTimeout(
          () => retryController.abort(),
          timeoutMs,
        );
        try {
          const retryResponse = await proxyFetch(url, {
            signal: retryController.signal,
            headers: {
              "User-Agent": BROWSER_HEADERS["User-Agent"],
              Accept: "image/*,*/*;q=0.8",
            },
          });
          clearTimeout(retryTimeout);
          if (retryResponse.ok) {
            return await processDownloadResponse(
              url,
              retryResponse,
              expectedType,
            );
          }

          // 第二次重试（仅 5xx / 非标准码）：最小化 Headers
          if (response.status >= 500) {
            console.warn(
              `[WebTools] Retry got HTTP ${retryResponse.status}, trying minimal headers...`,
            );
            const minimalController = new AbortController();
            const minimalTimeout = setTimeout(
              () => minimalController.abort(),
              timeoutMs,
            );
            try {
              const minimalResponse = await globalThis.fetch(url, {
                signal: minimalController.signal,
              });
              clearTimeout(minimalTimeout);
              if (minimalResponse.ok) {
                return await processDownloadResponse(
                  url,
                  minimalResponse,
                  expectedType,
                );
              }
            } catch {
              clearTimeout(minimalTimeout);
            }
          }
        } catch {
          clearTimeout(retryTimeout);
        }
      }
      return createDownloadError(
        url,
        `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    return await processDownloadResponse(url, response, expectedType);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[WebTools] Download failed:", url, errMsg);
    return createDownloadError(url, errMsg);
  } finally {
    clearTimeout(timeout);
  }
}

/** 处理下载响应（提取为独立函数以支持重试） */
async function processDownloadResponse(
  url: string,
  response: Response,
  expectedType: ResourceDownloadParams["expectedType"],
): Promise<ResourceDownloadOutput> {
  // 检查 Content-Length
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_DOWNLOAD_BYTES) {
    return createDownloadError(
      url,
      `Resource too large (${contentLength} bytes, max ${MAX_DOWNLOAD_BYTES})`,
    );
  }

  // 获取原始数据
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_DOWNLOAD_BYTES) {
    return createDownloadError(
      url,
      `Resource too large (${arrayBuffer.byteLength} bytes, max ${MAX_DOWNLOAD_BYTES})`,
    );
  }

  // 确定 Content-Type
  let contentType =
    response.headers.get("content-type") ?? "application/octet-stream";
  // 去除 charset 等参数
  const semicolonIdx = contentType.indexOf(";");
  if (semicolonIdx > 0) contentType = contentType.slice(0, semicolonIdx).trim();

  // 检查 Content-Type 白名单
  const ctLower = contentType.toLowerCase();
  let isAllowed = ALLOWED_CONTENT_TYPES.some((allowed) =>
    ctLower.startsWith(allowed),
  );

  // 回退：当 Content-Type 为 application/octet-stream 时，检查 URL 扩展名
  // 很多 CDN/图床返回 octet-stream 但实际是图片
  if (!isAllowed && ctLower === "application/octet-stream") {
    if (urlLooksLikeImage(url)) {
      isAllowed = true;
      console.log(
        `[WebTools] Content-Type "${contentType}" accepted via URL extension hint for ${url}`,
      );
    }
  }

  if (!isAllowed) {
    return createDownloadError(
      url,
      `Content-Type "${contentType}" not in allowed list`,
    );
  }

  // 确定资源类型
  const isImage =
    IMAGE_CONTENT_TYPES.has(contentType) ||
    contentType.startsWith("image/") ||
    (ctLower === "application/octet-stream" && urlLooksLikeImage(url));
  const isJson = contentType.includes("json");
  const isText = contentType.startsWith("text/");

  // 如果 octet-stream 被识别为图片，修正 contentType 以确保 data URL 正确
  if (isImage && ctLower === "application/octet-stream") {
    contentType = guessImageMimeFromUrl(url);
  }

  const resourceType = isImage
    ? "image"
    : isJson
      ? "json"
      : isText
        ? "text"
        : "unknown";

  // 转换数据
  let data: string;
  if (isImage && expectedType !== "json" && expectedType !== "text") {
    const base64 = arrayBufferToBase64(arrayBuffer);
    data = `data:${contentType};base64,${base64}`;
  } else if (isJson || isText) {
    data = new TextDecoder("utf-8").decode(arrayBuffer);
  } else {
    const base64 = arrayBufferToBase64(arrayBuffer);
    data = `data:${contentType};base64,${base64}`;
  }

  return {
    url,
    contentType,
    resourceType,
    data,
    byteSize: arrayBuffer.byteLength,
    downloadedAt: new Date().toISOString(),
  };
}

// -----------------------------------------------------------
// 工具函数
// -----------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function createDownloadError(
  url: string,
  error: string,
): ResourceDownloadOutput {
  return {
    url,
    contentType: "",
    resourceType: "unknown",
    data: "",
    byteSize: 0,
    downloadedAt: new Date().toISOString(),
    error,
  };
}

/** 去除 HTML 标签 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 解码 HTML 实体 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
}

/** 从 URL 提取域名 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// -----------------------------------------------------------
// 批量操作
// -----------------------------------------------------------

/** 同时下载多个资源 */
export async function downloadResources(
  urls: string[],
  opts?: Omit<ResourceDownloadParams, "url">,
): Promise<ResourceDownloadOutput[]> {
  const results = await Promise.allSettled(
    urls.map((url) => downloadResource({ url, ...opts })),
  );
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : createDownloadError("unknown", r.reason?.message ?? "Unknown error"),
  );
}

/** 批量搜索多个查询 */
export async function webSearchBatch(
  queries: string[],
  opts?: Omit<WebSearchParams, "query">,
): Promise<WebSearchOutput[]> {
  const results = await Promise.allSettled(
    queries.map((query) => webSearch({ query, ...opts })),
  );
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          query: "unknown",
          results: [],
          searchedAt: new Date().toISOString(),
          error: r.reason?.message,
        },
  );
}

/** 批量图片搜索 */
export async function imageSearchBatch(
  queries: string[],
  opts?: Omit<ImageSearchParams, "query">,
): Promise<ImageSearchOutput[]> {
  const results = await Promise.allSettled(
    queries.map((query) => imageSearch({ query, ...opts })),
  );
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          query: "unknown",
          results: [],
          searchedAt: new Date().toISOString(),
          error: r.reason?.message,
        },
  );
}
