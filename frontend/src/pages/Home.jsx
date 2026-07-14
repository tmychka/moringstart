import { useState, useEffect } from "react";
import HumanFigure from "../components/HumanFigure";
import MetricsOverlay from "../components/MetricsOverlay";
import ManageMetrics from "../components/ManageMetrics";
import { getMetrics } from "../api";

export default function Home() {
  const [metrics, setMetrics] = useState([]);
  const [showManage, setShowManage] = useState(false);

  useEffect(() => {
    getMetrics().then(setMetrics).catch(console.error);
  }, []);

  const reload = () => getMetrics().then(setMetrics).catch(console.error);

  return (
    <div className="relative w-screen h-screen bg-white overflow-hidden">
      {/* 3D canvas */}
      <HumanFigure rotate={false} />

      {/* Metrics arc */}
      <MetricsOverlay metrics={metrics} visible={true} />

      {/* App title */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center pointer-events-none z-20">
        <p className="m-0 text-[0.65rem] tracking-[0.3em] uppercase text-black font-light">
          Morning Start
        </p>
      </div>

      {/* Manage metrics button */}
      <button
        onClick={() => setShowManage(true)}
        className="absolute bottom-7 right-7 z-20 bg-transparent border border-[#134e4a] text-[#134e4a] rounded-lg py-[7px] px-4 text-[0.65rem] tracking-[0.18em] uppercase cursor-pointer font-normal font-[inherit] transition-colors duration-200 hover:text-[#0736ab] hover:border-[#0736ab]"
      >
        Metrics
      </button>

      {/* Manage modal */}
      {showManage && (
        <ManageMetrics
          metrics={metrics}
          onClose={() => setShowManage(false)}
          onReload={reload}
        />
      )}
    </div>
  );
}
