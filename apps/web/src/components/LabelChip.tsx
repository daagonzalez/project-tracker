import type { Label } from "@tracker/shared";

/** Picks black or white text for readable contrast on the label's background colour. */
function textColor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r! * 299 + g! * 587 + b! * 114) / 1000 > 150 ? "#111827" : "#ffffff";
}

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: label.color, color: textColor(label.color) }}>
      {label.name}
    </span>
  );
}
