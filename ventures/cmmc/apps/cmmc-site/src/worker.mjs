// Worker entry point. Only the default export lives here: workerd treats every named export of the
// main module as an entrypoint, so the logic and its constants are in early-access.mjs.
import { handler } from "./early-access.mjs";

export default handler;
