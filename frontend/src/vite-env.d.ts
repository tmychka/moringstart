/// <reference types="vite/client" />

// This file is a module (it augments "react" below), so the ambient interfaces have
// to be reopened inside `declare global` to stay visible project-wide.
declare global {
  interface ImportMetaEnv {
    /** Backend origin in production; empty in dev so requests use the Vite proxy. */
    readonly VITE_API_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

declare module "react" {
  interface HTMLAttributes<T> {
    /**
     * React 18's DOM typings predate `inert`, but React forwards unknown attributes
     * to the DOM, so passing `""` still makes the subtree inert.
     */
    inert?: "";
  }
}

export {};
