import { useCallback } from "react";
import { Navigate, useParams, useNavigate } from "react-router-dom";
import StepsTracker from "../components/StepsTracker";
import Developer from "../components/Developer";
import EnglishWords from "../components/EnglishWords";
import Todos from "./Todos";
import { areaBySlug, type Area } from "../areas";
import { topicBySlug } from "../developerTopics";
import {
  DEFAULT_ENGLISH_SECTION,
  englishSectionBySlug,
} from "../englishSections";
import { labelClass, useTheme } from "../theme";
import { useBackGesture } from "../useBackGesture";

/**
 * One route for every area: `/:area` picks which page to render, and the two
 * segments below it belong to that page — a Developer subject and one of its
 * workspace pages, or the section a sectioned area is showing.
 */
export default function AreaPage() {
  const { area: slug, section, pageId } = useParams();
  const navigate = useNavigate();

  // Runs for every branch below, so arrows and the trackpad leave any area page
  // the same way its own back control does.
  useBackGesture(useCallback(() => navigate("/"), [navigate]));

  const area = areaBySlug(slug);
  if (!area) return <NotFound />;

  switch (area.kind) {
    case "todos":
      return <Todos />;
    // The route param is handed down verbatim: child query keys are built from
    // it. An unknown subject slug falls through to the hub rather than to
    // "not found".
    case "notebook":
      return <Developer topic={topicBySlug(section)} pageId={pageId} />;
    // Vocabulary is the only section so far, so the bare area URL lands on it
    // and the sidebar always has an entry marked as the page you're on.
    case "vocabulary":
      return englishSectionBySlug(section) ? (
        <EnglishWords />
      ) : (
        <Navigate
          to={`/${area.slug}/${DEFAULT_ENGLISH_SECTION.slug}`}
          replace
        />
      );
    case "steps":
      return <StepsTracker />;
    case "soon":
      return <ComingSoon area={area} />;
  }
}

/** An area that exists in the nav but has no tracking behind it yet. */
function ComingSoon({ area }: { area: Area }) {
  const { t } = useTheme();
  const navigate = useNavigate();

  return (
    <div
      className={`relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden px-6 text-center transition-colors duration-300 ${t.page}`}
    >
      <BackButton onClick={() => navigate("/")} />
      <h1 className="m-0 text-[2rem] font-extralight tracking-[0.02em]">
        {area.label}
      </h1>
      <p className={`${labelClass(t)} mt-3`}>
        Tracking for this area is coming soon
      </p>
    </div>
  );
}

function NotFound() {
  const { t } = useTheme();
  const navigate = useNavigate();

  return (
    <div
      className={`relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden px-6 text-center transition-colors duration-300 ${t.page}`}
    >
      <BackButton onClick={() => navigate("/")} />
      <p className={labelClass(t)}>Nothing here</p>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTheme();

  return (
    <button
      onClick={onClick}
      className={`absolute left-7 top-7 z-20 cursor-pointer border-none bg-transparent p-0 text-[0.65rem] uppercase tracking-[0.18em] transition-colors ${t.faint} hover:opacity-70`}
    >
      ← Back
    </button>
  );
}
