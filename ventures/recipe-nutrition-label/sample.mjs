import { pantryLine } from "./label.mjs";

// A fictional oatmeal cookie batch built from the pantry values.
export const SAMPLE_NAME = "Oatmeal cookies (fictional example)";
export const SAMPLE_SERVING_G = 30;
export const SAMPLE_SERVING_TEXT = "1 cookie";
export const SAMPLE_YIELD_G = 560;
export const SAMPLE = [
  ["Rolled oats", 200], ["All-purpose flour", 150], ["Brown sugar", 150], ["Unsalted butter", 115],
  ["Whole egg", 100], ["Honey", 20], ["Table salt", 3],
].map(([n, g]) => pantryLine(n, g)).join("\n");
