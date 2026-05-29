import { clearStoredValues, exposeApiConfig, setupFetchInterceptor } from "./api";
import {
  addNavButton,
  createDownloadMenu,
  loadAndDisplayData,
  setupCommentUpdateListener,
  setupPaginationEvents,
  setupSpaceDynamicButtonPolling,
  showApiConfigDialog
} from "./ui";
import "./types";

document.currentIdentifier = null;

exposeApiConfig();
setupFetchInterceptor();

function main(): void {
  createDownloadMenu();
  addNavButton();
  setupSpaceDynamicButtonPolling();
  setupPaginationEvents();
  setupCommentUpdateListener();

  GM_registerMenuCommand("显示下载界面", () => {
    void loadAndDisplayData(1);
  });
}

GM_registerMenuCommand("清除数据", () => {
  const count = clearStoredValues();
  alert(`清除 ${count} 条数据完成`);
});

GM_registerMenuCommand("API接口配置", () => {
  showApiConfigDialog();
});

window.addEventListener("load", main);
