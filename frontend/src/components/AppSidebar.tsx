import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMetrics } from "../api";
import ManageMetrics from "./ManageMetrics";
import Sidebar, { type QuickLink } from "./Sidebar";
import { useTheme } from "../theme";
import type { Metric } from "../types";

// Mirrors MetricPage: "Learn English" is a generic metric routed by id.
const ENGLISH_METRIC_ID = "2";

// Shortcuts to the pages behind the first tracker of each kind; each one is only
// offered when the metric behind it exists.
const quickLinksFor = (metrics: Metric[]): QuickLink[] => {
  const steps = metrics.find((m) => m.type === "steps");
  const notebook = metrics.find((m) => m.type === "notebook");

  return [
    ...(steps
      ? [
          {
            icon: "activity" as const,
            label: "Steps",
            to: `/metric/${steps.id}`,
          },
        ]
      : []),
    ...(notebook
      ? [
          {
            icon: "notes" as const,
            label: "Notes",
            to: `/metric/${notebook.id}`,
          },
        ]
      : []),
    ...(metrics.some((m) => String(m.id) === ENGLISH_METRIC_ID)
      ? [
          {
            icon: "book" as const,
            label: "Vocabulary",
            to: `/metric/${ENGLISH_METRIC_ID}`,
          },
        ]
      : []),
  ];
};

/**
 * The sidebar with everything it needs already wired: the metric list, the
 * shortcuts, the theme switch and the manage-metrics dialog. Every page that
 * wants a sidebar renders this one, so they all get the same one.
 *
 * Must sit inside a positioned element — both the floating panel below `md` and
 * the dialog are absolutely positioned against it.
 */
export default function AppSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, theme, setTheme } = useTheme();
  const [showManage, setShowManage] = useState(false);

  // Same query key the pages use, so this shares their cache entry rather than
  // fetching the list a second time.
  const { data: metrics = [] } = useQuery({
    queryKey: ["metrics"],
    queryFn: getMetrics,
  });

  return (
    <>
      <Sidebar
        t={t}
        theme={theme}
        onTheme={setTheme}
        metrics={metrics}
        activePath={pathname}
        onOpenMetric={(id) => navigate(`/metric/${id}`)}
        onManageMetrics={() => setShowManage(true)}
        onNavigate={navigate}
        quickLinks={quickLinksFor(metrics)}
      />
      {showManage && <ManageMetrics onClose={() => setShowManage(false)} />}
    </>
  );
}
