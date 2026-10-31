import type { Instrumentation } from "next";

// Cảnh báo lỗi server vào nhóm Telegram của bếp (§11.3, §13.4). Giới hạn 1 tin/phút mỗi instance để không spam;
// lỗi bị bỏ qua vẫn có trong log của hosting. Không gửi header/cookie/query (có thể chứa token đơn, SĐT).

const MIN_GAP_MS = 60_000;
let lastSent = 0;
let suppressed = 0;

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const now = Date.now();
  if (now - lastSent < MIN_GAP_MS) {
    suppressed++;
    return;
  }
  lastSent = now;
  const skipped = suppressed;
  suppressed = 0;

  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : null;
  const path = request.path.split("?")[0].replace(/\/o\/[\w-]+/, "/o/[token]");
  const text = [
    `🚨 Lỗi server · ${request.method} ${path}`,
    `${context.routeType} · ${context.routePath}`,
    message.slice(0, 300),
    digest ? `digest ${digest}` : null,
    skipped > 0 ? `(+${skipped} lỗi khác trong phút trước)` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { sendTelegram } = await import("@/lib/server/notify/telegram");
  await sendTelegram(text);
};
