import type { CSSProperties } from "react";
import horse from "../assets/horse.png";

type MarkProps = {
  size?: number;
  style?: CSSProperties;
  className?: string;
};

const Mark = ({ size = 32, style, className }: MarkProps) => (
  <img
    src={horse}
    width={size}
    height={size}
    style={{ borderRadius: "50%", display: "block", ...style }}
    className={className}
    alt=""
    aria-hidden="true"
    draggable={false}
  />
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
      <Mark size={size} />
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
