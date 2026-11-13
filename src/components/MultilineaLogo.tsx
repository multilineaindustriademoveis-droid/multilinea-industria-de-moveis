import React from 'react';

interface MultilineaLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showMesBadge?: boolean;
}

export const MultilineaLogo: React.FC<MultilineaLogoProps> = ({
  size = 'md',
  showMesBadge = true,
}) => {
  const dimensions =
    size === 'sm'
      ? 'h-9 px-2.5 py-1'
      : size === 'lg'
      ? 'h-14 px-4 py-1.5'
      : 'h-11 px-3 py-1';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {/* Crisp white container so the charcoal "Multi", royal blue "Linea" and double wave swoosh stand out with 100% fidelity on the dark navy header */}
      <div
        className={`bg-white rounded-lg shadow-xs border border-blue-200/80 flex items-center justify-center ${dimensions}`}
      >
        <svg
          viewBox="0 0 350 96"
          className="h-full w-auto"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="MultiLinea Móveis"
        >
          {/* "Multi" in charcoal (#2b2b2b) + "Linea" in royal/navy blue (#0000cc) */}
          <text
            x="14"
            y="53"
            fontFamily="'Plus Jakarta Sans', 'Century Gothic', 'Avant Garde', sans-serif"
            fontSize="49"
            fontWeight="500"
            letterSpacing="-0.5"
          >
            <tspan fill="#2d2d2d">Multi</tspan>
            <tspan fill="#0000cc">Linea</tspan>
          </text>

          {/* "Móveis" subtitle tucked above the right curve of the wave */}
          <text
            x="236"
            y="73"
            fontFamily="'Plus Jakarta Sans', 'Century Gothic', sans-serif"
            fontSize="19.5"
            fontWeight="400"
            fill="#4a4a4a"
            letterSpacing="0.5"
          >
            Móveis
          </text>

          {/* Primary sweeping blue wave */}
          <path
            d="M 48 73 C 108 55, 162 56, 224 69 C 276 80, 316 83, 338 56 C 321 90, 273 91, 217 77 C 158 63, 105 63, 48 73 Z"
            fill="#0000cc"
          />

          {/* Secondary lower right accent wave */}
          <path
            d="M 210 83 C 266 95, 318 93, 344 61 C 325 99, 268 102, 210 83 Z"
            fill="#0000cc"
          />
        </svg>
      </div>

      {showMesBadge && (
        <span className="font-mono text-xs font-bold px-2 py-1 rounded-md bg-blue-950 text-amber-400 border border-blue-800 tracking-wider">
          MES
        </span>
      )}
    </div>
  );
};
