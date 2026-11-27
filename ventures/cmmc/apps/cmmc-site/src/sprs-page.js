// The SPRS calculator on a static host (no Worker to score the form). The GET form reloads this
// page with the ticks in the query string; this applies the same functions the Worker uses
// (sprs.js, built from src/sprs.mjs by build.mjs) to the page in place. Nothing is sent anywhere.
// Without JavaScript the form still reloads the page, just without a result.
import { parseQuery, RESULT_MARKER, renderResult, score } from "./sprs.js";

const params = new URLSearchParams(window.location.search);
if (params.toString() !== "" && !document.getElementById("result")) {
  const input = parseQuery(params);
  for (const box of document.querySelectorAll('input[type="checkbox"]')) {
    if (box.name === "nm" && input.notMet.has(box.value)) box.checked = true;
    if (box.name === "pc" && input.partial.has(box.value)) box.checked = true;
  }
  const marker = RESULT_MARKER.slice(4, -3); // the comment's text, "sprs-result"
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.data !== marker) continue;
    // renderResult escapes every string, and its ids come from the requirement list, not the query.
    const template = document.createElement("template");
    template.innerHTML = renderResult(score(input));
    node.replaceWith(template.content);
    break;
  }
  const robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex";
  document.head.append(robots);
  document.getElementById("result")?.scrollIntoView();
}
