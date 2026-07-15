import type { AssetLocationId } from "@/core/library/ids";

export type ApprovedMediaLocation = {
  id: AssetLocationId;
  canonicalRootPath: string;
  canonicalPath: string;
  available: boolean;
  rootEnabled: boolean;
  mimeType: "audio/mpeg" | "audio/wav";
};

export interface MediaLocationRepository {
  findLocation(id: AssetLocationId): ApprovedMediaLocation | null;
}
