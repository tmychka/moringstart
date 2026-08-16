import HumanFigure from "../components/HumanFigure";
import AreasOverlay from "../components/AreasOverlay";

export default function Home() {
  return (
    <div className="relative w-screen h-screen bg-white overflow-hidden">
      <HumanFigure />

      <AreasOverlay />

      {/* App title */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center pointer-events-none z-20">
        <p className="m-0 text-[0.65rem] tracking-[0.3em] uppercase text-black font-light">
          Morning Start
        </p>
      </div>
    </div>
  );
}
