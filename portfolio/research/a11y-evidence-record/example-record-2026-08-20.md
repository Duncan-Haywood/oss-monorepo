# Accessibility evidence record — Portfolio-owned HTML surfaces under ventures/ (12 files, static markup only)

**Tested on:** 2026-08-20  
**Method:** static markup analysis  
**Tool:** `portfolio/research/a11y-evidence-record/audit.py` v0.1.0  
**Files tested:** 12 (3306 elements)

> This record states what was tested, by what, on what date, and what was found. It does not state that the subject conforms to WCAG 2.2 AA, to the European Accessibility Act, or to any other requirement, and it must not be represented as doing so.

## What was found

| | count |
|---|---:|
| Blocking findings | 0 |
| Degrading findings | 2 |
| Undecidable without rendering | 0 |

| check | success criterion | severity | n |
|---|---|---|---:|
| `data-table-no-header` | 1.3.1 Info and Relationships | degrading | 1 |
| `heading-level-skipped` | 1.3.1 Info and Relationships | degrading | 1 |

## What remains open

### Undecidable without rendering or data (0)

These are template expressions whose rendered value decides the outcome. They are neither passes nor failures and are listed so they can be checked against real store data.

### Not tested by this method (17)

Static markup analysis cannot reach these. Anything the customer needs covered here requires a rendered page and, for the last two rows, a person.

| criterion | why not |
|---|---|
| 1.4.3 Contrast (Minimum) | needs rendered colours; stylesheets, theme settings and images all participate |
| 1.4.11 Non-text Contrast | same reason |
| 1.4.10 Reflow | needs a rendered viewport at 320 CSS px |
| 1.4.12 Text Spacing | needs rendering |
| 2.1.1 Keyboard | needs interaction; a static tree cannot show whether a custom control responds to Enter |
| 2.1.2 No Keyboard Trap | needs interaction |
| 2.4.7 Focus Visible | needs rendered focus styles |
| 2.4.11 Focus Not Obscured | needs rendering and scroll position |
| 2.5.8 Target Size (Minimum) | needs rendered box sizes |
| 1.3.2 Meaningful Sequence | needs the rendered reading order, which CSS can reorder |
| 1.3.5 Identify Input Purpose | autocomplete tokens are checkable, but correctness against the field's real purpose is a human judgement |
| 3.2.2 On Input | needs interaction |
| 3.3.1 Error Identification | needs a submitted form |
| 3.3.7 Redundant Entry | needs a multi-step flow |
| 4.1.3 Status Messages | needs runtime behaviour |
| Alt text quality | an alt attribute that is present and non-empty may still describe the wrong thing; only a human can say |
| Assistive-technology outcome | no static tool establishes whether a real screen reader user can complete checkout |

