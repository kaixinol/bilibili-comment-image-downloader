export function fragmentFromHtml(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content;
}

export function elementFromHtml<T extends HTMLElement>(html: string): T {
  const element = fragmentFromHtml(html).firstElementChild;
  if (!(element instanceof HTMLElement)) {
    throw new Error("HTML 模板没有根元素");
  }

  return element as T;
}

export function queryRequired<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`找不到元素: ${selector}`);
  }

  return element as T;
}

export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`找不到元素: ${id}`);
  }

  return element as T;
}

export function injectStyleOnce(id: string, css: string): void {
  if (document.getElementById(id)) return;

  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
