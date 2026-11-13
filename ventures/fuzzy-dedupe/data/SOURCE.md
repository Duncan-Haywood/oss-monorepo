# Example data

## febrl1.csv

Febrl data set 1: 1,000 synthetic person records (500 originals, one duplicate each) with typos,
missing values, swapped fields and name variants, made by the data generator of Febrl (Freely
Extensible Biomedical Record Linkage; Peter Christen, Australian National University). The
people are generated, not real. The `rec_id` column (`rec-12-org`, `rec-12-dup-0`) names the true
groups; the tool ignores it while matching.

- Retrieved 2026-11-13 from the recordlinkage 0.16 wheel on PyPI
  (`recordlinkage/datasets/febrl/dataset1.csv`), unchanged.
- recordlinkage is BSD-3-Clause, Copyright (c) 2016-2018, Jonathan de Bruin; its licence text
  follows. Febrl itself was released under the ANU Open Source Licence, which permits
  redistribution.
- Febrl data sets 2 and 3 (5,000 rows each) are in the same wheel and are read by
  `eval/febrl.mjs` from a directory given on its command line; they are not copied here.

```
Copyright (c) 2016-2018, Jonathan de Bruin
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of the copyright holder nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## The contact example (example-data.mjs, CONTACTS)

21 rows written for this page: invented names, example.com/.org/.net addresses and 555 numbers.
Not any business's customers.
