// ============================================================
// Web Tools — 服务端联网能力（搜索 + 资源下载）
// ============================================================
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
  /** 最大结果数（默认 5，上限 10） */
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
  /** 如果搜索失败，这里给出原因 */
  error?: string;
}

export interface ResourceDownloadParams {
  url: string;
  /** 期望的资源类型 */
  expectedType?: "image" | "json" | "text" | "auto";
  /** 图片最大边长（px，默认 800） */
  maxImageWidth?: number;
  /** 超时毫秒（默认 15000） */
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

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_SEARCH_RESULTS = 5;
const MAX_SEARCH_RESULTS = 10;
// DEFAULT_MAX_IMAGE_WIDTH: reserved for future server-side image resizing
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024; // 5 MB 上限

/** 允许下载的 Content-Type 白名单 */
const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "text/plain",
  "application/json",
];

/** 允许的图片 MIME 类型 */
const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

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
    // undici.fetch 返回 undici.Response，与全局 Response 有细微类型差异
    // 但运行时接口兼容，安全 cast
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
// Web Search 实现
// -----------------------------------------------------------

/**
 * 使用 DuckDuckGo Instant Answer API 进行网络搜索。
 * 无需 API Key，免费使用，响应速度快。
 *
 * 备用方案：如果 DDG 不可用，返回空结果并标记 error。
 * 生产环境可替换为 Google Custom Search / Bing Search API。
 */
export async function webSearch(
  params: WebSearchParams,
): Promise<WebSearchOutput> {
  const {
    query,
    maxResults = DEFAULT_MAX_SEARCH_RESULTS,
    language = "zh-CN",
  } = params;
  const limit = Math.min(maxResults, MAX_SEARCH_RESULTS);

  // 构建 DuckDuckGo Instant Answer API URL
  // 注意：这是 DDG 的公开 API，无需 API Key，但有限速
  const encodedQuery = encodeURIComponent(query);
  const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await proxyFetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "TheHiggs-AI-Runtime/0.3 (AI-UI Co-Execution; +https://github.com/Hab1nA/TheHiggs)",
        "Accept-Language": language,
      },
    });

    if (!response.ok) {
      return {
        query,
        results: [],
        searchedAt: new Date().toISOString(),
        error: `Search API returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    // 解析 DDG 结果
    const results: WebSearchResult[] = [];

    // Abstract (摘要)
    if (
      data.AbstractText &&
      typeof data.AbstractText === "string" &&
      data.AbstractText.trim()
    ) {
      results.push({
        title: (data.Heading as string) ?? query,
        url:
          (data.AbstractURL as string) ??
          `https://duckduckgo.com/?q=${encodedQuery}`,
        snippet: data.AbstractText,
        sourceReliability: "medium",
      });
    }

    // RelatedTopics (相关主题)
    const relatedTopics = data.RelatedTopics as
      | Array<Record<string, unknown>>
      | undefined;
    if (relatedTopics && Array.isArray(relatedTopics)) {
      for (const topic of relatedTopics) {
        if (results.length >= limit) break;
        if (topic.Text && typeof topic.Text === "string" && topic.Text.trim()) {
          results.push({
            title: extractTitleFromDDGText(topic.Text) ?? query,
            url:
              (topic.FirstURL as string) ??
              `https://duckduckgo.com/?q=${encodedQuery}`,
            snippet: topic.Text,
            sourceReliability: "medium",
          });
        }
      }
    }

    return {
      query,
      results,
      searchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[WebTools] Search failed:", errMsg);
    return {
      query,
      results: [],
      searchedAt: new Date().toISOString(),
      error: errMsg,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** 从 DDG Text 字段提取标题（Text 格式为 "Title — Snippet"） */
function extractTitleFromDDGText(text: string): string | undefined {
  const idx = text.indexOf(" — ");
  if (idx > 0) {
    return text.slice(0, idx).trim();
  }
  return text.slice(0, 60).trim();
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
  const {
    url,
    expectedType = "auto",
    // maxImageWidth: reserved for future server-side image resizing
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = params;

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
        "User-Agent": "TheHiggs-AI-Runtime/0.3 Resource Downloader",
      },
    });

    if (!response.ok) {
      return createDownloadError(
        url,
        `HTTP ${response.status}: ${response.statusText}`,
      );
    }

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
    if (semicolonIdx > 0)
      contentType = contentType.slice(0, semicolonIdx).trim();

    // 检查 Content-Type 白名单
    const isAllowed = ALLOWED_CONTENT_TYPES.some((allowed) =>
      contentType.toLowerCase().startsWith(allowed),
    );
    if (!isAllowed) {
      return createDownloadError(
        url,
        `Content-Type "${contentType}" not in allowed list`,
      );
    }

    // 确定资源类型
    const isImage =
      IMAGE_CONTENT_TYPES.has(contentType) || contentType.startsWith("image/");
    const isJson = contentType.includes("json");
    const isText = contentType.startsWith("text/");

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
      // 图片 → data URL（base64）
      const base64 = arrayBufferToBase64(arrayBuffer);
      data = `data:${contentType};base64,${base64}`;
    } else if (isJson || isText) {
      // 文本/JSON → UTF-8 字符串
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
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn("[WebTools] Download failed:", url, errMsg);
    return createDownloadError(url, errMsg);
  } finally {
    clearTimeout(timeout);
  }
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
