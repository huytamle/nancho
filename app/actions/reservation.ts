"use server";

import * as z from "zod";
import type { ReservationErrorKey } from "@/data/copy";
import { site } from "@/data/site";
import { normalizePhone } from "@/lib/domain/phone";
import { parseVnLocal, vnTimeLabel } from "@/lib/domain/time";

// TODO(M4): rate-limit theo IP + lưu DB + báo Telegram (hiện chỉ ghi log).

export type ReservationState = {
  ok: boolean;
  status: "" | "success" | "invalid";
  errors: Partial<Record<"name" | "phone" | "guests" | "datetime" | "notes", ReservationErrorKey>>;
};

const ReservationInput = z.object({
  name: z.string().trim().min(2, "nameShort").max(60, "nameShort"),
  phone: z.string().max(20, "phoneInvalid"),
  guests: z.coerce.number("guestsRange").int("guestsRange").min(1, "guestsRange").max(20, "guestsRange"),
  datetime: z.string().trim().min(1, "datetimeRequired"),
  notes: z.string().trim().max(300, "notesLong"),
});

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createReservation(
  _prev: ReservationState,
  formData: FormData,
): Promise<ReservationState> {
  const parsed = ReservationInput.safeParse({
    name: read(formData, "name"),
    phone: read(formData, "phone"),
    guests: read(formData, "guests"),
    datetime: read(formData, "datetime"),
    notes: read(formData, "notes"),
  });

  const errors: ReservationState["errors"] = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof ReservationState["errors"];
      errors[field] ??= issue.message as ReservationErrorKey;
    }
  }

  const phone = normalizePhone(read(formData, "phone"));
  if (!phone) errors.phone ??= "phoneInvalid";

  const when = parsed.success ? parseVnLocal(parsed.data.datetime) : null;
  if (parsed.success && !errors.datetime) {
    if (!when || when.getTime() < Date.now() - 60_000) {
      errors.datetime = "datetimeFuture";
    } else {
      const hhmm = vnTimeLabel(when);
      const { reservationOpen, reservationClose } = site.dineIn;
      if (hhmm < reservationOpen || hhmm > reservationClose) errors.datetime = "datetimeHours";
    }
  }

  if (!parsed.success || Object.keys(errors).length > 0) {
    return { ok: false, status: "invalid", errors };
  }

  console.info("[THE HEAT] Đặt bàn", {
    name: parsed.data.name,
    phone,
    guests: parsed.data.guests,
    at: when!.toISOString(),
    notes: parsed.data.notes || undefined,
  });

  return { ok: true, status: "success", errors: {} };
}
