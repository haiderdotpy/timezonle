// Injected clock: call clock() everywhere instead of Date.now() directly
// so tests can control time and the game can re-check day rollover.
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();
