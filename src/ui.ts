import {
  fetchCommentData,
  getCurrentApiType,
  getIdentifier,
  getStoredData,
  setApiType
} from "./api";
import { byId, elementFromHtml, injectStyleOnce, queryRequired } from "./dom";
import menuCss from "./styles/menu.css?inline";
import apiDialogHtml from "./templates/api-dialog.html?raw";
import downloadOptionHtml from "./templates/download-option.html?raw";
import menuHtml from "./templates/menu.html?raw";
import type { ApiType, BiliReply, BoundPaginationElement, DownloadImage, ProcessedCommentImage } from "./types";

const NIGHT_MODE_CLASS = "night-mode";

let currentPage = 1;

export function createDownloadMenu(): HTMLDivElement {
  injectStyleOnce("bili-img-download-style", menuCss);
  void applyThemeFromBilibiliCookie();

  const existingMenu = document.getElementById("bili-img-download-menu");
  if (existingMenu instanceof HTMLDivElement) {
    return existingMenu;
  }

  const menuContainer = elementFromHtml<HTMLDivElement>(menuHtml);
  document.body.appendChild(menuContainer);
  setupDraggableMenu(menuContainer);

  byId<HTMLButtonElement>("bili-menu-close-button").addEventListener("click", () => {
    hideDownloadMenu(menuContainer);
  });
  byId<HTMLButtonElement>("bili-api-config-button").addEventListener("click", () => {
    showApiConfigDialog();
  });

  return menuContainer;
}

export function showApiConfigDialog(): void {
  injectStyleOnce("bili-img-download-style", menuCss);
  void applyThemeFromBilibiliCookie();

  const dialog = elementFromHtml<HTMLDialogElement>(apiDialogHtml);
  const cancelButton = queryRequired<HTMLButtonElement>(dialog, ".btn.cancel");
  const confirmButton = queryRequired<HTMLButtonElement>(dialog, ".btn.confirm");

  const currentApiType = getCurrentApiType();
  const radio = dialog.querySelector<HTMLInputElement>(`input[name="apiType"][value="${currentApiType}"]`);
  if (radio) radio.checked = true;

  function closeDialog(): void {
    if (dialog.open) {
      dialog.close();
    }
  }

  cancelButton.addEventListener("click", closeDialog);
  confirmButton.addEventListener("click", () => {
    const selectedRadio = dialog.querySelector<HTMLInputElement>('input[name="apiType"]:checked');

    if (selectedRadio) {
      const newApiType = selectedRadio.value as ApiType;
      if (newApiType !== currentApiType) {
        try {
          setApiType(newApiType);
        } catch (error) {
          console.error(error);
        }

        try {
          alert(`API接口已切换到 ${newApiType === "WBI" ? "WBI签名" : "传统"} 接口\n请刷新页面使配置生效`);
        } catch {
          // Ignore alert failures in restricted userscript contexts.
        }
      }
    }

    closeDialog();
  });

  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;

    const rect = dialog.getBoundingClientRect();
    const clickedBackdrop =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (clickedBackdrop) {
      closeDialog();
    }
  });
  dialog.addEventListener("close", () => {
    dialog.remove();
  });
  document.body.appendChild(dialog);
  dialog.showModal();

  setTimeout(() => {
    const firstFocusable = dialog.querySelector<HTMLInputElement>('input[name="apiType"]') || cancelButton;
    firstFocusable.focus();
  }, 0);
}

export async function loadAndDisplayData(page = 1): Promise<void> {
  const menuContainer = document.getElementById("bili-img-download-menu") || createDownloadMenu();
  const menuContent = byId<HTMLDivElement>("bili-img-download-content");
  const pageInfo = byId<HTMLSpanElement>("bili-page-info");
  const prevButton = byId<HTMLButtonElement>("bili-prev-page");

  showDownloadMenu(menuContainer);
  menuContent.innerHTML = "<p>正在加载数据...</p>";

  try {
    const identifier = document.currentIdentifier || getIdentifier();
    const apiType = getCurrentApiType();
    console.log(`当前oid: ${identifier}, API类型: ${apiType}`);

    const allReplies = await loadReplies(identifier, apiType, page, menuContent, false);
    if (!allReplies) return;

    const processedData = processData(allReplies);
    createDownloadOptions(processedData, menuContent);
    updatePaginationVisibility();
    updateTraditionalPagination(apiType, page, processedData, pageInfo, prevButton);
  } catch (error) {
    menuContent.innerHTML = `<p>错误: ${String(error)}</p>`;
    console.error("Error:", error);
  }
}

