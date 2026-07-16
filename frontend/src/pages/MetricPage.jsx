import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import StepsTracker from "../components/StepsTracker";
import Notebook from "../components/Notebook";
import { getMetrics } from "../api";

export default function MetricPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
  });
  const metric = metrics.find((m) => String(m.id) === String(id));

  if (metric?.type === "notebook") return <Notebook id={id} />;
  if (metric?.type === "steps") return <StepsTracker id={id} />;

  return (
    <div className="relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-navy px-6 text-center text-white">
      <button
        onClick={() => navigate("/")}
        className="absolute left-7 top-7 z-20 cursor-pointer border-none bg-transparent p-0 text-[0.65rem] uppercase tracking-[0.18em] text-white/25 transition-colors hover:text-white/60"
      >
        ← Back
      </button>

      {metric ? (
        <>
          <h1 className="m-0 text-[2rem] font-extralight tracking-[0.02em]">
            {metric.name}
          </h1>
          <p className="mt-3 text-[0.8rem] uppercase tracking-[0.2em] text-white/40">
            Tracking for this metric is coming soon
          </p>
        </>
      ) : (
        <p className="text-[0.8rem] uppercase tracking-[0.2em] text-white/40">
          {isLoading ? "Loading…" : "Metric not found"}
        </p>
      )}
    </div>
  );
}
