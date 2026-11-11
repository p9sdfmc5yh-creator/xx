// cuts.js — the cut structure shared by every film in the series (25 fps, 500 frames = 20.00 s).
// Shot lengths follow the reference film frame-for-frame: three ~1 s holds, a quick triple, eight ~0.55 s shots,
// then the cuts tighten to 0.2–0.3 s while the tagline lands in three beats; a 101-frame title card closes the loop.
export const FPS = 25;
export const FRAMES = [31, 26, 26, 11, 6, 6, 13, 15, 13, 14, 15, 13, 14, 15, 8, 10, 8, 11, 12, 8, 10, 8, 8, 11, 7, 6, 8, 8, 7, 8, 6, 7, 7, 7, 6, 5, 5];
export const TITLE_FRAMES = 101;
/** tagline beat of the i-th shot (0-based): shots 15–19 → 1, 20–24 → 2, 25–37 → 3 */
export const beatOf = (i) => (i < 14 ? 0 : i < 19 ? 1 : i < 24 ? 2 : 3);

// arc presets — every shot's dominant curve is a circle arc cresting at frame centre; small variations keep the match-cut alive
export const ARC = {
  A: { R: 2400, crestY: 560 },
  TIGHT: { R: 1900, crestY: 548 },
  WIDE: { R: 3100, crestY: 566 },
  OPEN: { R: 2600, crestY: 585 },   // the opening / closing "horizon"
};
// which preset each of the 37 positions uses by default (same rhythm as the first film)
export const DEFAULT_ARCS = ['OPEN', 'A', 'WIDE', 'TIGHT', 'A', 'TIGHT', 'A', 'TIGHT', 'A', 'A', 'TIGHT', 'A', 'WIDE', 'A',
  'A', 'A', 'A', 'A', 'TIGHT', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'TIGHT', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A', 'A'];

/**
 * scenes: 37 scene module names (file names without .js), in order. arcs: optional 37 entries (preset name or {R, crestY}).
 * Returns { SHOTS, TOTAL_FRAMES, shotAt } with the title card appended.
 */
export function buildTimeline(scenes, arcs = DEFAULT_ARCS) {
  if (scenes.length !== FRAMES.length) throw new Error(`need ${FRAMES.length} scenes, got ${scenes.length}`);
  const SHOTS = scenes.map((scene, i) => {
    const a = arcs[i] || 'A';
    const s = { id: 's' + String(i + 1).padStart(2, '0'), scene, frames: FRAMES[i], arc: typeof a === 'string' ? ARC[a] : a };
    const b = beatOf(i); if (b) s.beat = b;
    return s;
  });
  SHOTS.push({ id: 'title', scene: 'title', frames: TITLE_FRAMES, arc: SHOTS[0].arc });
  let f = 0;
  for (const s of SHOTS) { s.start = f; f += s.frames; s.end = f; }
  const shotAt = (frame) => SHOTS.find((s) => frame >= s.start && frame < s.end) || SHOTS[SHOTS.length - 1];
  return { SHOTS, TOTAL_FRAMES: f, shotAt };
}
