/**
 * Confetti for finishing something. The library is imported dynamically so it
 * stays out of the main bundle until the first card actually lands in a done
 * column — it's ~7KB that most sessions never need.
 */
export async function celebrate() {
  if (typeof window === "undefined") return;

  // Anyone who has asked the OS for less motion shouldn't get a screenful of it.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const { default: confetti } = await import("canvas-confetti");

  // Two offset bursts read as a celebration; one centred burst reads as an
  // error state for some reason.
  const shared = {
    particleCount: 150,
    spread: 110,
    startVelocity: 58,
    ticks: 320,
    gravity: 0.85,
    scalar: 1.15,
    disableForReducedMotion: true,
  } as const;

  confetti({ ...shared, origin: { x: 0.3, y: 0.8 }, angle: 65 });
  confetti({ ...shared, origin: { x: 0.7, y: 0.8 }, angle: 115 });
  // A smaller third burst up the middle, a beat later, so it doesn't read as two
  // separate puffs.
  setTimeout(
    () =>
      confetti({
        ...shared,
        particleCount: 90,
        startVelocity: 70,
        origin: { x: 0.5, y: 0.85 },
        angle: 90,
      }),
    140,
  );
}
