/**
 * The sections Learn English is split into. The slug is the last URL segment
 * (`/metric/2/vocabulary`), so this list is the only place a section is spelled
 * out — the sidebar builds its entries from it and can't drift from the routes.
 */
import type { IconName } from "./components/Sidebar";

export interface EnglishSection {
  slug: string;
  label: string;
  icon: IconName;
}

export const ENGLISH_SECTIONS: EnglishSection[] = [
  { slug: "vocabulary", label: "Vocabulary", icon: "book" },
];

/** Where a bare `/metric/:id` lands, so a section is always the current page. */
export const DEFAULT_ENGLISH_SECTION = ENGLISH_SECTIONS[0];

export const englishSectionBySlug = (
  slug: string | undefined
): EnglishSection | undefined =>
  ENGLISH_SECTIONS.find((section) => section.slug === slug);
