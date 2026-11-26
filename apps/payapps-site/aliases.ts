import { fileURLToPath, URL } from "node:url";

export const alias = {
  "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
  "@site": fileURLToPath(new URL("./src/site", import.meta.url)),
  "@worker": fileURLToPath(new URL("./src/worker", import.meta.url)),
  "@test": fileURLToPath(new URL("./test", import.meta.url)),
};
