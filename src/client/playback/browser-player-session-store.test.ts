import { afterEach, expect, test } from "bun:test";

import { BrowserPlayerSessionStore } from "@/client/playback/browser-player-session-store";
import { parseTrackId } from "@/core/library/ids";

const KEY = "wave-player/test-session";
const TRACK_ID = parseTrackId("track_018f1f2a-3b4c-7d5e-8f90-123456789abc");

afterEach(() => localStorage.removeItem(KEY));

test("uses safe defaults when browser-local state is missing or malformed", () => {
  const store = new BrowserPlayerSessionStore(localStorage, KEY);

  expect(store.load()).toEqual({
    selectedTrackId: null,
    volume: 0.8,
    activeView: "visual",
  });
  localStorage.setItem(KEY, "not-json");
  expect(store.load()).toEqual({
    selectedTrackId: null,
    volume: 0.8,
    activeView: "visual",
  });
});

test("round-trips selected track, bounded volume, and active card view", () => {
  const store = new BrowserPlayerSessionStore(localStorage, KEY);
  store.save({
    selectedTrackId: TRACK_ID,
    volume: 0.55,
    activeView: "library",
  });

  expect(store.load()).toEqual({
    selectedTrackId: TRACK_ID,
    volume: 0.55,
    activeView: "library",
  });

  localStorage.setItem(
    KEY,
    JSON.stringify({ selectedTrackId: "invalid", volume: 4, activeView: "x" }),
  );
  expect(store.load()).toEqual({
    selectedTrackId: null,
    volume: 1,
    activeView: "visual",
  });
});
