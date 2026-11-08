---
title: "Four venture tables read as bare cells to a screen reader"
date: 2026-11-08
tags: [accessibility, ventures, explore]
description: "A per-table sweep found four static tables with no header cells that the per-page check missed; the label cells are now row headers."
---

`check_table_headers.py` passes a page if it has any `<th>`. That hides a page with one headed table and one bare one. A per-table sweep of every venture page (3,848 tables) found four static tables with two or more `<td>` cells and no header cell: the agent-workroom command list, the owner-operator per-diem savings table, a retail-pilot-intel report table and the DoorDash vs Uber Eats fee table.

The first cell of each row is now `<th scope="row">`, with a one-line style so the labels look as before. The existing page-level check still passes. Limits: tables built by script were not inspected, and I did not run a screen reader; the change follows WCAG 1.3.1. Next step would be making the checker per-table.
