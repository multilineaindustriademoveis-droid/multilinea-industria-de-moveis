import React from 'react';

interface CorteDailyHeroCardProps {
  title: string;
  materialSpec: string;
  machineNote?: string;
  icon: string;
  theme: 'sky' | 'amber';
  doneTodayPrimary: number;
  targetDaily: number;
  doneTodayPieces: number;
  signedRemainingDaily: number;
  pctPrimary: number;
  isTvMode?: boolean;
}

export const CorteDailyHeroCard: React.FC<CorteDailyHeroCardProps> = ({
  title,
  materialSpec,
  machineNote = 'Giben + Selco',
  icon,
  theme,
  doneTodayPrimary,
  targetDaily,
  doneTodayPieces,
  signedRemainingDaily,
  pctPrimary,
  isTvMode = false,
}) => {
  const safeTarget = Math.max(1, targetDaily || 1);
  const ratio = Math.max(0, Math.min(1.5, doneTodayPrimary / safeTarget));
  const clampedRatio = Math.min(1, ratio);

  // Semicircle Arc Geometry (strokeWidth 36 com proporções perfeitas):
  // Center: (210, 172), Radius: 138, StrokeWidth: 36
  // Left foot center: (72, 172). Right foot center: (348, 172).
  // Inner hollow radius: 138 - 18 = 120. Apex of inner arc: y = 172 - 120 = 52.
  // Hollow vertical region: y = 52 to y = 172 (120px de espaço vertical livre).
  // At y = 82 (Label "REALIZADO HOJE"): safe distance do ápice interno é 30px! Largura livre interna é 158px.
  // At y = 122 (Grande Número + m²): largura livre interna é 218px!
  // At y = 153 (Attainment pill): largura livre interna é 237px!
  // At y = 210 (Marcadores da Base 0 m² e Meta): perfeitamente alinhados aos centros dos pés (72 e 348).
  const radius = 138;
  const strokeWidth = 36;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - clampedRatio);

  const isSky = theme === 'sky';
  const borderColor = isSky ? 'border-sky-400 ring-1 ring-sky-200' : 'border-amber-400 ring-1 ring-amber-200';
  const iconBg = isSky ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-amber-50 text-amber-800 border-amber-200';
  const tagBg = isSky ? 'bg-sky-50 text-sky-800 border-sky-200' : 'bg-amber-50 text-amber-800 border-amber-200';

  // Arc Color Logic:
  // - Vermelho quando abaixo da meta (< 70%)
  // - Azul Royal vibrante ao se aproximar (70% - 99%)
  // - Azul escuro (cor da logo Multilinea / Azul Royal profundo #1d4ed8 / #1e40af) ao atingir ou superar a meta (>= 100%)
  const getArcColor = () => {
    if (pctPrimary >= 100) return '#1e40af'; // Azul escuro Multilinea (blue-800)
    if (pctPrimary >= 85) return '#2563eb'; // Azul Royal vibrante (blue-600)
    if (pctPrimary >= 70) return '#3b82f6'; // Azul intermediário (blue-500)
    return '#ef4444'; // Vermelho atenção (red-500)
  };
  const arcColor = getArcColor();

  const formattedCurrent = doneTodayPrimary.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const formattedTarget = targetDaily.toLocaleString('pt-BR', {
    maximumFractionDigits: 0,
  });

  // Dynamic SVG font size based on number length so it NEVER overflows the arc
  const getCenterNumberFontSize = () => {
    const len = formattedCurrent.length;
    if (len <= 4) return '38px';
    if (len <= 6) return '34px';
    if (len <= 8) return '29px';
    return '25px';
  };

  // Badge pill colors for SVG:
  const badgeColors =
    pctPrimary >= 100
      ? { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: '✓' }
      : pctPrimary >= 70
      ? { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', icon: '⚡' }
      : { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', icon: '⏳' };

  // Cor do grande número no centro do arco
  const numberHex =
    pctPrimary >= 100
      ? '#091428'
      : pctPrimary >= 70
      ? '#091428'
      : '#b91c1c';

  return (
    <div
      className={`bg-white rounded-3xl border-2 ${borderColor} flex flex-col justify-between shadow-xs overflow-hidden transition-all ${
        isTvMode ? 'p-2 sm:p-2.5 lg:p-3 h-full min-h-0' : 'p-4 sm:p-6'
      }`}
    >
      {/* 1. Header do Cartão: Título, Especificação e Total de Peças */}
      <div className={`flex items-center justify-between gap-2 border-b border-slate-100 shrink-0 ${isTvMode ? 'pb-1' : 'pb-2'}`}>
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <div
            className={`rounded-xl border flex items-center justify-center shrink-0 ${
              isTvMode
                ? 'w-7 h-7 sm:w-8 sm:h-8 text-sm sm:text-base'
                : 'w-8 h-8 sm:w-10 sm:h-10 text-base sm:text-lg'
            } ${iconBg}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className={`${isTvMode ? 'text-xs sm:text-sm font-black' : 'text-xs sm:text-sm lg:text-base font-black'} tracking-tight text-slate-900 uppercase font-sans truncate`}>
                {title}
              </h3>
              <span
                className={`font-mono ${isTvMode ? 'text-[9px] sm:text-[10px]' : 'text-[9px] sm:text-[11px]'} font-bold px-1.5 py-0.5 rounded-md border ${tagBg}`}
              >
                {materialSpec}
              </span>
            </div>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">
              {machineNote}
            </p>
          </div>
        </div>

        {/* Peças Cortadas no Dia */}
        <div className="shrink-0 text-right">
          <div className={`inline-flex items-center gap-1 rounded-xl bg-slate-900 text-white ${isTvMode ? 'px-2 py-0.5' : 'px-2 py-0.5 sm:px-2.5 sm:py-1'}`}>
            <span className={`font-mono font-black text-amber-300 ${isTvMode ? 'text-xs sm:text-sm' : 'text-xs sm:text-sm lg:text-base'}`}>
              {doneTodayPieces.toLocaleString('pt-BR')}
            </span>
            <span className="text-[9px] sm:text-[11px] font-bold text-slate-300 font-sans">pçs</span>
          </div>
        </div>
      </div>

      {/* 2. Centro Visual: Gráfico Semicírculo 100% Vetorial Ampliado
          TODOS os textos e números estão dentro do SVG com coordenadas calculadas para NUNCA sobrepor o arco */}
      <div
        className={`relative flex-1 min-h-0 flex items-center justify-center my-auto w-full overflow-hidden ${
          isTvMode ? 'py-0.5' : 'py-2 min-h-[210px] sm:min-h-[250px] lg:min-h-[285px]'
        }`}
      >
        <svg
          viewBox="0 0 420 230"
          className="w-full h-full max-h-full max-w-[620px] select-none transition-transform"
          preserveAspectRatio="xMidYMid meet"
          aria-label={`${title} Realizado`}
        >
          {/* Definições de Sombra / Gradientes Suaves */}
          <defs>
            <filter id={`shadow-${theme}`} x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.08" />
            </filter>
          </defs>

          {/* 1. Trilho de Fundo do Semicírculo (Cinza Claro) */}
          <path
            d="M 72 172 A 138 138 0 0 1 348 172"
            fill="none"
            stroke="#ececec"
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />

          {/* 2. Arco de Progresso do Realizado (Transição dinâmica de vermelho até azul royal / escuro) */}
          {clampedRatio > 0 && (
            <path
              d="M 72 172 A 138 138 0 0 1 348 172"
              fill="none"
              stroke={arcColor}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-700 ease-out"
            />
          )}

          {/* 3. Marcador Esquerdo da Base: 0 m² */}
          <text
            x="72"
            y="210"
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-bold font-mono"
            style={{
              fontSize: '13px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fill: '#0f172a',
            }}
          >
            0 m²
          </text>

          {/* 4. Marcador Direito da Base: Meta Diária */}
          <text
            x="348"
            y="210"
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-bold font-mono"
            style={{
              fontSize: '13px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fill: '#0f172a',
            }}
          >
            Meta: {formattedTarget} m²
          </text>

          {/* 5. Título Central: "REALIZADO HOJE" */}
          <text
            x="210"
            y="82"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{
              fontSize: '11px',
              letterSpacing: '0.14em',
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontWeight: 800,
              fill: '#1e293b',
            }}
          >
            REALIZADO HOJE
          </text>

          {/* 6. Grande Valor Numérico Realizado */}
          <text
            x="210"
            y="122"
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-bold tabular-nums"
            style={{
              fontSize: getCenterNumberFontSize(),
              fontWeight: 900,
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fill: numberHex,
            }}
          >
            {formattedCurrent}
            <tspan
              dx="4"
              dy="-1"
              style={{
                fontSize: '16px',
                fontWeight: 800,
                fill: '#475569',
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              m²
            </tspan>
          </text>

          {/* 7. Pill com Ritmo da Meta */}
          <g transform="translate(210, 153)">
            <rect
              x="-68"
              y="-12"
              width="136"
              height="24"
              rx="12"
              fill={badgeColors.bg}
              stroke={badgeColors.border}
              strokeWidth="1"
              filter={`url(#shadow-${theme})`}
            />
            <text
              x="0"
              y="1"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: '11px',
                fontWeight: 800,
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fill: badgeColors.text,
              }}
            >
              {badgeColors.icon} {pctPrimary}% da meta diária
            </text>
          </g>
        </svg>
      </div>

      {/* 3. Rodapé do Cartão: 3 Blocos de Apoio (Total Cortado, Meta Diária, Saldo Restante) */}
      <div className={`grid grid-cols-3 gap-1.5 sm:gap-2 border-t border-slate-100 shrink-0 ${isTvMode ? 'pt-1 sm:pt-1.5' : 'pt-2'}`}>
        {/* Coluna 1: Total Produzido */}
        <div className={`bg-slate-50/90 border border-slate-100 rounded-xl text-center ${isTvMode ? 'p-1 sm:p-1.5' : 'p-1.5 sm:p-2'}`}>
          <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 block uppercase font-sans tracking-wide">
            Total Cortado
          </span>
          <span className={`font-mono font-black text-slate-900 block leading-tight ${isTvMode ? 'text-xs sm:text-sm lg:text-base' : 'text-xs sm:text-sm lg:text-base'}`}>
            {formattedCurrent} <span className="text-[9px] font-bold text-slate-500 font-sans">m²</span>
          </span>
          <span className="text-[9px] sm:text-[10px] text-slate-500 font-mono font-medium truncate block">
            {doneTodayPieces.toLocaleString('pt-BR')} pçs
          </span>
        </div>

        {/* Coluna 2: Meta Diária */}
        <div className={`bg-slate-50/90 border border-slate-100 rounded-xl text-center ${isTvMode ? 'p-1 sm:p-1.5' : 'p-1.5 sm:p-2'}`}>
          <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 block uppercase font-sans tracking-wide">
            Meta Diária
          </span>
          <span className={`font-mono font-black text-slate-900 block leading-tight ${isTvMode ? 'text-xs sm:text-sm lg:text-base' : 'text-xs sm:text-sm lg:text-base'}`}>
            {formattedTarget} <span className="text-[9px] font-bold text-slate-500 font-sans">m²</span>
          </span>
          <span className="text-[9px] sm:text-[10px] text-slate-500 font-medium truncate block">
            Planejamento
          </span>
        </div>

        {/* Coluna 3: Saldo Restante */}
        <div className={`bg-slate-50/90 border border-slate-100 rounded-xl text-center ${isTvMode ? 'p-1 sm:p-1.5' : 'p-1.5 sm:p-2'}`}>
          <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 block uppercase font-sans tracking-wide">
            Saldo Restante
          </span>
          <span
            className={`font-mono font-black block leading-tight ${isTvMode ? 'text-xs sm:text-sm lg:text-base' : 'text-xs sm:text-sm lg:text-base'} ${
              signedRemainingDaily < 0 ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {signedRemainingDaily >= 0 ? '+' : ''}
            {signedRemainingDaily.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}{' '}
            <span className="text-[9px] font-bold text-slate-500 font-sans">m²</span>
          </span>
          <span
            className={`text-[9px] sm:text-[10px] font-bold truncate block ${
              signedRemainingDaily < 0 ? 'text-red-600' : 'text-emerald-700'
            }`}
          >
            {signedRemainingDaily < 0
              ? `Faltam ${Math.abs(signedRemainingDaily).toLocaleString('pt-BR', {
                  maximumFractionDigits: 1,
                })} m²`
              : 'Meta atingida!'}
          </span>
        </div>
      </div>
    </div>
  );
};
