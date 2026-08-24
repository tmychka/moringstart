import figureImg from "../assets/human-figure.png";

/**
 * Fills the height it is given and keeps its own proportions, standing on the
 * bottom edge. It is placed by the column it sits in rather than by itself —
 * the page is one panel now, and the figure is the middle of it.
 */
export default function HumanFigure() {
  return (
    <img
      src={figureImg}
      alt=""
      className="h-full w-auto max-w-full select-none object-contain object-bottom"
    />
  );
}
