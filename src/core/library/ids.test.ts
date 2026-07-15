import { expect, test } from "bun:test";

import {
  parseAssetId,
  parseAssetLocationId,
  parseLibraryRootId,
  parseTrackId,
} from "@/core/library/ids";

const UUID = "018f1f2a-3b4c-7d5e-8f90-123456789abc";

test("accepts prefixed stable library identifiers", () => {
  expect(String(parseLibraryRootId(`root_${UUID}`))).toBe(`root_${UUID}`);
  expect(String(parseTrackId(`track_${UUID}`))).toBe(`track_${UUID}`);
  expect(String(parseAssetId(`asset_${UUID}`))).toBe(`asset_${UUID}`);
  expect(String(parseAssetLocationId(`location_${UUID}`))).toBe(
    `location_${UUID}`,
  );
});

test("rejects infrastructure and malformed identifiers", () => {
  expect(() => parseTrackId("42")).toThrow("Invalid track identifier.");
  expect(() => parseTrackId(`asset_${UUID}`)).toThrow(
    "Invalid track identifier.",
  );
});
