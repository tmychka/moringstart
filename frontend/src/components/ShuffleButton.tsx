/**
 * "Give me another set." Two cards rotate the same way on the same clock, so
 * they ask for a new draw with the same control rather than each drawing its own
 * arrows.
 */
import type { Theme } from "../types";

export default function ShuffleButton({
  t,
  label,
  onClick,
}: {
  t: Theme;
  /** What the button says it will draw again — it is the only description. */
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-none bg-transparent transition-colors ${t.iconBtn}`}
    >
      {/* Two paths crossing between two arrows: the shuffle mark everywhere
          else, drawn here so the card needs no icon dependency. */}
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3.6 6.4h3.2l9.6 11.2h3.6M3.6 17.6h3.2l3.4-4M14.2 8.4l2.2-2.6h3.6" />
        <path d="m17.6 3.4 2.4 2.4-2.4 2.4M17.6 15.2l2.4 2.4-2.4 2.4" />
      </svg>
    </button>
  );
}
