"use client";

import { useState, useTransition } from "react";
import { uploadOpsPhoto } from "@/app/actions/ops";
import { opsCopy } from "@/data/copy-ops";
import { showToast } from "@/lib/client/toast-store";

const t = opsCopy.photo;
const MAX_DIM = 1600;

/** Nén ảnh trên máy (≤ 1600 px, JPEG) để vừa giới hạn 1 MB của Server Action và mạng 4G. */
async function compress(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const q of [0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= 1_000_000) return blob;
  }
  throw new Error("too_large");
}

/** Chụp/chọn ảnh → nén → tải lên → trả id (`/api/ops/files/<id>`). */
export function PhotoInput({ id, label, value, onChange }: { id: string; label: string; value: string | null; onChange: (id: string | null) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  return (
    <div>
      <p id={`${id}-label`} className="mb-1 text-sm text-secondary">
        {label}
      </p>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh nội bộ có kiểm tra phiên, không qua Image Optimization
          <img src={`/api/ops/files/${value}`} alt="" className="size-16 rounded-xl object-cover" />
        ) : null}
        <label className="inline-flex min-h-12 cursor-pointer items-center rounded-full bg-elevated px-5 text-[15px] font-semibold">
          {pending ? t.uploading : value ? t.change : t.add}
          <input
            id={id}
            type="file"
            accept="image/*"
            capture="environment"
            aria-labelledby={`${id}-label`}
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError(false);
              start(async () => {
                try {
                  const form = new FormData();
                  form.set("file", new File([await compress(file)], "photo.jpg", { type: "image/jpeg" }));
                  const res = await uploadOpsPhoto(form);
                  if (!res.ok) throw new Error(res.reason);
                  onChange(res.id);
                } catch {
                  setError(true);
                  showToast(t.failed);
                }
              });
            }}
          />
        </label>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {t.failed}
        </p>
      ) : null}
    </div>
  );
}
