# Feeder data

`IEEE13Nodeckt.dss` is the IEEE PES Distribution System Analysis Subcommittee's 13-node test feeder
in the form distributed with EPRI's OpenDSS (BSD-3-Clause), copied from the
[dss-extensions/electricdss-tst](https://github.com/dss-extensions/electricdss-tst) mirror of the OpenDSS
sample cases (`Version8/Distrib/IEEETestCases/13Bus/`) on 2026-10-21. One edit: the trailing `BusCoords`
line is removed because the coordinates file is not shipped. `IEEELineCodes.DSS` is an empty stand-in; the
13-node case defines its own line codes inline and only redirects to the file.

Reference: IEEE PES Distribution System Analysis Subcommittee, "Radial Distribution Test Feeders",
IEEE Trans. Power Systems 6(3):975-985, 1991; W. H. Kersting, "Radial distribution test feeders", IEEE PES
Winter Meeting 2001.
