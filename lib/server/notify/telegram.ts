import "server-only";

// Gửi tin vào nhóm "Bếp The Heat" (§11.3). Luôn gọi trong `after()`; lỗi gửi chỉ ghi log, không làm hỏng đơn.
// Thiếu TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID → bỏ qua (dev, e2e).

export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    if (process.env.NODE_ENV !== "production") console.info(`[telegram:skip] ${text}`);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(JSON.stringify({ evt: "telegram_failed", status: res.status }));
    return res.ok;
  } catch (err) {
    console.error(JSON.stringify({ evt: "telegram_failed", error: String(err) }));
    return false;
  }
}

// ── Bot vận hành (§17.4): gọi Bot API chung. Thiếu token → bỏ qua (dev/e2e ghi log). ──

export type TelegramApi = <T = unknown>(method: string, body: object) => Promise<T | null>;

/** Gọi `https://api.telegram.org/bot<token>/<method>`; trả `result` hoặc null khi lỗi. */
export const telegramApi: TelegramApi = async <T,>(method: string, body: object): Promise<T | null> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV !== "production") console.info(`[telegram:skip] ${method} ${JSON.stringify(body).slice(0, 300)}`);
    return null;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T } | null;
    if (!res.ok || !json?.ok) {
      console.error(JSON.stringify({ evt: "telegram_api_failed", method, status: res.status }));
      return null;
    }
    return json.result ?? null;
  } catch (err) {
    console.error(JSON.stringify({ evt: "telegram_api_failed", method, error: String(err) }));
    return null;
  }
};

/** Tải file Telegram (ảnh hoá đơn) về bộ nhớ. Đường dẫn file chỉ có hạn ~1 giờ nên tải ngay. */
export async function downloadTelegramFile(fileId: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const file = await telegramApi<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!token || !file?.file_path || (file.file_size ?? 0) > 1_048_576) return null;
  try {
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const mime = file.file_path.endsWith(".png") ? "image/png" : file.file_path.endsWith(".webp") ? "image/webp" : "image/jpeg";
    return bytes.length > 0 && bytes.length <= 1_048_576 ? { bytes, mime } : null;
  } catch {
    return null;
  }
}