export function setupPaginationEvents(): void {
  const tryAttach = (): boolean => {
    const paginationDiv = document.getElementById("bili-img-pagination") as BoundPaginationElement | null;
    if (!paginationDiv) return false;

    attachPaginationHandlers(paginationDiv);
    return true;
  };

  if (tryAttach()) return;

  const observer = new MutationObserver((_, obs) => {
    if (tryAttach()) {
      obs.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => observer.disconnect(), 10_000);
}

export function setupCommentUpdateListener(): void {
  window.addEventListener("biliCommentUpdate", () => {
    refreshDownloadInterface();
  });
}

export function addNavButton(): void {
  if (/bilibili\.com\/(video|list)/.test(location.href)) {
    const root1 = document.querySelector("bili-comments")?.shadowRoot;
    const root2 = root1?.querySelector("bili-comments-header-renderer")?.shadowRoot;

    if (!root1 || !root2) {
      setTimeout(addNavButton, 2000);
      return;
    }

    const buttons = root2.querySelectorAll("bili-text-button");
    const lastButton = buttons[buttons.length - 1];

    if (lastButton) {
      const newButton = document.createElement("bili-text-button");
      newButton.textContent = "解析评论区图片";
      lastButton.after(newButton);
      newButton.addEventListener("click", () => {
        void applyThemeFromBilibiliCookie();
        void loadAndDisplayData();
      });
    }

    return;
  }

  const navContainer = document.querySelector(".bili-tabs__nav__items");
  if (!navContainer) {
    setTimeout(addNavButton, 1000);
    return;
  }

  const navItem = document.createElement("div");
  navItem.className = "bili-tabs__nav__item bili-img-nav-trigger";
  navItem.textContent = "解析评论区图片";
  navItem.addEventListener("click", () => {
    void applyThemeFromBilibiliCookie();
    void loadAndDisplayData();
  });

  navContainer.appendChild(navItem);
}

export function setupSpaceDynamicButtonPolling(): void {
  if (location.hostname !== "space.bilibili.com") return;

  setInterval(() => {
    if (/space\.bilibili\.com\/\d+\/dynamic/.test(location.href)) {
      addSpaceNavButton();
    }
  }, 2000);
}

function addSpaceNavButton(): void {
  document
    .querySelectorAll(".bili-dyn-item:has(.bili-dyn-action.comment.active)")
    ?.forEach((opus) => {
      const root1 = opus.querySelector("bili-comments")?.shadowRoot;
      if (!root1) return;

      const root2 = root1.querySelector("bili-comments-header-renderer:not([data-processed])")?.shadowRoot;
      if (!root2) return;

      const buttons = root2.querySelectorAll("bili-text-button");
      const lastButton = buttons[buttons.length - 1];

      if (!lastButton) return;

      const newButton = document.createElement("bili-text-button");
      newButton.textContent = "解析评论区图片";
      lastButton.after(newButton);
      newButton.addEventListener("click", () => {
        const dataParams = root1.host.getAttribute("data-params");
        const identifier = dataParams?.match(/\d{4,}/)?.[0] || null;

        void applyThemeFromBilibiliCookie();
        document.currentIdentifier = identifier;
        void loadAndDisplayData();
      });
      root2.host.setAttribute("data-processed", "true");
    });
}

async function loadAndDisplayDataSilent(page = 1): Promise<void> {
  const menuContent = document.getElementById("bili-img-download-content");
  const pageInfo = document.getElementById("bili-page-info");
  const prevButton = document.getElementById("bili-prev-page");

  if (!(menuContent instanceof HTMLDivElement) || !(pageInfo instanceof HTMLSpanElement) || !(prevButton instanceof HTMLButtonElement)) {
    return;
  }

  try {
    const identifier = document.currentIdentifier || getIdentifier();
    const apiType = getCurrentApiType();
    const allReplies = await loadReplies(identifier, apiType, page, menuContent, true);
    if (!allReplies) return;

    const processedData = processData(allReplies);
    createDownloadOptions(processedData, menuContent);
    updatePaginationVisibility();
    updateTraditionalPagination(apiType, page, processedData, pageInfo, prevButton);
  } catch (error) {
    console.error("Silent refresh error:", error);
  }
}

async function loadReplies(
  identifier: string | null,
  apiType: ApiType,
  page: number,
  menuContent: HTMLDivElement,
  silent: boolean
): Promise<BiliReply[] | null> {
  if (apiType === "WBI") {
    const storedReplies = getStoredData(identifier);
    if (storedReplies.length > 0) {
      if (!silent) console.log(`从存储中加载到 ${storedReplies.length} 条评论`);
      return storedReplies;
    }

    if (!silent) {
      menuContent.innerHTML = "<p>WBI接口模式：请先滚动评论区加载数据，或等待页面自动加载评论</p>";
    }
    return null;
  }

  if (!identifier) {
    menuContent.innerHTML = "<p>错误: 无法获取OID，请确保在正确的页面</p>";
    return null;
  }

  const data = await fetchCommentData(identifier, page);
  const targetData = data.data;
  return page === 1 ? [...(targetData?.top_replies || []), ...(targetData?.replies || [])] : targetData?.replies || [];
}

function processData(replies: BiliReply[]): ProcessedCommentImage[] {
  const processedData: ProcessedCommentImage[] = [];

  for (const reply of replies) {
    if (!reply.member || !reply.content) continue;

    const pictures = reply.content.pictures || [];
    if (pictures.length === 0) continue;

    const message = reply.content.message || "";
    const truncatedMessage = message.length > 10 ? `${message.substring(0, 10)}...` : message;
    const hardTruncatedMessage = message.length > 20 ? `${message.substring(0, 20)}...` : message;

    const displayText = `${reply.member.uname} - ${truncatedMessage} - ${formatTimestamp(reply.ctime)}`;
    const imageData = pictures.map((pic, index) => {
      const originalUrl = pic.img_src;
      const fileExtension = originalUrl.split(".").pop()?.split("?")[0] || "jpg";
      const bizScene = (reply.reply_control?.biz_scene || "unknown").replace("opus_", "");

      return {
        url: originalUrl,
        fileName: `${reply.member?.uname || ""} - ${reply.member?.mid || ""} - ${bizScene} - ${index}.${fileExtension}`
      };
    });

    processedData.push({
      displayText,
      fullMessage: message,
      truncatedMessage: hardTruncatedMessage,
      username: reply.member.uname,
      timestamp: formatTimestamp(reply.ctime),
      images: imageData
    });
  }

  return processedData;
}

function createDownloadOptions(processedData: ProcessedCommentImage[], menuContent: HTMLDivElement): void {
  menuContent.innerHTML = "";

  if (processedData.length === 0) {
    menuContent.innerHTML = "<p>没有找到包含图片的评论</p>";
    return;
  }

  const statsDiv = document.createElement("div");
  statsDiv.className = "bili-download-stats";

  const apiType = getCurrentApiType();
  const apiTypeText = apiType === "WBI" ? "WBI签名接口（实时更新）" : "传统接口";
  statsDiv.textContent = `共找到 ${processedData.length} 条包含图片的评论 [${apiTypeText}]`;
  menuContent.appendChild(statsDiv);

  const fragment = document.createDocumentFragment();
  for (const item of processedData) {
    const downloadOption = elementFromHtml<HTMLButtonElement>(downloadOptionHtml);
    const usernameSpan = queryRequired<HTMLSpanElement>(downloadOption, ".bili-download-username");
    const messageSpan = queryRequired<HTMLSpanElement>(downloadOption, ".bili-download-message");
    const timeSpan = queryRequired<HTMLSpanElement>(downloadOption, ".bili-download-time");
    const countSpan = queryRequired<HTMLSpanElement>(downloadOption, ".bili-download-count");

    usernameSpan.textContent = item.username;
    messageSpan.textContent = item.truncatedMessage;
    messageSpan.title = item.fullMessage;
    timeSpan.textContent = item.timestamp;
    countSpan.textContent = `[${item.images.length}张]`;

    downloadOption.addEventListener("click", () => {
      downloadImages(item.images);
    });

    fragment.appendChild(downloadOption);
  }
  menuContent.appendChild(fragment);
}

function downloadImages(images: DownloadImage[]): void {
  let downloaded = 0;
  console.log("开始下载", `准备下载 ${images.length} 张图片...`);

  for (const image of images) {
    GM_download({
      url: image.url,
      name: image.fileName,
      onload() {
        downloaded++;
        if (downloaded === images.length) {
          console.log(`成功下载 ${downloaded} 张图片...`);
        }
      },
      onerror(error) {
        console.log(`图片 ${image.fileName} 下载失败`, error);
      }
    });
  }
}

function refreshDownloadInterface(): void {
  const menuContainer = document.getElementById("bili-img-download-menu");
  if (!isDownloadMenuOpen(menuContainer)) {
    return;
  }

  void loadAndDisplayDataSilent(currentPage);
}

function updatePaginationVisibility(): void {
  const paginationDiv = document.getElementById("bili-img-pagination");

  if (paginationDiv) {
    paginationDiv.hidden = getCurrentApiType() === "WBI";
  }
}

function updateTraditionalPagination(
  apiType: ApiType,
  page: number,
  processedData: ProcessedCommentImage[],
  pageInfo: HTMLSpanElement,
  prevButton: HTMLButtonElement
): void {
  if (apiType !== "TRADITIONAL") return;

  currentPage = page;
  pageInfo.textContent = `第${page}页`;
  prevButton.disabled = page <= 1;

  const nextButton = document.getElementById("bili-next-page");
  if (nextButton instanceof HTMLButtonElement) {
    nextButton.disabled = processedData.length === 0;
  }
}

function attachPaginationHandlers(paginationDiv: BoundPaginationElement): void {
  if (paginationDiv.__bili_pagination_bound) return;
  paginationDiv.__bili_pagination_bound = true;

  const prevButton = paginationDiv.querySelector<HTMLButtonElement>("#bili-prev-page");
  const nextButton = paginationDiv.querySelector<HTMLButtonElement>("#bili-next-page");

  prevButton?.addEventListener("click", () => {
    if (getCurrentApiType() !== "TRADITIONAL") return;
    if (prevButton.disabled) return;
    if (currentPage > 1) {
      void loadAndDisplayData(currentPage - 1);
    }
  });

  nextButton?.addEventListener("click", () => {
    if (getCurrentApiType() !== "TRADITIONAL") return;
    if (nextButton.disabled) return;
    void loadAndDisplayData(currentPage + 1);
  });
}

function setupDraggableMenu(menuContainer: HTMLDivElement): void {
  const header = menuContainer.querySelector<HTMLElement>(".bili-img-download-header");
  if (!header) return;

  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest(".bili-img-download-header-actions")) return;

    const rect = menuContainer.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;

    menuContainer.style.left = `${rect.left}px`;
    menuContainer.style.top = `${rect.top}px`;
    menuContainer.style.right = "auto";
    menuContainer.style.margin = "0";

    header.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  header.addEventListener("pointermove", (event) => {
    if (!header.hasPointerCapture(event.pointerId)) return;

    const rect = menuContainer.getBoundingClientRect();
    const maxLeft = Math.max(0, window.innerWidth - rect.width);
    const maxTop = Math.max(0, window.innerHeight - rect.height);
    const nextLeft = clamp(event.clientX - offsetX, 0, maxLeft);
    const nextTop = clamp(event.clientY - offsetY, 0, maxTop);

    menuContainer.style.left = `${nextLeft}px`;
    menuContainer.style.top = `${nextTop}px`;
  });

  header.addEventListener("pointerup", (event) => {
    if (header.hasPointerCapture(event.pointerId)) {
      header.releasePointerCapture(event.pointerId);
    }
  });

  header.addEventListener("pointercancel", (event) => {
    if (header.hasPointerCapture(event.pointerId)) {
      header.releasePointerCapture(event.pointerId);
    }
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function showDownloadMenu(menuContainer: Element): void {
  if (menuContainer instanceof HTMLElement) {
    menuContainer.hidden = false;
  }
}

function hideDownloadMenu(menuContainer: HTMLElement): void {
  menuContainer.hidden = true;
}

function isDownloadMenuOpen(menuContainer: Element | null): boolean {
  return menuContainer instanceof HTMLElement && !menuContainer.hidden;
}

async function applyThemeFromBilibiliCookie(): Promise<void> {
  const themeStyle = await getBilibiliThemeStyle();
  document.documentElement.classList.toggle(NIGHT_MODE_CLASS, themeStyle === "dark");
}

function getBilibiliThemeStyle(): Promise<string | null> {
  return new Promise((resolve) => {
    GM_cookie.list(
      {
        url: window.location.href,
        name: "theme_style"
      },
      (cookies, error) => {
        if (error) {
          console.warn("读取 Bilibili 主题 Cookie 失败:", error);
          resolve(null);
          return;
        }

        const themeCookie = cookies.find((cookie) => cookie.name === "theme_style");
        resolve(themeCookie?.value || null);
      }
    );
  });
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : String(num);
}
