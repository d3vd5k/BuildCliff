import React from 'react';

interface CliffMarkerLabelProps {
  viewBox?: { x: number; y: number };
  deltaText?: string;
  onClick?: () => void;
}

export const CliffMarkerLabel: React.FC<CliffMarkerLabelProps> = ({
  viewBox,
  deltaText = '+3m20s',
  onClick,
}) => {
  if (!viewBox) return null;
  const { x, y } = viewBox;

  return (
    <g
      transform={`translate(${x}, ${y - 12})`}
      className="cursor-pointer select-none group"
      onClick={onClick}
    >
      {/* Background Chip */}
      <rect
        x="-45"
        y="-24"
        width="90"
        height="22"
        rx="4"
        fill="#10151D"
        stroke="#FF5C5C"
        strokeWidth="1.5"
        className="filter drop-shadow-[0_0_8px_rgba(255,92,92,0.4)]"
      />
      {/* Pulsing indicator dot */}
      <circle cx="-33" cy="-13" r="4" fill="#FF5C5C" className="animate-ping opacity-75" />
      <circle cx="-33" cy="-13" r="3" fill="#FF5C5C" />
      {/* Label Text */}
      <text
        x="-24"
        y="-9"
        fill="#FF5C5C"
        fontSize="11"
        fontWeight="700"
        fontFamily="JetBrains Mono"
      >
        CLIFF {deltaText}
      </text>
    </g>
  );
};

