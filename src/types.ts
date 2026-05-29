export type ApiType = "WBI" | "TRADITIONAL";

export interface BiliPicture {
  img_src: string;
}

export interface BiliReply {
  rpid: number | string;
  ctime: number;
  member?: {
    mid: number | string;
    uname: string;
  };
  content?: {
    message?: string;
    pictures?: BiliPicture[];
  };
  reply_control?: {
    biz_scene?: string;
  };
}

export interface BiliReplyResponse {
  code: number;
  message?: string;
  data?: {
    replies?: BiliReply[];
    top_replies?: BiliReply[];
  };
}

export interface DownloadImage {
  url: string;
  fileName: string;
}

export interface ProcessedCommentImage {
  displayText: string;
  fullMessage: string;
  truncatedMessage: string;
  username: string;
  timestamp: string;
  images: DownloadImage[];
}

export interface BoundPaginationElement extends HTMLDivElement {
  __bili_pagination_bound?: boolean;
}

declare global {
  interface Window {
    lastBiliReply: unknown;
    getCurrentApiType?: () => ApiType;
    setApiType?: (type: ApiType) => void;
  }
}
