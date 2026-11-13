import React from 'react';

interface SemicircleGaugeCardProps {
  title: string;
  currentValue: number;
  targetValue: number;
  unitLabel?: string;
  decimals?: number;
  compact?: boolean;
  presentation?: boolean;
  themeColor?: 'blue' | 'emerald' | 'indigo' | 'amber';
  isMonthly?: boolean;
}

export const SemicircleGaugeCard: React.FC<SemicircleGaugeCardProps> = ({
  title,
  currentValue,
  targetValue,
  decimals = 0,
  compact = false,
  presentation = false,
  isMonthly,
}) => {
  const safeTarget = Math.max(1, targetValue || 1);
  const ratio = Math.max(0, Math.min(1.5, currentValue / safeTarget));
  const clampedRatio = Math.min(1, ratio);
  const percentage = Math.round((currentValue / safeTarget) * 100);

  // SVG Half-Donut Geometry: Center at (200, 180), Radius = 135, StrokeWidth = 36
  // Left foot center: x=65, y=180. Right foot center: x=335, y=180.
  // Apex of inner arc: y=63. Semicircle baseline: y=180.
  // Center of hollow space: x=200, y=136.
  const radius = 135;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - clampedRatio);

  const formattedCurrent = currentValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });

  const formattedTarget = (targetValue || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  // Check if monthly gauge based on title or prop
  const monthly = isMonthly ?? title.toLowerCase().includes('mensal');

  // Exact color matching:
  // - Vermelho quando abaixo da meta (< 70%)
  // - Azul Royal ao se aproximar e bater a meta diária (Multilinea)
  const getArcColor = () => {
    if (monthly) {
      if (percentage >= 70) return '#10b981'; // Verde quando a meta estiver próxima ou batida!
      return '#964b00';
    }
    if (percentage >= 100) return '#1e40af'; // Azul Royal escuro oficial MultiLinea
    if (percentage >= 85) return '#2563eb'; // Azul Royal intenso
    if (percentage >= 70) return '#3b82f6'; // Azul vibrante
    return '#ef4444'; // Vermelho atenção
  };

  const arcColor = getArcColor();

  // Dynamic font size so values with decimals (e.g. 1.020,2 or 44.319,6) remain perfectly centered and never look cramped
  const getCenterFontSize = () => {
    const len = formattedCurrent.length;
    if (len <= 4) return compact ? '26px' : presentation ? '50px' : '44px';
    if (len <= 6) return compact ? '22px' : presentation ? '42px' : '36px';
    return compact ? '18px' : presentation ? '34px' : '30px';
  };

  return (
    <div
      className={`bg-white border border-slate-200/90 shadow-xs rounded-2xl flex flex-col justify-between transition-all overflow-hidden text-slate-800 ${
        compact ? 'p-2 sm:p-2.5 h-full min-h-0' : presentation ? 'p-4 sm:p-6 h-full' : 'p-4 sm:p-6'
      }`}
    >
      {/* Title at top */}
      <div className="shrink-0 flex items-center justify-between pb-1.5 border-b border-slate-100">
        <h2 className={`${compact ? 'text-xs sm:text-sm font-bold' : 'text-sm sm:text-base lg:text-lg font-bold'} text-slate-900 tracking-tight`}>
          {title}
        </h2>
        {percentage > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {percentage}%
          </span>
        )}
      </div>

      {/* SVG Semicircle Gauge Graphic */}
      <div className="relative w-full flex-1 min-h-0 flex flex-col items-center justify-center my-auto py-0.5">
        <svg
          viewBox="0 0 400 220"
          className={`w-full h-auto overflow-visible ${
            compact ? 'max-w-[200px] sm:max-w-[230px] max-h-[110px] sm:max-h-[125px]' : presentation ? 'max-w-[94%] max-h-[38vh]' : 'max-w-[500px]'
          }`}
          aria-label={title}
        >
          {/* Background Outer Guide Arc Light Gray */}
          <path
            d="M 65 180 A 135 135 0 0 1 335 180"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="36"
            strokeLinecap="butt"
          />

          {/* Foreground Progress Arc */}
          {clampedRatio > 0 && (
            <path
              d="M 65 180 A 135 135 0 0 1 335 180"
              fill="none"
              stroke={arcColor}
              strokeWidth="36"
              strokeLinecap="butt"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-700 ease-out"
            />
          )}

          {/* Center Metric Display */}
          <text
            x="200"
            y="136"
            textAnchor="middle"
            dominantBaseline="middle"
            alignmentBaseline="middle"
            className="font-black tabular-nums"
            style={{
              fontSize: getCenterFontSize(),
              fontWeight: 900,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fill: '#0f172a',
              textAnchor: 'middle',
              dominantBaseline: 'middle',
              alignmentBaseline: 'middle',
            }}
          >
            {formattedCurrent}
          </text>

          {/* Left Baseline: 0 */}
          <text
            x="65"
            y="208"
            textAnchor="middle"
            dominantBaseline="middle"
            alignmentBaseline="middle"
            className="font-medium text-slate-500"
            style={{
              fontSize: compact ? '12px' : '15px',
              fontWeight: 600,
              fill: '#64748b',
              textAnchor: 'middle',
              dominantBaseline: 'middle',
              alignmentBaseline: 'middle',
            }}
          >
            0
          </text>

          {/* Right Baseline: Target (Formatted) */}
          <text
            x="335"
            y="208"
            textAnchor="middle"
            dominantBaseline="middle"
            alignmentBaseline="middle"
            className="font-medium text-slate-500"
            style={{
              fontSize: compact ? '12px' : '15px',
              fontWeight: 600,
              fill: '#64748b',
              textAnchor: 'middle',
              dominantBaseline: 'middle',
              alignmentBaseline: 'middle',
            }}
          >
            {formattedTarget}
          </text>
        </svg>
      </div>
    </div>
  );
};
