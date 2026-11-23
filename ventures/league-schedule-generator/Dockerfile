FROM node:22-alpine
WORKDIR /app
COPY calc.mjs dates.mjs names.mjs schedule.mjs fields.mjs rounds.mjs share.mjs rng.mjs officials.mjs outputs.mjs standings.mjs pools.mjs pool-play.mjs brackets.mjs swiss-system.mjs americano.mjs ladder.mjs swiss.mjs blossom.mjs whist.mjs whist-bases.mjs near-whist-bases.mjs carryover.mjs carryover-core.mjs orient.mjs nights.mjs session-designs.mjs odd-designs.mjs availability.mjs subs.mjs mailer.mjs registration.mjs freeagents.mjs teams.mjs changes.mjs confirm.mjs reschedule.mjs announcements.mjs waivers.mjs spirit.mjs discipline.mjs pwa.mjs embed.mjs officiating.mjs importschedule.mjs server.mjs ./
COPY wasm/minplus-wasm.mjs ./wasm/
RUN mkdir /data && chown node /data
USER node
ENV PORT=8080 STATE=/data/state.json
VOLUME /data
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.mjs"]
