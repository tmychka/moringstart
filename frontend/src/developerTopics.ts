/**
 * The subjects the Developer page is split into. The slug is both the last URL
 * segment (`/metric/1/react`) and the value stored on a note's `topic`, so this
 * list is the only place a subject is spelled out.
 */
export interface DevTopic {
  slug: string;
  label: string;
}

export const DEV_TOPICS: DevTopic[] = [
  { slug: "html-css", label: "HTML / CSS" },
  { slug: "javascript", label: "JAVASCRIPT" },
  { slug: "react", label: "REACT" },
  { slug: "typescript", label: "TYPESCRIPT" },
  { slug: "http-rest-websockets", label: "HTTP / REST / WebSockets" },
  { slug: "patterns", label: "Patterns Practises and Principles" },
  { slug: "backend-structure", label: "Backend structure" },
];

export const topicBySlug = (slug: string | undefined): DevTopic | undefined =>
  DEV_TOPICS.find((topic) => topic.slug === slug);
