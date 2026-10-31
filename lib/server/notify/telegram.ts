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
