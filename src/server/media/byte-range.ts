export type ByteRange = {
  start: number;
  end: number;
};

export function parseByteRange(
  header: string,
  fileSizeBytes: number,
): ByteRange | null {
  if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());

  if (!match) {
    return null;
  }

  const startText = match[1] ?? "";
  const endText = match[2] ?? "";

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number.parseInt(endText, 10);

    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      start: Math.max(fileSizeBytes - suffixLength, 0),
      end: fileSizeBytes - 1,
    };
  }

  const start = Number.parseInt(startText, 10);

  if (!Number.isSafeInteger(start) || start >= fileSizeBytes) {
    return null;
  }

  if (!endText) {
    return { start, end: fileSizeBytes - 1 };
  }

  const requestedEnd = Number.parseInt(endText, 10);

  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSizeBytes - 1),
  };
}
