"use client";

import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/components/ui/Toast";
import { Button, Card, CardBody, EmptyState, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/format";

export function MediaLibrary({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const { data, loading, reload } = useApi(() => api.assets(clientId), [clientId]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast("הקובץ גדול מדי (מקסימום 8MB)", "error");
      return;
    }
    setUploading(true);
    try {
      const dataBase64 = await toBase64(file);
      await api.uploadAsset(clientId, {
        fileName: file.name,
        mimeType: file.type,
        kind: file.type.startsWith("video") ? "VIDEO" : "IMAGE",
        dataBase64,
      });
      toast("הקובץ הועלה", "success");
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "העלאה נכשלה", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  if (loading) return <Spinner className="mx-auto my-10 h-7 w-7 text-brand-600" />;
  const assets = data ?? [];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <Button onClick={() => inputRef.current?.click()} loading={uploading}>
          ⬆ העלה מדיה
        </Button>
      </div>

      {assets.length === 0 ? (
        <EmptyState title="אין נכסי מדיה" description="העלו תמונות או וידאו לשימוש במודעות." />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {assets.map((a: any) => (
            <Card key={a.id} className="overflow-hidden">
              <div className="flex aspect-square items-center justify-center bg-slate-100">
                {a.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.fileName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-3xl">🎬</span>
                )}
              </div>
              <CardBody className="p-3">
                <div className="truncate text-xs font-medium text-slate-700" dir="ltr">
                  {a.fileName}
                </div>
                <div className="text-xs text-slate-400">{formatDate(a.createdAt)}</div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
