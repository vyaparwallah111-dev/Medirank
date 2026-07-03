"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Upload } from "lucide-react";

const acceptedTypes = ["image/png", "image/jpeg", "image/webp"];

async function optimizeImage(file: File): Promise<File> {
  if (!acceptedTypes.includes(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Logo must be smaller than 5 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not process the image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("This browser could not process the image.");
  return new File([blob], "clinic-logo.webp", { type: "image/webp", lastModified: Date.now() });
}

export function ClinicLogoUpload({ currentLogoUrl }: { currentLogoUrl?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(currentLogoUrl || "");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  async function selectFile(file?: File) {
    if (!file) return;
    setProcessing(true);
    setError("");
    try {
      const optimized = await optimizeImage(file);
      const transfer = new DataTransfer();
      transfer.items.add(optimized);
      if (inputRef.current) inputRef.current.files = transfer.files;
      setPreview((previous) => {
        if (previous.startsWith("blob:")) URL.revokeObjectURL(previous);
        return URL.createObjectURL(optimized);
      });
    } catch (caught) {
      if (inputRef.current) inputRef.current.value = "";
      setError(caught instanceof Error ? caught.message : "Unable to process that image.");
    } finally {
      setProcessing(false);
    }
  }

  return <div>
    <label className="flex min-h-20 cursor-pointer items-center gap-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 transition hover:border-brand hover:bg-blue-50/40" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void selectFile(event.dataTransfer.files[0]); }}>
      {preview ? <img src={preview} alt="Clinic logo preview" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain ring-1 ring-slate-200" /> : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-slate-100"><ImageIcon size={22} /></span>}
      <span className="flex items-center gap-2"><Upload size={20} />{processing ? "Optimising logo…" : preview ? "Change PNG, JPG or WebP" : "Upload PNG, JPG or WebP"}</span>
      <input ref={inputRef} name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={processing} onChange={(event) => void selectFile(event.target.files?.[0])} />
    </label>
    <p className={`mt-2 text-xs ${error ? "text-red-600" : "text-slate-400"}`} role={error ? "alert" : undefined}>{error || "Images are resized to 1200 px and compressed for fast loading."}</p>
  </div>;
}
