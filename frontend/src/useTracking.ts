/**
 * Every area's numbers, and every way of writing to them, in one place.
 *
 * This exists because two different screens now need the same reading: the body
 * map draws it, and the chat — which opens over any page — answers off it. Two
 * copies of the gathering would drift the first time either changed, and the
 * whole bargain of the chat is that its arithmetic is the panels' arithmetic.
 *
 * Nothing here fetches anything twice: every query is on the key its own area
 * already uses, so the cache is the sync. Whichever screen writes, every mounted
 * screen repaints.
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotes,
  getProfile,
  getRoadmap,
  getSteps,
  saveProfile,
  saveSteps,
  saveWeight,
  undoStatus,
} from "./api";
import { DEVELOPER, STEPS } from "./areas";
import { readWords } from "./englishWords";
import { dayStartStamp } from "./jarvis";
import { toKey } from "./stepsUtil";
import { useCompletionLog, useTodos } from "./todos";
import type { Signals } from "./briefing";
import type { PendingAction } from "./chat";
import {
  type ProfileMode,
  type ProfilePayload,
  type StepsPayload,
} from "./types";

export const PROFILE_KEY = ["profile"] as const;
export const STEPS_KEY = ["steps", STEPS.metricId] as const;

/**
 * Everything the briefing, the activity band and the chat read.
 *
 * `now` ticks every half minute, which is also how often a "held for 4 hours"
 * note can turn true, so this rebuilds on the same clock and every reading of it
 * stays in step with the others.
 */
export function useSignals(now: Date): Signals {
  const { data: profile } = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: getProfile,
  });
  const { data: steps } = useQuery({
    queryKey: STEPS_KEY,
    queryFn: () => getSteps(STEPS.metricId),
  });
  const { data: devNotes } = useQuery({
    queryKey: ["notes", DEVELOPER.metricId],
    queryFn: () => getNotes(DEVELOPER.metricId),
  });
  const { data: milestones } = useQuery({
    queryKey: ["roadmap", DEVELOPER.metricId],
    queryFn: () => getRoadmap(DEVELOPER.metricId),
  });

  const todos = useTodos();
  const completions = useCompletionLog();

  const goal = typeof steps?.goal === "number" ? steps.goal : 0;
  const mode: ProfileMode = profile?.mode ?? "maintain";
  const weightGoal = profile?.weightGoal ?? 0;

  return useMemo(
    () => ({
      now,
      todos,
      completions,
      steps: steps?.entries ?? {},
      stepGoal: goal,
      // Read off `profile` rather than off a derived const: those are fresh
      // objects every render, and listing one would rebuild everything on every
      // tick of anything.
      weights: profile?.weights ?? {},
      weightGoal,
      mode,
      statusLog: profile?.log ?? [],
      vocabulary: readWords(),
      devNotes: devNotes ?? [],
      milestones: milestones ?? [],
    }),
    [
      now,
      todos,
      completions,
      steps,
      goal,
      weightGoal,
      mode,
      profile,
      devNotes,
      milestones,
    ]
  );
}

export interface Commit {
  steps: (value: number) => void;
  weight: (value: number) => void;
  target: (value: number) => void;
  status: (value: string) => void;
  mode: (value: ProfileMode) => void;
  undo: () => void;
  /** A write the chat asked about and you agreed to. Resolves once saved. */
  fromChat: (action: PendingAction) => Promise<void>;
}

/**
 * The writes. Each paints the cache first and sends after, so a chart moves on
 * the keystroke rather than on the round trip; a failed write invalidates and
 * the truth comes back from the server.
 */
export function useCommit(now: Date): Commit {
  const queryClient = useQueryClient();
  const todayKey = toKey(now);

  // For the goal, when seeding a steps payload that isn't in the cache yet.
  // Deduped against the same query above — this costs no request.
  const { data: steps } = useQuery({
    queryKey: STEPS_KEY,
    queryFn: () => getSteps(STEPS.metricId),
  });
  const goal = typeof steps?.goal === "number" ? steps.goal : 0;

  const profileMut = useMutation({
    mutationFn: saveProfile,
    // The write returns the whole profile, so the response is the new state
    // rather than a reason to refetch.
    onSuccess: (next) => queryClient.setQueryData(PROFILE_KEY, next),
  });

  const undoMut = useMutation({
    mutationFn: undoStatus,
    onSuccess: (next) => queryClient.setQueryData(PROFILE_KEY, next),
  });

  const weightMut = useMutation({
    mutationFn: (vars: { date: string; weight: number }) =>
      saveWeight(vars.date, vars.weight),
    onError: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });

  const stepsMut = useMutation({
    mutationFn: (vars: { date: string; steps: number }) =>
      saveSteps(STEPS.metricId, vars.date, vars.steps),
    onError: () => queryClient.invalidateQueries({ queryKey: STEPS_KEY }),
  });

  const commitSteps = (value: number) => {
    const next = Math.max(0, Math.round(value) || 0);
    queryClient.setQueryData<StepsPayload>(STEPS_KEY, (prev) => {
      const base = prev ?? { goal, entries: {} };
      const entries = { ...base.entries };
      if (next > 0) entries[todayKey] = next;
      else delete entries[todayKey];
      return { ...base, entries };
    });
    stepsMut.mutate({ date: todayKey, steps: next });
  };

  const commitWeight = (value: number) => {
    const next = value > 0 ? Math.round(value * 10) / 10 : 0;
    if (next > 0 && (next < 30 || next > 400)) return;
    queryClient.setQueryData<ProfilePayload>(PROFILE_KEY, (prev) => {
      if (!prev) return prev;
      const entries = { ...prev.weights };
      if (next > 0) entries[todayKey] = next;
      else delete entries[todayKey];
      return { ...prev, weights: entries };
    });
    weightMut.mutate({ date: todayKey, weight: next });
  };

  const commitTarget = (value: number) => {
    const next = value > 0 ? Math.round(value * 10) / 10 : 0;
    if (next > 0 && (next < 30 || next > 400)) return;
    profileMut.mutate({ weightGoal: next });
  };

  // The day's own midnight travels with the status, so the server compares an
  // entry against the start of *this* day rather than against a status that
  // survived midnight.
  const commitStatus = (value: string) =>
    profileMut.mutate({ status: value, dayStart: dayStartStamp(now) });

  const commitMode = (value: ProfileMode) => profileMut.mutate({ mode: value });

  return {
    steps: commitSteps,
    weight: commitWeight,
    target: commitTarget,
    status: commitStatus,
    mode: commitMode,
    undo: () => undoMut.mutate(),
    // Routed through the very mutations the panels use, so a number typed into
    // the conversation lands in the same row, with the same optimistic paint, as
    // one typed into its field. Awaited for the two that report back, so "Записав."
    // is only said once the server has actually said so.
    fromChat: async (action: PendingAction) => {
      switch (action.kind) {
        case "steps":
          return void commitSteps(action.value as number);
        case "status":
          await profileMut.mutateAsync({
            status: action.value as string,
            dayStart: dayStartStamp(now),
          });
          return;
      }
    },
  };
}
