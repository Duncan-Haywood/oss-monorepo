---
title: "Start here: an open tennis ball machine with a moving catch net, and a ball-collecting robot"
seo_title: "Start here: Open Tennis Robots, a DIY ball machine and collector"
date: 2026-10-30
tags: [start-here, open-tennis-robots, robotics, hardware]
description: "For coaches, clubs and makers: what the open ball machine and ball-collecting rover designs give you, how to try them in ten minutes, and what is unbuilt."
---

# Start here: an open tennis ball machine with a moving catch net, and a ball-collecting robot

This guide is for four kinds of people. Tennis coaches who spend part of every lesson picking balls off the court. Clubs that would like a practice machine but not a closed one they cannot repair. Players who hit alone and want more balls per hour. And robotics hobbyists and makers who like a project with real physics in it: spin, drag, cameras, motors and a safety case.

Open Tennis Robots is a free, MIT-licensed design for two machines. One is a ball machine that tracks your return with two cameras and slides a 3 m catch net sideways to where the ball will arrive, so caught balls roll back into the hopper and get fed again. The other is a small rover that roams the court picking up balls during practice while staying out of zones around the player and the machine.

The most important fact first: **no robot has been built yet.** The physics, planners, tracker and firmware logic are tested in simulation. The collector is design v0.2 with a complete manufacturing package; the feeder is a v0.1 design. If you are looking for something to buy and use next week, this is not it. If you want to build the first one, or tell the project where its guesses are wrong, it was made for you.

## The problem, in your words

"Half my lesson is walking around with a basket." "Our club's ball machine broke and the part costs more than the machine is worth." "I practise alone, and after sixty balls I stop to collect them." "I want a robotics project that does something useful, not another line follower."

A normal ball machine feeds balls but does nothing about where they end up. Every ball you hit back is one more ball to collect. The idea here is to attack both ends: catch many returns before they hit the back fence, and send a small robot after the rest.

## What you get

- **A shot planner.** Give it a target on the court, a ball speed and a spin, and it works out the launcher's angles and the speed of each of its two wheels. The browser page and the `tennisbots` Python command both do this.
- **Drills that fail loudly.** A drill is a short JSON file of shots. The planner compiles it into machine settings and refuses any ball the machine cannot reach, instead of quietly throwing something else.
- **A catch-net study.** A simulator throws hundreds of club-level returns at a net of a given width moving at a given speed, with camera noise and delay, and counts how many it would catch.
- **A collector route planner** that plans a path around a practice session's keep-out zones.
- **Manufacturing files.** The collector's package (`manufacturing/collector-package.zip`) holds laser-cut DXFs in flat 5052 aluminium, printable PETG STLs, STEP files for every part and the assembly, a bill of materials with fasteners, a cut list and drawings. The feeder has a first package too. Both are generated from parametric CAD written in code (build123d), and the build checks for parts that collide, bolt holes that do not line up and other design-rule faults.
- **Firmware** for an ESP32 in MicroPython, with a watchdog, an e-stop and bumper logic, and a Python package meant to run on a Raspberry Pi.
- **A seller's guide.** The licence lets you build one and sell it under your own brand. `sell/README.md` lists what a seller takes on, from radio compliance to battery transport rules, and describes a listing tool that uses the seller's own Amazon account. It says plainly that none of this is legal advice.

## What the simulation says, and how to read it

The headline result is about the catch net. With 300 simulated returns per setting (struck at 50 to 100 km/h with up to 2,500 rpm topspin, cameras at 120 frames a second with 5 cm noise and 100 ms delay), a fixed 3 m net catches 31% of returns. The same net on a base moving at 2.5 m/s catches 91%. Even a 1.5 m net goes from 19% fixed to 80% on that moving base. The README's summary: moving matters more than size.

Read those numbers as a reason to build, not a promise. They are simulation results under stated assumptions. The spread of returns a club player hits is a guess, and the project's own roadmap says the first real build should measure it.

## Your first ten minutes

