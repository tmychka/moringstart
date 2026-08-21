import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getNotes, getRoadmap } from "../api";
import AppSidebar from "./AppSidebar";
import NextUp from "./NextUp";
import { DEVELOPER, ENGLISH } from "../areas";
import { timeAgo } from "../dashboardStats";
import { cardClass, labelClass, numeralClass, useTheme } from "../theme";
import { readWords } from "../englishWords";
import useNow from "../useNow";
import type { Milestone, Theme } from "../types";

const greetingFor = (hour: number): string => {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

// Re-reads on cross-tab writes; same-tab edits happen on a route that unmounts
// this component, so remounting already picks them up.
function useEnglishWords() {
  const [words, setWords] = useState(readWords);

  useEffect(() => {
    const sync = () => setWords(readWords());
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  return words;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const now = useNow();
  const words = useEnglishWords();
  const { t } = useTheme();

  // Query keys match the area pages, so the cache is shared both ways.
  const { data: notes } = useQuery({
    queryKey: ["notes", DEVELOPER.metricId],
    queryFn: () => getNotes(DEVELOPER.metricId),
  });
  const { data: milestones } = useQuery({
    queryKey: ["roadmap", DEVELOPER.metricId],
    queryFn: () => getRoadmap(DEVELOPER.metricId),
  });

  return (
    <div
      className={`relative flex h-full w-full overflow-hidden transition-colors duration-300 ${t.page}`}
    >
      <AppSidebar />

      <div className="h-full flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-6 pb-16 pt-8 sm:px-8">
          <Header now={now} t={t} />

          <div className="grid grid-cols-12 gap-3">
            <NextUp t={t} now={now} className="col-span-12" />
            <Roadmap
              t={t}
              className="col-span-12 md:col-span-4"
              milestones={milestones}
              onOpen={() => navigate(`/${DEVELOPER.slug}`)}
            />
            <Stat
              t={t}
              className="col-span-6 md:col-span-4"
              label="Vocabulary"
              value={words.length}
              hint={
                words.length
                  ? words
                      .slice(0, 2)
                      .map((w) => w.term)
                      .join(" · ")
                  : "No words saved"
              }
              onClick={() => navigate(`/${ENGLISH.slug}`)}
            />
            <Stat
              t={t}
              className="col-span-6 md:col-span-4"
              label="Developer"
              value={notes?.length ?? 0}
              hint={
                notes?.length
                  ? `Updated ${timeAgo(notes[0].updated_at, now)}`
                  : "Nothing written yet"
              }
              onClick={() => navigate(`/${DEVELOPER.slug}`)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ now, t }: { now: Date; t: Theme }) {
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header
      className={`flex items-end justify-between gap-4 border-b pb-4 ${t.rule}`}
    >
      <div className="min-w-0">
        <p className={labelClass(t)}>{date}</p>
        <h1 className={`m-0 mt-2 text-[1.7rem] leading-none ${numeralClass}`}>
          {greetingFor(now.getHours())}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <p
          className={`m-0 text-[1.7rem] leading-none ${t.faint} ${numeralClass}`}
        >
          {time}
        </p>
      </div>
    </header>
  );
}

function Meter({ ratio, t }: { ratio: number; t: Theme }) {
  return (
    <div
      className="mt-3 h-1 w-full overflow-hidden rounded-full"
      style={{ backgroundColor: t.track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${ratio * 100}%`, backgroundColor: t.accent }}
      />
    </div>
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  hint: ReactNode;
  className?: string;
  onClick?: () => void;
  t: Theme;
}

function Stat({ label, value, hint, className = "", onClick, t }: StatProps) {
  const body = (
    <>
      <p className={labelClass(t)}>{label}</p>
      <p className={`m-0 mt-2 text-[1.8rem] leading-none ${numeralClass}`}>
        {value}
      </p>
      <p className={`m-0 mt-2 truncate text-[0.7rem] ${t.muted}`}>{hint}</p>
    </>
  );

  // Stats sit next to much taller cards in the bento grid, so the body is
  // centred rather than pinned to the top of a stretched cell.
  const layout = "flex flex-col justify-center";

  if (!onClick) {
    return (
      <section className={`${cardClass(t)} ${className} ${layout}`}>
        {body}
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${cardClass(t)} ${className} ${layout} w-full cursor-pointer text-left transition-colors ${t.cardHover}`}
    >
      {body}
    </button>
  );
}

interface RoadmapProps {
  milestones: Milestone[] | undefined;
  onOpen?: () => void;
  className?: string;
  t: Theme;
}

function Roadmap({ milestones, onOpen, className = "", t }: RoadmapProps) {
  const total = milestones?.length ?? 0;
  const done = milestones?.filter((m) => m.status === "done").length ?? 0;
  const current = milestones?.find((m) => m.status === "in_progress");

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className={labelClass(t)}>Roadmap</p>
        {total > 0 && (
          <p className={`m-0 text-[0.7rem] ${t.muted}`}>
            {Math.round((done / total) * 100)}%
          </p>
        )}
      </div>
      {total === 0 || !milestones ? (
        <p className={`m-0 mt-2 text-[0.78rem] ${t.muted}`}>
          No milestones yet
        </p>
      ) : (
        <>
          <p className={`m-0 mt-2 text-[1.8rem] leading-none ${numeralClass}`}>
            {done}
            <span className={`ml-2 text-[0.8rem] ${t.muted}`}>of {total}</span>
          </p>
          <MilestoneTrack milestones={milestones} t={t} />
          <p
            className={`m-0 mt-2 flex items-center gap-2 truncate text-[0.7rem] ${t.muted}`}
          >
            {current ? (
              <>
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: t.progressDot }}
                />
                <span className="truncate">{current.title}</span>
              </>
            ) : (
              "Nothing in progress"
            )}
          </p>
        </>
      )}
    </>
  );

  const layout = "flex flex-col justify-center";

  if (!onOpen) {
    return (
      <section className={`${cardClass(t)} ${className} ${layout}`}>
        {body}
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${cardClass(t)} ${className} ${layout} w-full cursor-pointer text-left transition-colors ${t.cardHover}`}
    >
      {body}
    </button>
  );
}

// One pill per milestone reads the roadmap at a glance; long roadmaps would
// shear into slivers, so those fall back to a plain progress bar.
function MilestoneTrack({
  milestones,
  t,
}: {
  milestones: Milestone[];
  t: Theme;
}) {
  const done = milestones.filter((m) => m.status === "done").length;

  if (milestones.length > 14) {
    return <Meter ratio={done / milestones.length} t={t} />;
  }

  return (
    <div className="mt-3 flex gap-1">
      {milestones.map((m, i) => (
        <span
          key={m.id ?? i}
          className="h-1.5 flex-1 rounded-full transition-colors duration-500"
          style={{
            backgroundColor:
              m.status === "done"
                ? t.accent
                : m.status === "in_progress"
                  ? t.accentSoft
                  : t.track,
          }}
        />
      ))}
    </div>
  );
}
