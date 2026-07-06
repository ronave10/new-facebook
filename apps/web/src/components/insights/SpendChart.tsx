"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** RTL-friendly line chart (reversed X axis) with Hebrew labels. */
export function SpendChart({ data }: { data: { date: string; spend: number; leads: number }[] }) {
  if (!data.length) return <div className="py-10 text-center text-sm text-slate-400">אין נתונים להצגה</div>;
  return (
    <div dir="ltr" className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" reversed tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => v.slice(5)} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={40} />
          <Tooltip
            labelFormatter={(v) => `תאריך: ${v}`}
            formatter={(value: number, name: string) => [value, name === "spend" ? "הוצאה" : "לידים"]}
            contentStyle={{ direction: "rtl", fontSize: 12, borderRadius: 12, border: "1px solid #e2e8f0" }}
          />
          <Line type="monotone" dataKey="spend" stroke="#4F46E5" strokeWidth={2} dot={false} name="spend" />
          <Line type="monotone" dataKey="leads" stroke="#10B981" strokeWidth={2} dot={false} name="leads" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
