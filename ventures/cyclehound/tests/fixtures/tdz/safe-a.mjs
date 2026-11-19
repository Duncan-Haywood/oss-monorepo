// A cycle that only uses the other module inside functions: safe either way.
import { two } from './safe-b.mjs';
export function one() { return 1; }
export function three() { return one() + two(); }
