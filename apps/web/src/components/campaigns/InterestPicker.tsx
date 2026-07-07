"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Input, Label, Spinner } from "@/components/ui";

export interface Interest {
  id: string;
  name: string;
  type?: string;
  audienceSizeLower?: number;
  audienceSizeUpper?: number;
  topic?: string;
}

function fmtSize(lower?: number, upper?: number): string {
  if (!lower) return "";
  const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`);
  return upper ? `${k(lower)}–${k(upper)}` : k(lower);
}

/**
 * Detailed-targeting picker: searches Meta's interest taxonomy (via the client's
 * connected account, or the mock catalog pre-connection) and lets the user build
 * a targeting set. Selected interests are lifted into the campaign targetingDraft.
 */
export function InterestPicker({
  clientId,
  selected,
  onChange,
}: {
  clientId: string;
  selected: Interest[];
  onChange: (v: Interest[]) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Interest[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!clientId || q.trim().length < 2) {
      setResults([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.metaInterests(clientId, q.trim());
        setResults(res ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, clientId]);

  const add = (it: Interest) => {
    if (!selected.some((s) => s.id === it.id)) onChange([...selected, it]);
    setQ("");
    setResults([]);
    setOpen(false);
  };
  const remove = (id: string) => onChange(selected.filter((s) => s.id !== id));

  const available = results.filter((r) => !selected.some((s) => s.id === r.id));

  return (
    <div>
      <Label>תחומי עניין לטירגוט (Detailed Targeting)</Label>
      <div className="relative">
        <div className="relative">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder={clientId ? "חפש תחום עניין… (למשל: כושר, נדל״ן)" : "בחר לקוח תחילה"}
            disabled={!clientId}
          />
          {loading && <Spinner className="absolute end-3 top-2.5 h-4 w-4 text-brand-500" />}
        </div>
        {open && available.length > 0 && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {available.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => add(it)}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-start text-sm hover:bg-brand-50"
              >
                <span className="text-slate-800">
                  {it.name}
                  {it.topic && <span className="text-slate-400"> · {it.topic}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-400" dir="ltr">
                  {fmtSize(it.audienceSizeLower, it.audienceSizeUpper)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selected.map((it) => (
            <span
              key={it.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700"
            >
              {it.name}
              {it.audienceSizeLower ? (
                <span className="text-xs text-brand-400" dir="ltr">
                  {fmtSize(it.audienceSizeLower, it.audienceSizeUpper)}
                </span>
              ) : null}
              <button type="button" onClick={() => remove(it.id)} className="text-brand-400 hover:text-red-500">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="mt-1 text-xs text-slate-400">
        חיפוש בטקסונומיית הטירגוט של Meta. הקהלים מתווספים לטיוטת הקמפיין.
      </p>
    </div>
  );
}
