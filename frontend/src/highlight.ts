/**
 * A deliberately small tokenizer for code blocks. A real grammar per language is
 * far more than a notebook needs; what makes code readable at a glance is the
 * four categories below, and those are lexically the same across the C-family
 * languages this app is used for.
 */
export type TokenKind = "plain" | "comment" | "string" | "keyword" | "number";

export interface Token {
  kind: TokenKind;
  text: string;
}

export const CODE_LANGS = [
  "javascript",
  "typescript",
  "jsx",
  "python",
  "sql",
  "html",
  "css",
  "json",
  "bash",
  "text",
] as const;
export type CodeLang = (typeof CODE_LANGS)[number];

const COMMON = [
  "return",
  "if",
  "else",
  "for",
  "while",
  "break",
  "continue",
  "new",
  "class",
  "true",
  "false",
  "null",
  "import",
  "from",
  "export",
  "default",
];

// Only the words worth spotting when re-reading your own notes, not every
// reserved word each language has.
const KEYWORDS: Record<string, string[]> = {
  javascript: [
    ...COMMON,
    "const",
    "let",
    "var",
    "function",
    "async",
    "await",
    "undefined",
    "this",
  ],
  typescript: [
    ...COMMON,
    "const",
    "let",
    "var",
    "function",
    "async",
    "await",
    "undefined",
    "this",
    "interface",
    "type",
    "enum",
    "implements",
    "extends",
    "readonly",
    "as",
    "satisfies",
  ],
  python: [
    "def",
    "return",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "import",
    "from",
    "class",
    "try",
    "except",
    "with",
    "as",
    "None",
    "True",
    "False",
    "lambda",
    "yield",
  ],
  sql: [
    "select",
    "from",
    "where",
    "insert",
    "into",
    "values",
    "update",
    "set",
    "delete",
    "join",
    "left",
    "inner",
    "on",
    "group",
    "order",
    "by",
    "limit",
    "create",
    "table",
  ],
  css: ["important", "media", "keyframes", "root", "hover", "before", "after"],
  html: [],
  json: ["true", "false", "null"],
  bash: [
    "cd",
    "echo",
    "export",
    "if",
    "then",
    "fi",
    "for",
    "do",
    "done",
    "sudo",
  ],
  text: [],
};
KEYWORDS.jsx = KEYWORDS.javascript;

const LINE_COMMENT: Record<string, string> = {
  python: "#",
  bash: "#",
  sql: "--",
};

const isWordChar = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

/**
 * Walks the source once and emits a flat token list. Everything unrecognised
 * stays `plain`, so an unsupported language degrades to uncoloured text rather
 * than to wrong colours.
 */
export function tokenize(source: string, lang: string): Token[] {
  const keywords = new Set(KEYWORDS[lang] ?? KEYWORDS.javascript);
  const lineComment = LINE_COMMENT[lang] ?? "//";
  const blockComments = lang !== "python" && lang !== "bash";
  const tokens: Token[] = [];
  let plain = "";

  const flush = () => {
    if (plain) {
      tokens.push({ kind: "plain", text: plain });
      plain = "";
    }
  };
  const push = (kind: TokenKind, text: string) => {
    flush();
    tokens.push({ kind, text });
  };

  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);

    if (rest.startsWith(lineComment)) {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      push("comment", source.slice(i, stop));
      i = stop;
      continue;
    }

    if (blockComments && rest.startsWith("/*")) {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      push("comment", source.slice(i, stop));
      i = stop;
      continue;
    }

    const ch = source[i];

    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      // A backslash escapes the next character, so a quote right after one does
      // not close the string.
      while (j < source.length && source[j] !== ch) {
        j += source[j] === "\\" ? 2 : 1;
      }
      push("string", source.slice(i, Math.min(j + 1, source.length)));
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(ch) && !isWordChar(source[i - 1] ?? " ")) {
      let j = i;
      while (j < source.length && /[0-9._xa-fA-F]/.test(source[j])) j += 1;
      push("number", source.slice(i, j));
      i = j;
      continue;
    }

    if (isWordChar(ch)) {
      let j = i;
      while (j < source.length && isWordChar(source[j])) j += 1;
      const word = source.slice(i, j);
      if (keywords.has(word) || keywords.has(word.toLowerCase())) {
        push("keyword", word);
      } else {
        plain += word;
      }
      i = j;
      continue;
    }

    plain += ch;
    i += 1;
  }

  flush();
  return tokens;
}
