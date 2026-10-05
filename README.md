# `wave-player-next`

A local-first audiovisual music player for personal WAV and MP3 libraries.

## Project direction

`wave-player-next` is an older experiment and a historical reference for future audio/music development. Kalyn confirmed on October 4, 2026 that [`kkb-audio`](https://github.com/kalynbeach/kkb-audio) is the current focus and the planned home of the actual WavePlayer product.

Use this repository's code and design records as prior work. Its roadmap describes this experiment; prioritize current audio/music and WavePlayer work using [kkb-audio's project context](https://github.com/kalynbeach/kkb-audio#project-direction).

## Development

```bash
bun install
bun run dev
```

The Bun host binds to `http://localhost:3000` by default. This experiment's scope and implementation records live in [`docs/`](docs/README.md).

## Checks

```bash
bun test
bun run test:coverage
bun run typecheck
bun run check
bun run build
```
