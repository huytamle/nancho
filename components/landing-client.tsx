"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/data/copy";
import { dispatch } from "@/lib/client/cart-store";
import type { Segment } from "@/lib/domain/types";

const t = copy.landing;

/** Nút tài khoản ở header: link tới /tai-khoan (nơi nạp Clerk) — trang chủ không cần clerk-js. */
export function AccountButton() {
  return (
    <Link href="/tai-khoan" className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-full bg-invert px-4 text-sm font-semibold text-on-invert transition active:scale-95">
      {t.nav.signIn}
    </Link>
  );
}

/** Link nhảy tới thực đơn và mở sẵn đúng tab (pizza/cà phê). */
export function SegmentLink({ segment, className, children }: { segment: Segment; className?: string; children: ReactNode }) {
  return (
    <a href="#thuc-don" onClick={() => dispatch({ type: "segment", segment })} className={className}>
      {children}
    </a>
  );
}
