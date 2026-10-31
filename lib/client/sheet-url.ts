// Sheet phản ánh trên URL (§5.3, §9.9): `?mon=<id>` · `?buoc=chot-don`. Mở = pushState (Back của Android đóng sheet);
// đóng bằng tay = history.back() nếu chính phiên này đã push, ngược lại replaceState (vào thẳng từ link chia sẻ).

let pushed = false;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    pushed = false;
  });
}

export function openSheet(params: Record<string, string>) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams(params).toString();
  if (pushed) {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
    pushed = true;
  }
}

export function closeSheet() {
  if (pushed) {
    pushed = false;
    window.history.back();
  } else {
    window.history.replaceState(null, "", window.location.pathname);
  }
}
