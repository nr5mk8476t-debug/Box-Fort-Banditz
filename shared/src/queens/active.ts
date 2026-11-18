// QUEENS: which plan the generator (layout.ts) and the checker (check.ts) are reading. v2 by default; Compact Queens
// (compact.ts) is checked by switching to it with check.ts's usePlan(), so both plans obey exactly the same rules.
import { V2_PLAN, type QPlan } from "./plan.js";
export let P: QPlan = V2_PLAN;
export function setActive(p: QPlan) { P = p; }
