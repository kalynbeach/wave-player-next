const ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

declare const libraryRootIdBrand: unique symbol;
declare const trackIdBrand: unique symbol;
declare const assetIdBrand: unique symbol;
declare const assetLocationIdBrand: unique symbol;
declare const scenePresetIdBrand: unique symbol;

export type LibraryRootId = string & { readonly [libraryRootIdBrand]: true };
export type TrackId = string & { readonly [trackIdBrand]: true };
export type AssetId = string & { readonly [assetIdBrand]: true };
export type AssetLocationId = string & {
  readonly [assetLocationIdBrand]: true;
};
export type ScenePresetId = string & { readonly [scenePresetIdBrand]: true };

function parseId<T extends string>(value: string, prefix: string): T {
  const identifier = value.slice(prefix.length + 1);

  if (!value.startsWith(`${prefix}_`) || !ID_PATTERN.test(identifier)) {
    throw new Error(`Invalid ${prefix} identifier.`);
  }

  return value as T;
}

export function parseLibraryRootId(value: string): LibraryRootId {
  return parseId<LibraryRootId>(value, "root");
}

export function parseTrackId(value: string): TrackId {
  return parseId<TrackId>(value, "track");
}

export function parseAssetId(value: string): AssetId {
  return parseId<AssetId>(value, "asset");
}

export function parseAssetLocationId(value: string): AssetLocationId {
  return parseId<AssetLocationId>(value, "location");
}

export function parseScenePresetId(value: string): ScenePresetId {
  return parseId<ScenePresetId>(value, "preset");
}
