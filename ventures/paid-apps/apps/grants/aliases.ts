import { fileURLToPath, URL } from "node:url";

export const alias = {
  "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
  "@worker": fileURLToPath(new URL("./src/worker", import.meta.url)),
  "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
  "@test": fileURLToPath(new URL("./test", import.meta.url)),
};
