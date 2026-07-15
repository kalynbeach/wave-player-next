CREATE TABLE library_roots (
  id TEXT PRIMARY KEY,
  canonical_path TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  scan_status TEXT NOT NULL DEFAULT 'idle' CHECK (
    scan_status IN ('idle', 'scanning', 'ready', 'partial', 'error')
  ),
  last_scan_started_at TEXT,
  last_scan_completed_at TEXT,
  last_scan_message TEXT,
  supported_file_count INTEGER NOT NULL DEFAULT 0 CHECK (supported_file_count >= 0),
  ignored_file_count INTEGER NOT NULL DEFAULT 0 CHECK (ignored_file_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX library_roots_one_enabled
  ON library_roots(enabled)
  WHERE enabled = 1;

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
  format TEXT NOT NULL CHECK (format IN ('wav', 'mp3')),
  mime_type TEXT NOT NULL CHECK (mime_type IN ('audio/wav', 'audio/mpeg')),
  file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes >= 0),
  modified_at_ms REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX assets_track_id ON assets(track_id);

CREATE TABLE asset_locations (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  root_id TEXT NOT NULL REFERENCES library_roots(id) ON DELETE RESTRICT,
  relative_path TEXT NOT NULL,
  canonical_path TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
  last_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (root_id, relative_path)
);

CREATE INDEX asset_locations_asset_id ON asset_locations(asset_id);
CREATE INDEX asset_locations_root_availability
  ON asset_locations(root_id, available);

CREATE TABLE scene_presets (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  scene_version INTEGER NOT NULL CHECK (scene_version > 0),
  name TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  palette_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (scene_id, name)
);