1. **Open the browser demo** at [its live page](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/open-tennis-robots/). Nothing to install.
2. **Plan a shot.** Under "Shot planner: aim the ball machine", set "Target, metres past the net", "Target, metres left (+) / right (−)", "Ball speed, km/h" and "Spin, rpm (− = backspin)", then press "Plan this shot". "Random drill ball" picks one for you.
3. **Read the catch-net section**, "Does a moving catch net work? What the simulation says", before you decide which machine interests you more.
4. **Try the collector.** Under "Ball collector: route planner", set "Balls on court" and "Rover speed, m/s", then press "Scatter balls and plan".
5. **If you use Python,** install the package and run the same planner in a terminal:

   ```bash
   pip install "git+https://github.com/duncan-haywood/oss-monorepo#subdirectory=ventures/open-tennis-robots"
   tennisbots aim --x 9 --y -2 --speed 22 --topspin 1200
   ```

   Coordinates are metres from the centre of the net, x toward the player, y to the machine's left. Run from a clone with `PYTHONPATH=src python3 -m tennisbots aim ...` inside `ventures/open-tennis-robots`, that command printed an elevation of 19.57 degrees, top and bottom wheel speeds of 4,367 and 2,223 rpm, 1.89 m of net clearance and a flight time of 1.3 s.
6. **Compile the example drill** with `tennisbots drill drill.example.json`, then edit the four shots in that file to match a drill you already run.
7. **Plan a pickup run** with `tennisbots collect --balls 60 --practice`. In our run it picked 37 of 60 balls and left 23 because they sat inside keep-out zones, which is the point of the zones: the rover does not drive into the player's space during practice.
8. **Open the safety notes**, `hardware/safety.md`, before you plan any build. Do this even if you only intend to look.

## Cost and data

The designs and software are free. Building is not. The bills of materials carry rough estimates of about $1,200 for the feeder and about $700 for the collector; treat them as a starting point, not a quote. The web page runs in your browser with no accounts, cookies or analytics vendor; anonymous feature counts stay in your browser's local storage and can be switched off on the page. The command-line tool sends nothing anywhere, except the listing command, which talks to Amazon with a seller's own credentials. Hosting is best effort with no uptime promise.

## What it does not do

- **It has not been built or field-tested.** Every result is from simulation.
- **The feeder is incomplete.** Not yet modelled: the netting and trough, a hopper agitator, the brackets for the shuttle and elevation actuators, and the azimuth drive.
- **Its numbers rest on guesses.** The return spread, wheel grip and ball stiffness are assumptions. A recent post, [a ball feeder's wheels need to push 241 N](2026-10-29-tennis-feeder-nip-needs-241-newtons.md), shows one such guess being caught.
- **It is not engineering or safety advice.** The feeder throws balls at more than 100 km/h and the rover drives near people. You are responsible for building and running anything safely and lawfully. There is no warranty.
- **It is not affiliated** with any ball machine maker, tennis brand or Amazon.

## How to get involved

What would help most depends on who you are.

- **Coaches and clubs:** a field report. How many balls do you feed in a lesson, how many end up behind the baseline, and where do your players' returns land? Even a rough count would beat the guessed return spread.
- **Makers:** build the collector from its package and report what did not fit, or bench-test a launcher head and compare real landing spots with the flight model. The roadmap starts with exactly this.
- **Anyone:** corrections to the design docs, and ideas.

Send an idea through the [feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml) and a fault through the [bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). An idea is weighed, and there is no promise it gets built. If you send a pull request from a fork, the maintainer reviews it by hand; the repository's AI agents never act on fork pull requests.

## Where to go next

- The design overview, simulation table and roadmap: `ventures/open-tennis-robots/README.md`
- The machines in detail: `ventures/open-tennis-robots/hardware/feeder-catcher.md` and `hardware/collector.md`
- Safety first: `ventures/open-tennis-robots/hardware/safety.md`
- CAD and fab files: `ventures/open-tennis-robots/cad/README.md` and `manufacturing/`
- Selling a build: `ventures/open-tennis-robots/sell/README.md`
- How the feeder's CAD caught problems early: [Drawing a tennis-ball feeder in code](2026-10-21-tennis-ball-feeder-cad-found-three-problems.md)
- Sending code or a design change: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
