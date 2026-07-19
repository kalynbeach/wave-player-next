# `wave-player-next` Notes

> KKB's `wave-player-next` notes

## 2026-07-19

- The app UI currently only has dark mode styles from the initial shadcn preset; light mode styles from the preset need to be supported as well with the proper light/dark theme toggle UI component wired up.
- There doesn't seem to be a way (at least in the UI) to change the Library root directory once it's initially set; this functionality needs to be added along with the necessary UI to support it.
- There are unnecessary headlines/labels across the UI which only take up space and bloat the WavePlayer card UI. Some examples: "Wave Player · local visual instrument" in the card header and the "WEBGPU · LIVE SIGNAL" headline in the card `SceneVisualizer` view. These need to be removed and all unnecessary headlines & labels need to be avoided going forward.
- The `SceneVisualizer` oscilloscope visualization should be styled like the WebGPU-based oscilloscope in my `kkb` monorepo; both in terms of its phosphor green color and overall visualization style.
- There are a bunch of changes, tweaks, and cleanups that I want to make the WavePlayer UI design and implementation; we will focus on these UI specifics soon. Some examples: the WavePlayer card is way too large on desktop currently (my vision is for it to be smaller and more compact, like an actual TCG card), and the Scene controls UI don't feel great to me currently.
