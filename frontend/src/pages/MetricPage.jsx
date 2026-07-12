import { useParams, useNavigate } from "react-router-dom";
import StepsTracker from "../components/StepsTracker";
import Notebook from "../components/Notebook";

export default function MetricPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  if (id === "1") return <Notebook id={id} />;
  if (id === "4") return <StepsTracker id={id} />;

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: "#0a0f1e",
        overflow: "hidden",
      }}
    >
      {/* Subtle back navigation */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute",
          top: "28px",
          left: "28px",
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.15)",
          fontSize: "0.65rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          cursor: "pointer",
          fontFamily: "inherit",
          zIndex: 20,
          transition: "color 0.2s",
          padding: 0,
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.color = "rgba(255,255,255,0.6)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.color = "rgba(255,255,255,0.15)")
        }
      >
        ← Back
      </button>
    </div>
  );
}
