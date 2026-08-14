import { useCallback } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import StepsTracker from "../components/StepsTracker";
import Developer from "../components/Developer";
import EnglishWords from "../components/EnglishWords";
import { getMetrics } from "../api";
import { topicBySlug } from "../developerTopics";
import {
  DEFAULT_ENGLISH_SECTION,
  englishSectionBySlug,
} from "../englishSections";
import { labelClass, useTheme } from "../theme";
import { useBackGesture } from "../useBackGesture";

// "Learn English" is seeded as a generic metric, so it's routed by id instead of type.
const ENGLISH_METRIC_ID = "2";

export default function MetricPage() {
  const { id, topic: topicSlug, pageId } = useParams();
  const navigate = useNavigate();
  const { t } = useTheme();
  const { data: metrics = [], isLoading } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
  });
  const metric = metrics.find((m) => String(m.id) === String(id));

  // Runs for every branch below, so arrows and the trackpad leave any metric
  // page the same way its "← Back" button does.
  useBackGesture(useCallback(() => navigate("/"), [navigate]));

  // Learn English is a section page: the bare metric URL (and any slug that
  // isn't a section) redirects onto one, so the sidebar always has an entry
  // marked as the page you're on.
  if (id === ENGLISH_METRIC_ID) {
    return englishSectionBySlug(topicSlug) ? (
      <EnglishWords id={id} />
    ) : (
      <Navigate to={`/metric/${id}/${DEFAULT_ENGLISH_SECTION.slug}`} replace />
    );
  }
  // The route param is handed down verbatim: child query keys are built from it, and
  // the dashboard builds the same keys with `String(metric.id)`, so they must match.
  // An unknown subject slug falls through to the hub rather than to "not found".
  if (id && metric?.type === "notebook")
    return <Developer id={id} topic={topicBySlug(topicSlug)} pageId={pageId} />;
  if (id && metric?.type === "steps") return <StepsTracker id={id} />;

  return (
    <div
      className={`relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden px-6 text-center transition-colors duration-300 ${t.page}`}
    >
      <button
        onClick={() => navigate("/")}
        className={`absolute left-7 top-7 z-20 cursor-pointer border-none bg-transparent p-0 text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${t.faint} hover:opacity-70`}
      >
        ← Back
      </button>

      {metric ? (
        <>
          <h1 className="m-0 text-[2rem] font-extralight tracking-[0.02em]">
            {metric.name}
          </h1>
          <p className={`${labelClass(t)} mt-3`}>
            Tracking for this metric is coming soon
          </p>
        </>
      ) : (
        <p className={labelClass(t)}>
          {isLoading ? "Loading…" : "Metric not found"}
        </p>
      )}
    </div>
  );
}
