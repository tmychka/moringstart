import figureImg from "../assets/human-figure.png";

export default function HumanFigure() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <img
        src={figureImg}
        alt=""
        className="absolute bottom-[4.5vh] left-1/2 -translate-x-1/2 h-[80vh] w-auto select-none pointer-events-none"
      />
    </div>
  );
}
