// The second half of the site: the directories router.mjs's SHARD_DIRS names,
// served from this Worker's assets. Only the site Worker calls it.
export default {
  fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
