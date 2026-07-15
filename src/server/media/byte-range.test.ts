import { expect, test } from "bun:test";

import { parseByteRange } from "@/server/media/byte-range";

test("parses bounded, open-ended, and suffix byte ranges", () => {
  expect(parseByteRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
  expect(parseByteRange("bytes=7-", 10)).toEqual({ start: 7, end: 9 });
  expect(parseByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
  expect(parseByteRange("bytes=8-99", 10)).toEqual({ start: 8, end: 9 });
  expect(parseByteRange("bytes=-99", 10)).toEqual({ start: 0, end: 9 });
});

test("rejects malformed and unsatisfiable byte ranges", () => {
  expect(parseByteRange("bytes=", 10)).toBeNull();
  expect(parseByteRange("bytes=4-2", 10)).toBeNull();
  expect(parseByteRange("bytes=10-", 10)).toBeNull();
  expect(parseByteRange("bytes=0-1,4-5", 10)).toBeNull();
  expect(parseByteRange("items=0-1", 10)).toBeNull();
  expect(parseByteRange("bytes=0-1", 0)).toBeNull();
});
