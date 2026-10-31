"use server";

export type FormErrorKey =
  | "nameShort"
  | "phoneInvalid"
  | "guestsRange"
  | "datetimeRequired"
  | "datetimeFuture"
  | "datetimeHours"
  | "notesLong";

export type ReservationState = {
  ok: boolean;
  status: "" | "success" | "invalid";
  errors: {
    name?: FormErrorKey;
    phone?: FormErrorKey;
    guests?: FormErrorKey;
    datetime?: FormErrorKey;
    notes?: FormErrorKey;
  };
};

const empty: ReservationState = { ok: false, status: "", errors: {} };

function read(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(raw: string) {
  return raw.replace(/[\s.\-()]/g, "");
}

function isPhone(value: string) {
  return /^(0|\+84)(3|5|7|8|9)\d{8}$/.test(value);
}

export async function createReservation(
  _prev: ReservationState,
  formData: FormData,
): Promise<ReservationState> {
  const name = read(formData, "name");
  const phone = normalizePhone(read(formData, "phone"));
  const guestsRaw = read(formData, "guests");
  const datetime = read(formData, "datetime");
  const notes = read(formData, "notes");

  const errors: ReservationState["errors"] = {};

  if (name.length < 2) {
    errors.name = "nameShort";
  }

  if (!isPhone(phone)) {
    errors.phone = "phoneInvalid";
  }

  const guests = Number(guestsRaw);
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) {
    errors.guests = "guestsRange";
  }

  if (!datetime) {
    errors.datetime = "datetimeRequired";
  } else {
    const when = new Date(datetime);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
      errors.datetime = "datetimeFuture";
    } else {
      const hour = when.getHours();
      if (hour < 6 || hour > 21 || (hour === 21 && when.getMinutes() > 30)) {
        errors.datetime = "datetimeHours";
      }
    }
  }

  if (notes.length > 300) {
    errors.notes = "notesLong";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, status: "invalid", errors };
  }

  console.info("[THE HEAT] Đặt bàn", {
    name,
    phone,
    guests,
    datetime,
    notes: notes || undefined,
  });

  return {
    ...empty,
    ok: true,
    status: "success",
  };
}
