"use client";

import { useEffect, useState } from "react";

interface Props {
  score: number;
}

const MIN = 300;
const MAX = 850;
const R = 88;
const CX = 100;
const CY = 100;
const CIRC = 2 * Math.PI * R;

function getColor(score: number): string {
  if (score < 500) return "#f43f5e"; // Harmonious HSL rose-red
  if (score < 650) return "#f59e0b"; // Curated amber-yellow
  if (score < 750) return "#06b6d4"; // Vibrant cyan-blue
  return "#10b981"; // Vibrant emerald-green
}

function getBand(score: number): string {
  if (score < 500) return "Poor Rating";
  if (score < 650) return "Fair Reputation";
  if (score < 750) return "Good Reputation";
  if (score < 800) return "Great Reputation";
  return "Elite Status";
}

function getLTV(score: number): string {
  if (score >= 800) return "85% Max LTV";
  if (score >= 700) return "78% Max LTV";
  if (score >= 600) return "70% Max LTV";
  if (score >= 500) return "60% Max LTV";
  return "50% Max LTV";
}

export default function ScoreRing({ score }: Props) {
  const [displayed, setDisplayed] = useState(300);
  const pct = (score - MIN) / (MAX - MIN);
  const fillLen = pct * CIRC;
  const color = getColor(score);

  useEffect(() => {
    const duration = 1200;
    const start = Date.now();
    const step = () => {
      const elapsed = Math.min(Date.now() - start, duration);
      const progress = elapsed / duration;
      const current = Math.round(300 + (score - 300) * easeOutCubic(progress));
      setDisplayed(current);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [score]);

  return (
    <div className="flex flex-col items-center gap-4 relative py-2">
      {/* Background radial soft blur matching active rating state */}
      <div
        className="absolute inset-0 -z-10 rounded-full blur-[60px] opacity-20 transition-all duration-500"
        style={{
          backgroundColor: color,
          transform: "scale(0.8)",
        }}
      />

      <div className="relative">
        <svg width="220" height="220" viewBox="0 0 200 200" className="drop-shadow-2xl">
          {/* Base track */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#0f172a" strokeWidth="12" />
          
          {/* Active SVG Ring */}
          <circle
            cx={CX}
            cy={CY}
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeDasharray={`${fillLen} ${CIRC - fillLen}`}
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
            style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.1, 1, 0.1, 1)" }}
          />

          {/* Central numeric score */}
          <text
            x={CX}
            y={CY + 10}
            textAnchor="middle"
            fontSize="3.2rem"
            fontWeight="900"
            fill="#ffffff"
            className="font-sans font-black tracking-tight"
          >
            {displayed}
          </text>
        </svg>
      </div>

      {/* Credit Band & LTV Pill */}
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-xs uppercase font-extrabold tracking-widest text-slate-500">
          CREDIT RATING
        </span>
        <span
          className="text-base font-black transition-all"
          style={{ color }}
        >
          {getBand(score)}
        </span>
        <div
          className="mt-2 inline-flex items-center gap-1.5 rounded-full px-4 py-1 text-xs font-bold tracking-wide uppercase shadow-sm border border-white/5"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {getLTV(score)}
        </div>
      </div>
    </div>
  );
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}
