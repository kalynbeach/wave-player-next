<!-- SEED: re-run $impeccable document once there's code to capture the actual tokens and components. -->
---
name: Wave Player Next
description: A precise local audiovisual instrument for personal music.
---

# Design System: Wave Player Next

## Overview

**Creative North Star: "The Studio Signal Card"**

Picture a late listening session after exporting a mix: the surrounding room and application stay quiet, the transport is immediately legible, and a cool oscilloscope trace becomes the single luminous focal point. The interface borrows the durable hierarchy of a trading card while behaving like a precise studio instrument rather than a collectible object.

The visual system is restrained and mono-forward. One outer frame contains persistent identity, a dominant working viewport, and transport; library and scene controls replace the viewport content without changing the artifact around them. Familiar controls, sparse separators, and explicit states keep the tool trustworthy while the live signal supplies movement and character.

It rejects generic streaming-product chrome, permanent dashboard navigation, stacked card borders, fantasy ornament, and motion that competes with listening.

**Key Characteristics:**

- one portrait frame with an approximate 5 / 7 proportion when space allows;
- a dominant signal viewport and quiet surrounding application canvas;
- persistent track identity and transport across all internal views;
- compact, mono-forward typography with clear numeric alignment;
- responsive state feedback and restrained, interruptible transitions.

## Colors

Use a restrained strategy: neutral shadcn component tokens carry the application, while a weathered cool-blue signal family appears only where selection, meters, transport, or the visualization require it. The exact OKLCH values are resolved after applying preset `b1D0enCq`; the palette seed is `oklch(0.550 0.091 210)` and must remain subordinate to preset semantics.

### Primary

- **Instrument Blue** (`[to be resolved during implementation]`): selected controls, active transport state, and primary signal trace.

### Secondary

- **Channel Counterpoint** (`[to be resolved during implementation]`): the second stereo signal channel and sparing scene contrast.

### Neutral

- **Application Canvas** (`[from preset]`): the restrained page background around the player artifact.
- **Player Frame** (`[from preset plus Wave semantic token]`): the single bounded application shell.
- **Visualizer Field** (`[Wave semantic token]`): the lowest-luminance surface, reserved for the live signal.

**The Signal Rarity Rule.** Signal color is functional and scarce. It marks live audio, selection, meter activity, or direct manipulation; it is never ambient decoration.

**The Preset Authority Rule.** Ordinary component states use the preset's semantic tokens. Wave-specific tokens name only the player frame, internal section, visualizer field, two signal channels, meter activity, and active transport.

## Typography

**Display Font:** Geist Mono with the configured monospace fallback.
**Body Font:** Geist Mono with the configured monospace fallback.
**Label/Mono Font:** Geist Mono with the configured monospace fallback.

**Character:** One technical family keeps file names, time values, track identity, labels, and controls visually coherent. Hierarchy comes from weight, size, spacing, and placement rather than font pairing.

### Hierarchy

- **Headline** (`[to be resolved during implementation]`): current track title, allowed to wrap or truncate within a deliberate bound.
- **Title** (`[to be resolved during implementation]`): internal view and scene identity.
- **Body** (`[to be resolved during implementation]`): explanations, empty states, and error recovery copy, capped near 70 characters per line.
- **Label** (`[to be resolved during implementation]`): navigation, controls, metadata, and time values; sentence case unless the source file name requires otherwise.

**The One-Family Rule.** Do not introduce a decorative display face into product controls or metadata. The signal surface, not typographic novelty, carries expression.

## Elevation

The system is flat by default. One outer player frame establishes the primary boundary; internal zones use spacing, tonal contrast, and separators instead of nested shadows or borders. Overlays may use the preset's generated elevation behavior, but ordinary content remains on one plane.

**The Single Frame Rule.** The player may own one border or one tight structural shadow, never stacked borders plus a wide decorative shadow. Header, viewport, and footer do not become nested cards.

## Components

The exact component tokens and variants are resolved after shadcn initialization. Base UI-backed shadcn source owns familiar interaction patterns; the WebGPU canvas remains a specialized surface.

### Buttons

- **Shape:** square-cornered preset geometry with practical hit targets.
- **Primary:** reserved for first-run root confirmation and other single dominant actions.
- **Hover / Focus:** semantic preset states with a visible focus ring; press feedback scales subtly for pointer activation only.
- **Transport:** compact icon buttons with explicit accessible names and immediate feedback.

### Cards / Containers

- **Corner Style:** no-radius preset character.
- **Background:** semantic player-frame and player-section roles.
- **Shadow Strategy:** flat by default; one outer boundary.
- **Border:** the player frame owns the structural edge.
- **Internal Padding:** compresses responsively without shrinking type or targets.

### Inputs / Fields

- **Style:** Base UI-backed shadcn fields with explicit labels and descriptions.
- **Focus:** visible semantic ring without layout shift.
- **Error / Disabled:** textual explanation and programmatic state, never color alone.

### Navigation

The Visual, Library, and Scene selector uses one labeled Tabs or single-select Toggle Group. Selection is exposed programmatically, keyboard behavior follows Base UI, and changing views never issues playback commands.

### Player Card

The signature component contains one persistent track header, one changeable central viewport, and one persistent transport footer. At narrow sizes it approaches the viewport edge with a safe gutter and gives scroll ownership only to the active Library or Scene content.

## Do's and Don'ts

### Do:

- **Do** preserve one outer player frame and semantic internal regions.
- **Do** keep the visualization dominant while transport and track identity remain stable.
- **Do** use preset `b1D0enCq`, Base UI APIs, Phosphor icons, and Geist Mono.
- **Do** use approximately 150-220 ms interruptible view transitions, with exit faster than enter and a reduced-motion alternative.
- **Do** make loading, empty, unsupported, unavailable, and renderer-error states explicit inside the viewport.
- **Do** test the complete card at 1440 x 1000, 1024 x 768, and 390 x 844.

### Don't:

- **Don't** build a generic streaming-service clone organized around discovery feeds, subscriptions, or remote catalogs.
- **Don't** build a conventional dashboard with a permanent sidebar, inspector, or grid of unrelated cards around the player.
- **Don't** use literal collectible-card styling, including fantasy ornament, foil effects, rarity badges, game mechanics, or imitation of Pokémon, Yu-Gi-Oh!, or Magic: The Gathering.
- **Don't** add decorative motion that delays frequent transport or keyboard actions.
- **Don't** treat the visualizer as a passive screensaver or decorative placeholder.
- **Don't** expose a dense audio-engine laboratory or transport internals to ordinary listening workflows.
- **Don't** stack borders or nested cards around the header, viewport, and transport.
