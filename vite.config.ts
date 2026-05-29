import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "Bilibili评论区图片批量下载",
        namespace: "BilibiliCommentImageDownloader",
        version: "0.9.3",
        description: "批量下载B站评论区中的图片（暂仅支持动态和视频评论区）",
        author: "Kaesinol",
        license: "MIT",
        match: [
          "https://t.bilibili.com/*",
          "https://*.bilibili.com/opus/*",
          "https://www.bilibili.com/video/*",
          "https://www.bilibili.com/list/*",
          "https://space.bilibili.com/*"
        ],
        grant: [
          "GM_download",
          "GM_xmlhttpRequest",
          "GM_registerMenuCommand",
          "GM_getValue",
          "GM_setValue",
          "GM_deleteValue",
          "GM_listValues",
          "unsafeWindow"
        ],
        "run-at": "document-start",
        icon: "https://www.gstatic.com/android/keyboard/emojikitchen/20240206/u1f4be/u1f4be_u1f4ac.png",
        downloadURL:
          "https://update.greasyfork.org/scripts/530702/Bilibili%E8%AF%84%E8%AE%BA%E5%8C%BA%E5%9B%BE%E7%89%87%E6%89%B9%E9%87%8F%E4%B8%8B%E8%BD%BD.user.js",
        updateURL:
          "https://update.greasyfork.org/scripts/530702/Bilibili%E8%AF%84%E8%AE%BA%E5%8C%BA%E5%9B%BE%E7%89%87%E6%89%B9%E9%87%8F%E4%B8%8B%E8%BD%BD.meta.js"
      },
      server: {
        mountGmApi: true
      }
    })
  ]
});
