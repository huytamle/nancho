// Sheet phản ánh trên URL (§5.3, §9.9): `?mon=<id>` · `?buoc=chot-don` · `/m/<id>` (link chia sẻ, sheet mở sẵn).
// Mở = pushState (Back của Android đóng sheet); đóng bằng tay = history.back() nếu chính phiên này đã push,
// ngược lại replaceState (vào thẳng từ link chia sẻ). Rời `/m/<id>` luôn về "/" (canonical).

let pushed = false;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    pushed = false;
  });
}

/** Món mở sẵn theo đường dẫn `/m/<id>`. */
export function productFromPath(pathname: string): string | null {
  const m = /^\/m\/([^/]+)\/?$/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

const basePath = () => (productFromPath(window.location.pathname) ? "/" : window.location.pathname);

export function openSheet(params: Record<string, string>) {
  const url = new URL(window.location.href);
  url.pathname = basePath();
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
    window.history.replaceState(null, "", basePath());
  }
}
