import type { CSSProperties } from "react";

type MarkProps = {
  size?: number;
  style?: CSSProperties;
  className?: string;
  strokeWidth?: number;
  gradientFrom?: string;
  gradientTo?: string;
};

const Mark = ({ size = 32, style, className, strokeWidth = 9, gradientFrom = "#4f6cff", gradientTo = "#3d57e0" }: MarkProps) => (
  <svg
    viewBox="0 0 64 64"
    width={size}
    height={size}
    style={style}
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="gmark-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={gradientFrom} />
        <stop offset="1" stopColor={gradientTo} />
      </linearGradient>
    </defs>
    <g stroke="url(#gmark-grad)" strokeWidth={strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M 50 19 A 22 22 0 1 0 50 45" />
      <path d="M 32 32 L 50 32" />
    </g>
  </svg>
);

type WordmarkProps = MarkProps & {
  showText?: boolean;
  textColor?: string;
};

export default function Logo({
  size = 28,
  showText = true,
  textColor = "currentColor",
  style,
  className,
  strokeWidth,
  gradientFrom,
  gradientTo,
}: WordmarkProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 9,
        lineHeight: 1,
        color: textColor,
        ...style,
      }}
      className={className}
    >
      <Mark
        size={size}
        strokeWidth={strokeWidth}
        gradientFrom={gradientFrom}
        gradientTo={gradientTo}
      />
      {showText && (
        <span
          style={{
            fontSize: Math.round(size * 0.78),
            fontWeight: 660,
            letterSpacing: "-0.022em",
            color: textColor,
            fontFamily: "var(--font)",
          }}
        >
          GOpencode
        </span>
      )}
    </span>
  );
}

export { Mark };
