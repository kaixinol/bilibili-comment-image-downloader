# Bilibili Comment Image Downloader

一個用於批量下載 B 站評論區圖片的用戶腳本工具，支持動態與視頻評論區。

舊版腳本：https://gist.github.com/kaixinol/ce2d108d7927372e3a8d641b1f77b20e
## 主要功能

- 解析評論區中的圖片並匯總顯示
- 支持 WBI 簽名接口與傳統接口切換
- 支持圖片批量下載
- 支持黑暗模式主題切換
- 支持評論實時更新（WBI 模式下）

## 安裝與使用

1. 使用 Tampermonkey / Violentmonkey / Greasemonkey 等用戶腳本管理器安裝腳本。
2. 將腳本應用於 B 站評論頁面，例如：
   - `https://t.bilibili.com/*`
   - `https://*.bilibili.com/opus/*`
   - `https://www.bilibili.com/video/*`
   - `https://www.bilibili.com/list/*`
   - `https://space.bilibili.com/*`
3. 在頁面中點擊「解析評論區圖片」按鈕即可打開下載界面。
4. 點擊「API配置」可切換 WBI 簽名接口和傳統接口。

## 開發

```bash
pnpm install
pnpm run dev
```

打包構建：

```bash
pnpm run build
```

## 專案結構

- `src/` - 原始 TypeScript 源碼
- `dist/` - 編譯後的用戶腳本
- `vite.config.ts` - Vite 構建配置
- `tsconfig.json` - TypeScript 配置

## 版權

MIT License
