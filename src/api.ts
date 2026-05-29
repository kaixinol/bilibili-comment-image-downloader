import type { ApiType, BiliReply, BiliReplyResponse } from "./types";

const API_TYPES: Record<ApiType, string> = {
  TRADITIONAL: "/x/v2/reply",
  WBI: "/x/v2/reply/wbi/main"
};

const API_TYPE_STORAGE_KEY = "biliApiType";
const REPLY_STORAGE_KEY = "biliReplyDict";

type ReplyStore = Record<string, BiliReply[]>;

export function getIdentifier(): string | null {
  const commentEl = document.querySelector("bili-comments[data-params]");
  if (!commentEl) return null;

  const params = commentEl.getAttribute("data-params");
  const oidMatch = params?.match(/\d{4,}/);
  return oidMatch ? oidMatch[0] : null;
}

export function getCurrentApiType(): ApiType {
  return GM_getValue(API_TYPE_STORAGE_KEY, "WBI") as ApiType;
}

export function setApiType(type: ApiType): void {
  GM_setValue(API_TYPE_STORAGE_KEY, type);
  console.log(`[API配置] 已切换到 ${type === "WBI" ? "WBI签名" : "传统"} 接口`);
}

export function exposeApiConfig(): void {
  unsafeWindow.getCurrentApiType = getCurrentApiType;
  unsafeWindow.setApiType = setApiType;
}

export function setupFetchInterceptor(): void {
  unsafeWindow.lastBiliReply = null;

  const originalFetch = unsafeWindow.fetch;

  unsafeWindow.fetch = function patchedFetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    if (getCurrentApiType() === "TRADITIONAL") {
      return originalFetch.apply(this, args);
    }

    const requestUrl = getFetchRequestUrl(args[0]);
    const targetApiPath = API_TYPES[getCurrentApiType()];

    if (requestUrl && requestUrl.includes(targetApiPath)) {
      console.log(`[B站API监控] 捕获评论API请求 (${getCurrentApiType()}):`, requestUrl);

      return originalFetch
        .apply(this, args)
        .then((response) => {
          const clone = response.clone();
          return clone
            .json()
            .then((data: BiliReplyResponse) => {
              cacheWbiReplyData(requestUrl, data);
              return response;
            })
            .catch((error: unknown) => {
              console.warn("[B站API监控] 解析评论响应失败:", error);
              return response;
            });
        })
        .catch((error: unknown) => {
          console.error("[B站API监控] 请求出错:", error);
          throw error;
        });
    }

    return originalFetch.apply(this, args);
  };

  if (getCurrentApiType() === "WBI") {
    console.log("[B站API监控] 脚本已注入，开始监控评论API");
  }
}

export function getStoredData(identifier: string | null): BiliReply[] {
  if (!identifier) return [];

  try {
    const allStoredData = readReplyStore();
    return allStoredData[identifier] || [];
  } catch (error) {
    console.warn("获取存储数据失败:", error);
    return [];
  }
}

export function fetchCommentData(oid: string, page = 1): Promise<BiliReplyResponse> {
  return new Promise((resolve, reject) => {
    const initialType = window.location.href.startsWith("https://www.bilibili.com/video/") ? 1 : 11;

    const fetchWithType = (type: number): void => {
      const apiUrl = `https://api.bilibili.com/x/v2/reply?type=${type}&oid=${oid}&pn=${page}`;

      GM_xmlhttpRequest({
        method: "GET",
        url: apiUrl,
        onload(response) {
          try {
            const data = JSON.parse(response.responseText) as BiliReplyResponse;

            if (data && data.code === 0) {
              resolve(data);
            } else if (type === 11) {
              console.warn("Type 11 failed, retrying with Type 17...");
              fetchWithType(17);
            } else {
              reject(`获取数据失败: ${data.message || "未知错误"}`);
            }
          } catch (error) {
            reject(`解析数据失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        },
        onerror(error) {
          reject(`网络请求失败: ${String(error)}`);
        }
      });
    };

    fetchWithType(initialType);
  });
}

export function clearStoredValues(): number {
  const keys = GM_listValues();
  for (const key of keys) {
    GM_deleteValue(key);
  }
  return keys.length;
}

function cacheWbiReplyData(requestUrl: string, data: BiliReplyResponse): void {
  const identifier = getOidFromRequestUrl(requestUrl);
  if (!identifier) return;

  const allStoredData = readReplyStore();

  if (!allStoredData[identifier]) {
    allStoredData[identifier] = [];
  }

  const currentReplies = Array.isArray(data?.data?.replies) ? data.data.replies : [];
  const currentTopReplies = Array.isArray(data?.data?.top_replies) ? data.data.top_replies : [];
  const existingReplies = allStoredData[identifier];
  const mergedReplies = [...currentReplies, ...currentTopReplies, ...existingReplies];
  const deduplicatedReplies = deduplicateReplies(mergedReplies);
  const hasNewData = deduplicatedReplies.length > existingReplies.length;

  allStoredData[identifier] = deduplicatedReplies;
  GM_setValue(REPLY_STORAGE_KEY, JSON.stringify(allStoredData));

  if (data.data) {
    const topRepliesCount = currentTopReplies.length;
    data.data.top_replies = deduplicatedReplies.slice(0, topRepliesCount);
    data.data.replies = deduplicatedReplies.slice(topRepliesCount);
  }

  console.log(`[评论去重] 动态${identifier}: 总计${deduplicatedReplies.length}条评论${hasNewData ? " (有新数据)" : ""}`);

  if (hasNewData) {
    setTimeout(() => {
      const menuContainer = document.getElementById("bili-img-download-menu");
      if (menuContainer && menuContainer.style.display === "block") {
        console.log("[实时更新] 检测到新评论，更新下载界面");
        window.dispatchEvent(new CustomEvent("biliCommentUpdate"));
      }
    }, 100);
  }
}

function getFetchRequestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function getOidFromRequestUrl(requestUrl: string): string | null {
  const url = new URL(requestUrl, window.location.origin);
  return url.searchParams.get("oid");
}

function readReplyStore(): ReplyStore {
  try {
    return JSON.parse(GM_getValue(REPLY_STORAGE_KEY, "{}")) as ReplyStore;
  } catch (error) {
    console.warn("解析存储的评论数据失败:", error);
    return {};
  }
}

function deduplicateReplies(replies: BiliReply[]): BiliReply[] {
  const seen = new Set<BiliReply["rpid"]>();

  return replies.filter((reply) => {
    if (seen.has(reply.rpid)) {
      return false;
    }

    seen.add(reply.rpid);
    return true;
  });
}
