"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

interface Snapshot {
  score: number;
  timestamp: number;
}

interface Props {
  history: Snapshot[];
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ScoreHistory({ history }: Props) {
  if (!history.length) {
    return (
      <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-6 backdrop-blur-md flex flex-col justify-between min-h-[300px]">
        <h3 className="mb-4 text-xs font-extrabold uppercase tracking-widest text-slate-500">
          Reputation Audit History
        </h3>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <span className="text-2xl mb-2">📈</span>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed">
            No historical rating logs loaded. Complete borrow cycles to populate updates.
          </p>
        </div>
      </div>
    );
  }

  const data = history.map((h) => ({
    date: formatDate(h.timestamp),
    score: h.score,
  }));

  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-6 backdrop-blur-md">
      <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-slate-500">
        Reputation Audit History
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#0f172a" />
          <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} stroke="#0f172a" />
          <YAxis
            domain={[300, 850]}
            tick={{ fill: "#64748b", fontSize: 10 }}
            stroke="#0f172a"
          />
          <Tooltip
            contentStyle={{
              background: "#090d16",
              border: "1px solid #1e293b",
              borderRadius: "12px",
              color: "#ffffff",
              fontSize: "12px",
              fontFamily: "monospace",
            }}
          />
          <ReferenceLine y={500} stroke="#ef4444" strokeWidth={0.5} strokeDasharray="3 3" />
          <ReferenceLine y={650} stroke="#f59e0b" strokeWidth={0.5} strokeDasharray="3 3" />
          <ReferenceLine y={750} stroke="#10b981" strokeWidth={0.5} strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#06b6d4"
            strokeWidth={3}
            dot={{ r: 4, fill: "#06b6d4", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#06b6d4" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
