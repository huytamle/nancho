import "server-only";
import { Marked, type Tokens } from "marked";

// Markdown sổ tay (§17.6) → HTML, chỉ chạy ở Server Component (0 KB JS client).
// `marked` (MIT) không lọc HTML — ở đây: HTML thô trong nội dung bị escape thành chữ, ảnh thành chữ alt,
// link chỉ giữ http(s)/mailto/tel/đường dẫn nội bộ. Kết quả chỉ còn thẻ do chính marked sinh ra.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);
const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

const md = new Marked({
  gfm: true,
  breaks: true,
  async: false,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    image({ text }: Tokens.Image) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      if (!SAFE_HREF.test(href)) return inner;
      const external = /^https?:/i.test(href);
      return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${inner}</a>`;
    },
  },
});

export function renderMarkdown(source: string): string {
  return md.parse(source, { async: false });
}
