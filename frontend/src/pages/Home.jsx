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
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "white",
        overflow: "hidden",
      }}
    >
      {/* 3D canvas */}
      <HumanFigure rotate={false} />

      {/* Metrics arc */}
      <MetricsOverlay metrics={metrics} visible={true} />

      {/* App title */}
      <div
        style={{
          position: "absolute",
          top: "32px",
          left: "50%",
          transform: "translateX(-50%)",
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 20,
        }}
      >
        <p
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "black",
            margin: 0,
            fontWeight: 300,
          }}
        >
          Morning Start
        </p>
      </div>

      {/* Manage metrics button */}
      <button
        onClick={() => setShowManage(true)}
        style={{
          position: "absolute",
          bottom: "28px",
          right: "28px",
          background: "none",
          border: "1px solid #134e4a",
          color: "green",
          borderRadius: "8px",
          padding: "7px 16px",
          fontSize: "0.65rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          cursor: "pointer",
          fontFamily: "inherit",
          fontWeight: 400,
          zIndex: 20,
          transition: "color 0.2s, border-color 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#0736ab";
          e.currentTarget.style.borderColor = "#0736ab";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "#134e4a";
          e.currentTarget.style.borderColor = "#134e4a";
        }}
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
