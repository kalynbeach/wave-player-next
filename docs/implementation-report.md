# Task 1 implementation and verification report

> Status: Complete.
>
> Goal: `019f6719-0a74-73b1-b19a-4fe04920214c`.
>
> Verified: July 15, 2026.

## Result

Wave Player Next now provides the first useful vertical slice described by the
design packet: a Bun and TypeScript 7 localhost React application, the exact
shadcn Base UI preset, a SQLite-backed in-place WAV/MP3 library, contained
Range-capable media delivery, browser-native playback and restoration, the
persistent trading-card player, and an interactive WebGPU oscilloscope and
Lissajous scene with saved presets.

All Task 1 Definition of Done items pass. No deferred Phase 2 or later-phase
systems were added.

## Automated verification

The final gate ran from the repository root:

| Check | Result |
|---|---|
| `bun test --coverage` | 47 passed, 0 failed, 183 assertions, 94.27% line coverage |
| `bun run typecheck` | passed with TypeScript 7.0.2 |
| `bun run check` | passed; Biome checked 79 files without fixes |
| `bun run build` | passed; server, client, HTML, and CSS emitted under ignored `dist/` |
| `git diff --check` | passed |

The built application was also started from `dist/` on a temporary port. The
document, configured root endpoint, and two-track catalog each returned `200`.

The suite exercises real SQLite databases, filesystem fixtures, and localhost
HTTP boundaries. It covers migrations and checksums, idempotent reconciliation,
partial scans, root validation, containment, byte ranges, presets, controller
state, playback errors and restoration, renderer allocation, device loss,
hidden-view frame cancellation, disposal, accessible component structure, and
rejected UI actions without unhandled promises.

## Live fixture and API evidence

Live verification used two generated eight-second files in the disposable root
`/private/tmp/wave-player-next-live.3lYoOf/audio`:

- `Glass-Horizon.mp3`;
- `Midnight-Current.wav`.

No user audio was read, copied, moved, renamed, changed, or deleted.

A live rescan kept the catalog at two tracks. Track, asset, and location IDs
were identical before and after, and the scan reported zero imported, updated,
or unavailable files. A live request for the MP3 location with
`Range: bytes=0-31` returned:

- status `206`;
- `Accept-Ranges: bytes`;
- `Content-Range: bytes 0-31/32833`;
- `Content-Length: 32`;
- `Content-Type: audio/mpeg`;
- 32 response-body bytes.

The real HTTP integration suite separately proves missing-root `400` responses,
unknown and disabled locations, containment escape rejection, complete and
partial responses, and preset persistence.

## Browser and Computer Use verification

The primary route was `http://localhost:3215/` in the Codex in-app Browser.
Computer Use drove an already-installed Helium browser only for trusted native
audio gestures that browser automation cannot grant. Browser and Computer Use
captures were inspected in the Codex task; no project-managed screenshot or
browser runner was added.

### Playback and Web Audio

The native Helium pass proved:

- Play changed the control to Pause, status to `PLAYING`, and advanced time;
- pause stopped playback, seek moved a paused track to 5.9 seconds, previous
  reset the current track before moving backward, and next changed tracks;
- the eight-second MP3 ended and advanced to the WAV; the WAV then wrapped to
  the MP3;
- switching Library, Scene, and Visual views did not stop playback;
- the same-origin media element fed Web Audio and the live analyser;
- the oscilloscope rendered a non-flat signal while the badge read
  `analyser live`;
- Lissajous mode rendered a non-flat figure from the live analyser;
- while audio continued, gain changed from 1.15 to 2.30, line width from 1.80
  to 3.50, and persistence from 0.82 to 0.37.

The in-app Browser's intentionally untrusted automated Play action followed the
typed failure path: status became `error`, the control stayed Play, and the
named alert read `Playback requires a user gesture.` The runtime regression
proves `AudioContext.resume()` and `media.play()` are invoked in the same
gesture task, failed activation pauses and reconciles the element, and a later
gesture retries the retained graph.

### Restoration and presets

After reload, the in-app Browser restored:

- selected track `Midnight-Current`;
- volume `0.8`;
- active Scene view;
- paused/non-autoplay state with the Play control and `ready` status.

The saved preset `Live night trace` remained available after reload. Selecting
it restored Lissajous mode, gain `1.25`, line width `1.8`, persistence `0.82`,
X frequency `3`, and Y frequency `2`.

### Accessibility, focus, motion, and lifecycle

The card is exposed as the named region `Midnight-Current`. The view selector,
panels, Library region and rows, Scene controls, canvas alternative, transport,
and every seek, volume, and scene slider have useful accessible names.

Keyboard verification moved focus from Scene to Library with ArrowLeft,
activated Library with Space, preserved a visible solid focus outline, changed
volume from `0.8` to `0.79` with ArrowLeft, and restored it with ArrowRight.

The runtime stylesheet contains a `prefers-reduced-motion: reduce` branch that
removes scroll motion, reduces view/tooltip animations to 0.01 ms, and reduces
button transitions to 0.01 ms. The continuous signal remains audio-driven. A
focused renderer regression proves hiding Visual cancels its pending animation
frame immediately, reactivation schedules one frame, device loss permanently
gates rendering, and repeated disposal releases each owned GPU resource once.

The final in-app Browser warning/error console query returned an empty list.

### Responsive geometry

| Viewport | Observed result |
|---|---|
| `1440 × 1000` | card `672 × 896` at `(384, 52)`; centered hierarchy, persistent transport, no document overflow |
| `1024 × 768` | card about `526 × 736` at `(249, 16)`; short-height fit and internal Scene scrolling, no document overflow |
| `390 × 844` | card `374 × 828` at `(8, 8)`; no horizontal overflow in Visual, Library, or Scene |

At `390 × 844`, tabs, transport, scene modes, scene sliders and thumbs, rescan,
preset controls, text input, and Save measured at least `44 × 44` where both
dimensions apply. The Library grid was corrected so its header, rescan action,
scroll viewport, track rows, and status labels remain within the 374-pixel card.

## Scope and follow-up

The SQLite, HTTP, playback, scene, and UI boundaries remain replaceable as
documented. Convex, Rust, WASM, GPUI, Native SDK, Zig, Ableton `.als` parsing,
Work grouping, filesystem watching, managed copies, cloud systems, and other
deferred phases remain absent.

The only planned follow-up is the documented one-week personal-listening
evaluation before Phase 2. It is a user evaluation period, not an incomplete
Task 1 implementation item.
