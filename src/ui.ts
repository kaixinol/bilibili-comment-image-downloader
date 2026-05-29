import {
  fetchCommentData,
  getCurrentApiType,
  getIdentifier,
  getStoredData,
  setApiType
} from "./api";
import menuCss from "./styles/menu.css?inline";
import apiDialogHtml from "./templates/api-dialog.html?raw";
import menuHtml from "./templates/menu.html?raw";
import type { ApiType, BiliReply, BoundPaginationElement, DownloadImage, ProcessedCommentImage } from "./types";

let currentPage = 1;

export function createDownloadMenu(): HTMLDivElement {
  injectStyle("bili-img-download-style", menuCss);

  const existingMenu = document.getElementById("bili-img-download-menu");
  if (existingMenu instanceof HTMLDivElement) {
    return existingMenu;
  }

  const template = document.createElement("template");
  template.innerHTML = menuHtml.trim();
  const menuContainer = template.content.firstElementChild as HTMLDivElement | null;

  if (!menuContainer) {
    throw new Error("下载菜单模板为空");
  }

  document.body.appendChild(menuContainer);

  getRequiredElement<HTMLButtonElement>("bili-menu-close-button").addEventListener("click", () => {
    menuContainer.style.display = "none";
  });
  getRequiredElement<HTMLButtonElement>("bili-api-config-button").addEventListener("click", () => {
    showApiConfigDialog();
  });

  return menuContainer;
}

export function showApiConfigDialog(): void {
  injectStyle("bili-img-download-style", menuCss);

  const prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const template = document.createElement("template");
  template.innerHTML = apiDialogHtml.trim();
  const overlay = template.content.firstElementChild as HTMLDivElement | null;

  if (!overlay) {
    document.body.style.overflow = prevBodyOverflow || "";
    return;
  }

  const dialog = overlay.querySelector<HTMLDivElement>(".bili-dialog");
  const cancelButton = overlay.querySelector<HTMLButtonElement>(".btn.cancel");
  const confirmButton = overlay.querySelector<HTMLButtonElement>(".btn.confirm");

  if (!dialog || !cancelButton || !confirmButton) {
    document.body.style.overflow = prevBodyOverflow || "";
    return;
  }

  const overlayElement = overlay;
  const dialogElement = dialog;
  const cancelButtonElement = cancelButton;
  const confirmButtonElement = confirmButton;

  const currentApiType = getCurrentApiType();
  const radio = dialogElement.querySelector<HTMLInputElement>(`input[name="apiType"][value="${currentApiType}"]`);
  if (radio) radio.checked = true;

  function closeDialog(): void {
    if (document.body.contains(overlayElement)) {
      document.body.removeChild(overlayElement);
    }
    document.body.style.overflow = prevBodyOverflow || "";
    document.removeEventListener("keydown", onKeyDown);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
    } else if (event.key === "Enter" && dialogElement.contains(document.activeElement)) {
      event.preventDefault();
      confirmButtonElement.click();
    }
  }

  cancelButtonElement.addEventListener("click", closeDialog);
  confirmButtonElement.addEventListener("click", () => {
    const selectedRadio = dialogElement.querySelector<HTMLInputElement>('input[name="apiType"]:checked');

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
  overlayElement.addEventListener("click", (event) => {
    if (event.target === overlayElement) {
      closeDialog();
    }
  });
  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild(overlayElement);

  setTimeout(() => {
    const firstFocusable = dialogElement.querySelector<HTMLInputElement>('input[name="apiType"]') || cancelButtonElement;
    firstFocusable.focus();
  }, 0);
}

export async function loadAndDisplayData(page = 1): Promise<void> {
  const menuContainer = document.getElementById("bili-img-download-menu") || createDownloadMenu();
  const menuContent = getRequiredElement<HTMLDivElement>("bili-img-download-content");
  const pageInfo = getRequiredElement<HTMLSpanElement>("bili-page-info");
  const prevButton = getRequiredElement<HTMLButtonElement>("bili-prev-page");

  menuContainer.style.display = "block";
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
        syncNightMode();
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
  navItem.className = "bili-tabs__nav__item";
  navItem.textContent = "解析评论区图片";
  navItem.style.cssText = "cursor: pointer;";
  navItem.addEventListener("click", () => {
    syncNightMode();
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

        syncNightMode();
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

  for (const item of processedData) {
    const downloadOption = document.createElement("div");
    downloadOption.className = "bili-download-option";

    const content = document.createElement("div");
    content.className = "bili-download-option-content";

    const infoDiv = document.createElement("div");
    infoDiv.className = "bili-download-info";

    const usernameSpan = document.createElement("span");
    usernameSpan.className = "bili-download-username";
    usernameSpan.textContent = item.username;

    const messageSpan = document.createElement("span");
    messageSpan.className = "bili-download-message";
    messageSpan.textContent = item.truncatedMessage;
    messageSpan.title = item.fullMessage;

    const timeSpan = document.createElement("span");
    timeSpan.className = "bili-download-time";
    timeSpan.textContent = item.timestamp;

    const countSpan = document.createElement("span");
    countSpan.className = "bili-download-count";
    countSpan.textContent = `[${item.images.length}张]`;

    infoDiv.appendChild(usernameSpan);
    infoDiv.appendChild(messageSpan);
    infoDiv.appendChild(timeSpan);
    content.appendChild(infoDiv);
    content.appendChild(countSpan);
    downloadOption.appendChild(content);
    downloadOption.addEventListener("click", () => {
      downloadImages(item.images);
    });

    menuContent.appendChild(downloadOption);
  }
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
  if (!menuContainer || menuContainer.style.display !== "block") {
    return;
  }

  void loadAndDisplayDataSilent(currentPage);
}

function updatePaginationVisibility(): void {
  const paginationDiv = document.getElementById("bili-img-pagination");

  if (paginationDiv) {
    paginationDiv.style.display = getCurrentApiType() === "WBI" ? "none" : "flex";
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

function syncNightMode(): void {
  const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
  if (!m) return;

  document.documentElement.classList.toggle("night-mode", (Number(m[0]) * 299 + Number(m[1]) * 587 + Number(m[2]) * 114) / 1000 < 128);
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())} ${padZero(date.getHours())}:${padZero(date.getMinutes())}`;
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : String(num);
}

function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

function getRequiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`找不到元素: ${id}`);
  }

  return element as T;
}
