// The second half of the site: the directories router.mjs's SHARD_DIRS names,
// served from this Worker's assets. Only the site Worker calls it.
//
// Share cards are the exception: split.mjs packs them into a few hundred files
// to stay under the free plan's 20,000 files (../cardpack.mjs), and this
// Worker answers a card's URL from its pack.
import { serveCard } from '../cardpack.mjs';
import { SECURITY_HEADERS } from '../security-headers.mjs';

export default {
  async fetch(request, env) {
    return (await serveCard(request, env.ASSETS, SECURITY_HEADERS)) ?? env.ASSETS.fetch(request);
  },
};
