"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckoutSheet } from "@/components/store/checkout-sheet";
import { ItemSheet } from "@/components/store/item-sheet";
import { useCatalog } from "@/components/store/store-provider";
import { track } from "@/lib/client/analytics";
import { closeSheet, productFromPath } from "@/lib/client/sheet-url";

// Sheet nào mở do URL quyết định (§5.3): `?mon=<id>` hoặc `/m/<id>` · `?buoc=chot-don`. Nằm trong <Suspense> vì useSearchParams.
// Giữ món vừa đóng để sheet trượt xuống còn nội dung; `seq` đổi mỗi lần mở → form làm mới.
export function StoreSheets() {
  const params = useSearchParams();
  const pathname = usePathname();
  const { byId } = useCatalog();
  const mon = params.get("mon") ?? productFromPath(pathname);
  const product = mon ? byId.get(mon) ?? null : null;
  const checkout = params.get("buoc") === "chot-don";

  const [shown, setShown] = useState({ mon, product, itemSeq: 0, checkout, checkoutSeq: 0 });
  if (mon !== shown.mon) {
    setShown((s) => ({ ...s, mon, product: product ?? s.product, itemSeq: s.itemSeq + (product ? 1 : 0) }));
  }
  if (checkout !== shown.checkout) setShown((s) => ({ ...s, checkout, checkoutSeq: s.checkoutSeq + (checkout ? 1 : 0) }));

  // Sự kiện analytics mỗi lần mở (seq tăng), không lặp khi re-render.
  const viewed = shown.itemSeq > 0 ? shown.product?.id : undefined;
  useEffect(() => {
    if (viewed) track("view_item", { item: viewed });
  }, [shown.itemSeq, viewed]);
  useEffect(() => {
    if (shown.checkoutSeq > 0) track("begin_checkout");
  }, [shown.checkoutSeq]);

  return (
    <>
      <ItemSheet key={`m${shown.itemSeq}`} product={shown.product} open={product !== null} onClose={closeSheet} />
      <CheckoutSheet key={`c${shown.checkoutSeq}`} open={checkout} onClose={closeSheet} />
    </>
  );
}
