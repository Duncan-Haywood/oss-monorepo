---
title: "How many connectors does a stair stringer need at the top?"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The framing takeoff's stringer check now turns its end reaction into a connector count per stringer, from a per-connector capacity you type.
---

The stringer check already computed the reaction at the top of each stringer. Add `connectorCapacity` (lb per hanger or bolt group, from the maker's table; none is shipped) and the report divides it out: connectors per stringer, and the buy count for the flight.

Hand sums, as in the tests: 50 psf over a 16 in stringer spacing and a 100 in run gives 5.56 lb per inch and a 278 lb end reaction. A 300 lb connector needs one per stringer; a 100 lb one needs three.

The limit: the connector's own table, its fasteners and the ledger or header it bolts to govern. This is arithmetic on typed numbers for a framer's first pass, checked by hand only, with no page field yet.
