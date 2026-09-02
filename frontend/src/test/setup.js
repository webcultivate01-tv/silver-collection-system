import { JSDOM } from "jsdom";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// Node 26 installs an experimental `localStorage` global of its own, which
// stays undefined unless the process was started with --localstorage-file.
// It is defined before the jsdom environment populates its globals, so the
// key is already taken and jsdom's real Storage never lands on it - and
// because vitest aliases `window` to the global object, `window.localStorage`
// is that same undefined value. Every localStorage call in the app then throws.
//
// Borrow a Storage off a throwaway jsdom window instead of hand-rolling a
// fake, so tests run against the same implementation the app meets in a
// browser. The URL matters: localStorage is unavailable on an opaque origin
// like the default "about:blank", and merely reading it there throws.
const storage = new JSDOM("", { url: "http://localhost:5173" }).window.localStorage;

Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
  writable: true,
});

// The app keeps three separate sessions in localStorage, so a token left over
// from one test would silently sign the next one in.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
