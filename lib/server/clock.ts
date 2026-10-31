import "server-only";

// "Bây giờ" phía server. TEST_NOW (ISO có offset) cố định mốc thời gian cho e2e/seed (§14):
// chỉ nhận khi không phải production, hoặc bản build chạy e2e (E2E=1). Đồng hồ vẫn chạy tiếp từ mốc đó.

const bootMs = Date.now();
const testNowMs = (() => {
  const raw = process.env.TEST_NOW;
  if (!raw || (process.env.NODE_ENV === "production" && process.env.E2E !== "1")) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
})();

export function serverNow(): Date {
  return testNowMs === null ? new Date() : new Date(testNowMs + (Date.now() - bootMs));
}
