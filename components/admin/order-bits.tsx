// Mảnh UI dùng chung cho thẻ đơn trong các tab bếp. Không có state — import được từ mọi client component.

import { copy } from "@/data/copy";
import type { OrderStatus } from "@/lib/domain/types";
import { kitchenName } from "@/lib/kitchen-text";
import type { KitchenOrder } from "@/lib/server/dal/kitchen";

const STATUS_TONE: Record<OrderStatus, string> = {
  placed: "bg-accent text-on-accent",
  confirmed: "bg-elevated text-text",
  baking: "bg-warn text-black",
  ready: "bg-live text-black",
  delivering: "bg-invert text-on-invert",
  completed: "bg-elevated text-secondary",
  cancelled: "bg-elevated text-secondary line-through",
  no_show: "bg-danger text-black",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ${STATUS_TONE[status]}`}>
      {copy.admin.status[status]}
    </span>
  );
}

export function ItemsList({ items, large = false }: { items: KitchenOrder["items"]; large?: boolean }) {
  return (
    <ul className={large ? "space-y-1 text-[17px]" : "space-y-0.5 text-[15px]"}>
      {items.map((i, n) => (
        <li key={n}>
          <span className="font-semibold tabular-nums">{i.qty}×</span> {kitchenName(i.name)}
          {i.choices ? <span className="text-secondary"> ({i.choices.split(" + ").map(kitchenName).join(" + ")})</span> : null}
          {i.isGift ? <span className="font-semibold text-live"> · tặng</span> : null}
          {i.addons.map((a, k) => (
            <span key={k} className="block pl-5 text-secondary">
              + {a.qty} {kitchenName(a.name)}
            </span>
          ))}
        </li>
      ))}
    </ul>
  );
}

export function NoteLine({ note }: { note: string | null }) {
  return note ? <p className="mt-1.5 rounded-xl bg-warn/15 px-3 py-1.5 text-[15px] font-medium text-warn">📝 {note}</p> : null;
}
