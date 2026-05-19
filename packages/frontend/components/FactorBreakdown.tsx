"use client";

interface Factor {
  key: string;
  label: string;
  weight: string;
  description: string;
  score: number;
}

const FACTORS: Factor[] = [
  { key: "repaymentScore", label: "Repayment History", weight: "35%", description: "Percentage of stock-collateralized loans successfully repaid on time", score: 0 },
  { key: "stabilityScore", label: "Position Stability", weight: "25%", description: "Consistency of maintaining and holding positions without wash-trading", score: 0 },
  { key: "walletAgeScore", label: "Wallet Age", weight: "15%", description: "Time elapsed since first transaction on Robinhood Chain", score: 0 },
  { key: "consistencyScore", label: "Activity Consistency", weight: "15%", description: "Frequency and distribution of regular vs sporadic active days", score: 0 },
  { key: "diversScore", label: "Asset Diversification", weight: "10%", description: "Count of distinct whitelisted token assets held in balance", score: 0 },
];

function barColor(score: number): string {
  if (score < 40) return "#f43f5e"; // Rose Red
  if (score < 60) return "#f59e0b"; // Amber Yellow
  if (score < 80) return "#06b6d4"; // Cyan Blue
  return "#10b981"; // Emerald Green
}

interface Props {
  factors?: Record<string, number>;
}

export default function FactorBreakdown({ factors }: Props) {
  const items = FACTORS.map((f) => ({
    ...f,
    score: factors?.[f.key] ?? 0,
  }));

  return (
    <div className="rounded-2xl border border-slate-900 bg-slate-950/20 p-6 backdrop-blur-md">
      <h3 className="mb-6 text-xs font-extrabold uppercase tracking-widest text-slate-500">
        Reputation Sub-Factors
      </h3>
      <div className="space-y-5">
        {items.map((f) => {
          const color = barColor(f.score);
          return (
            <div key={f.key} className="group pb-1 border-b border-slate-900/40 last:border-b-0 last:pb-0">
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-200 transition group-hover:text-white">{f.label}</span>
                  <span className="text-[10px] text-slate-500 font-medium leading-normal mt-0.5 max-w-[90%] md:max-w-md">
                    {f.description}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-extrabold text-slate-400 font-mono tracking-wider mr-2 uppercase">Weight: {f.weight}</span>
                  <span className="text-sm font-black font-mono transition" style={{ color }}>
                    {f.score}/100
                  </span>
                </div>
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-900">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out"
                  style={{
                    width: `${f.score}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 10px ${color}30`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
