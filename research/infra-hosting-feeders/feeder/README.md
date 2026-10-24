# Feeder data

`34/ieee34Mod1.dss` is the IEEE PES Distribution System Analysis Subcommittee's 34-node test feeder (Mod 1) and
`123/IEEE123Master.dss`, `IEEE123Loads.DSS`, `IEEE123Regulators.DSS` the 123-node test feeder, in the form distributed
with EPRI's OpenDSS (BSD-3-Clause), copied unchanged from the
[dss-extensions/electricdss-tst](https://github.com/dss-extensions/electricdss-tst) mirror of the OpenDSS sample cases
(`Version8/Distrib/IEEETestCases/`) on 2026-10-22. `IEEELineCodes.DSS` (in each directory, because both cases redirect to it by
bare name) is the mirror's shared line-code file, `IEEETestCases/IEEELineCodes.DSS`, unchanged; the per-case copies in the
mirror are one-line pointers to it. The coordinates files are not shipped. The 34-node case with its source at 1.00 pu is the
same file with one `Edit Vsource.source pu=1.0` applied by the code after compiling (`Feeder.source_pu`).

References: IEEE PES Distribution System Analysis Subcommittee, "Radial Distribution Test Feeders", IEEE Trans. Power
Systems 6(3):975-985, 1991; W. H. Kersting, "Radial distribution test feeders", IEEE PES Winter Meeting 2001.
