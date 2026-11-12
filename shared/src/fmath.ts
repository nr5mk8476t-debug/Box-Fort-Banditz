// R12.8: fast, allocation-free distance. Math.hypot is a general built-in: the optimizing compiler can't turn it into a
// couple of instructions, and every call made a new heap number (the simulation called it thousands of times a tick:
// a big share of the game's garbage). It's also allowed to differ between browsers in the last bit; a square root
// isn't (IEEE-754 rounds it exactly the same everywhere), so peers on different browsers stay in step.
export const hyp = (x: number, y: number): number => Math.sqrt(x * x + y * y);
export const hyp3 = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);
