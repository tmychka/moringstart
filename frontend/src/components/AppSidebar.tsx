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
            label: "Developer",
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

interface AppSidebarProps {
  /** `minimal` drops everything but the brand row, Dashboard and the theme switch. */
  variant?: "full" | "minimal";
  /**
   * Extra entries for a minimal sidebar, so a page can offer its own sections.
   * Ignored in full mode, which builds its shortcuts from the metric list.
   */
  links?: QuickLink[];
}

/**
 * The sidebar with everything it needs already wired: the metric list, the
 * shortcuts, the theme switch and the manage-metrics dialog. Every page that
 * wants a sidebar renders this one, so they all get the same one.
 *
 * Must sit inside a positioned element — both the floating panel below `md` and
 * the dialog are absolutely positioned against it.
 */
export default function AppSidebar({
  variant = "full",
  links = [],
}: AppSidebarProps = {}) {
  const full = variant === "full";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { t, treatment, scheme, setTreatment, setScheme } = useTheme();
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
        treatment={treatment}
        scheme={scheme}
        onTreatment={setTreatment}
        onScheme={setScheme}
        metrics={metrics}
        activePath={pathname}
        onOpenMetric={(id) => navigate(`/metric/${id}`)}
        onManageMetrics={() => setShowManage(true)}
        onNavigate={navigate}
        quickLinks={full ? quickLinksFor(metrics) : links}
        variant={variant}
      />
      {/* Only the full sidebar has the + that opens this. */}
      {full && showManage && (
        <ManageMetrics onClose={() => setShowManage(false)} />
      )}
    </>
  );
}
