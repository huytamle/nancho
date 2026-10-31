"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckoutSheet } from "@/components/store/checkout-sheet";
import { ItemSheet } from "@/components/store/item-sheet";
import { useCatalog } from "@/components/store/store-provider";
import { closeSheet } from "@/lib/client/sheet-url";

// Sheet nào mở do URL quyết định (§5.3): `?mon=<id>` · `?buoc=chot-don`. Nằm trong <Suspense> vì useSearchParams.
// Giữ món vừa đóng để sheet trượt xuống còn nội dung; `seq` đổi mỗi lần mở → form làm mới.
export function StoreSheets() {
  const params = useSearchParams();
  const { byId } = useCatalog();
  const mon = params.get("mon");
  const product = mon ? byId.get(mon) ?? null : null;
  const checkout = params.get("buoc") === "chot-don";

  const [shown, setShown] = useState({ mon, product, itemSeq: 0, checkout, checkoutSeq: 0 });
  if (mon !== shown.mon) {
    setShown((s) => ({ ...s, mon, product: product ?? s.product, itemSeq: s.itemSeq + (product ? 1 : 0) }));
  }
  if (checkout !== shown.checkout) setShown((s) => ({ ...s, checkout, checkoutSeq: s.checkoutSeq + (checkout ? 1 : 0) }));

  return (
    <>
      <ItemSheet key={`m${shown.itemSeq}`} product={shown.product} open={product !== null} onClose={closeSheet} />
      <CheckoutSheet key={`c${shown.checkoutSeq}`} open={checkout} onClose={closeSheet} />
    </>
  );
}
