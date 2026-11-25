# Example data

All three examples are made up for illustration and are labelled so on the
page. Made up, FSL-1.1-MIT licensed with the rest of this directory.

- `residency-example.txt`: 12 residents and 4 programmes (9 places). Seeded
  random lists in which each programme tends to favour the residents who
  rank it lower, the conflict that gives a market several stable matchings;
  chosen from the first seed whose instance has at least four stable
  matchings and no one-sided listings. It has 4 stable matchings and leaves
  Dara, Eli and Jun without a place in all of them.
- `cyclic-3x3.txt`: three and three with cyclic lists, the kind of instance
  Gale & Shapley (1962, doi:10.1080/00029890.1962.11989827) use to show a
  market can have more than one stable matching. It has three.
- The four-applicant default (`SAMPLE_TEXT` in `engine.mjs`) has five.

Why no real data: there is no real preference data here. Real match lists
(residency, school choice) are confidential, and the public preference
collections we looked at (PrefLib) did not answer the probe from this
session (HTTP 429) and carry per-dataset licences that were not checked.
Retrieved: n/a. A real, openly licensed two-sided dataset would be a good
next addition.
