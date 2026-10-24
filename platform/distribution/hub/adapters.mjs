// Live publishers for the hub's `api` platforms. Each adapter has the same
// shape:
//
//   ready(env)                     -> null when enabled and configured, else the reason it dry-runs
//   seen(ctx)                      -> text of the account's own recent posts (stateless de-duplication)
//   publish(ctx, variant)          -> { id } of the created post
//
// `ctx` is { env, fetchImpl }. Request shapes follow each platform's public
// documentation as read on 2026-10-20; none was exercised against a live
// account from the build session (no credentials, and the sandbox cannot
// reach these hosts), so the first enabled run is the first live check. Every
// adapter throws on a non-2xx answer and never retries in a loop.

export const GRAPH = 'https://graph.facebook.com/v21.0';
export const THREADS = 'https://graph.threads.net/v1.0';
export const BUTTONDOWN = 'https://api.buttondown.com/v1';

async function call(fetchImpl, url, { method = 'GET', headers = {}, form, json } = {}) {
  const init = { method, headers: { ...headers } };
  if (form) {
    init.body = new URLSearchParams(form);
    init.headers['content-type'] = 'application/x-www-form-urlencoded';
  } else if (json) {
    init.body = JSON.stringify(json);
    init.headers['content-type'] = 'application/json';
  }
  const res = await fetchImpl(url, init);
  if (!res.ok) throw new Error(`${method} ${String(url).split('?')[0]}: HTTP ${res.status}`);
  return res.json();
}

const missing = (env, flag, names) => {
  if (env[flag] !== 'true') return `${flag} is not "true"`;
  const gone = names.filter((n) => !env[n]);
  return gone.length ? `missing ${gone.join(', ')}` : null;
};

export const ADAPTERS = {
  threads: {
    ready: (env) => missing(env, 'DISTRIBUTE_THREADS', ['THREADS_TOKEN', 'THREADS_USER_ID']),
    async seen({ env, fetchImpl }) {
      const u = new URL(`${THREADS}/me/threads`);
      u.search = new URLSearchParams({ fields: 'id,text,permalink,timestamp', limit: '100', access_token: env.THREADS_TOKEN });
      const r = await call(fetchImpl, u);
      return (r.data || []).map((p) => p.text || '').join('\n');
    },
    async publish({ env, fetchImpl }, v) {
      const base = `${THREADS}/${env.THREADS_USER_ID}`;
      const c = await call(fetchImpl, `${base}/threads`, { method: 'POST', form: { media_type: 'TEXT', text: v.text, access_token: env.THREADS_TOKEN } });
      return call(fetchImpl, `${base}/threads_publish`, { method: 'POST', form: { creation_id: c.id, access_token: env.THREADS_TOKEN } });
    },
  },
  facebook: {
    ready: (env) => missing(env, 'DISTRIBUTE_FACEBOOK', ['FACEBOOK_PAGE_TOKEN', 'FACEBOOK_PAGE_ID']),
    async seen({ env, fetchImpl }) {
      const u = new URL(`${GRAPH}/${env.FACEBOOK_PAGE_ID}/posts`);
      u.search = new URLSearchParams({ fields: 'id,message', limit: '100', access_token: env.FACEBOOK_PAGE_TOKEN });
      const r = await call(fetchImpl, u);
      return (r.data || []).map((p) => p.message || '').join('\n');
    },
    async publish({ env, fetchImpl }, v) {
      return call(fetchImpl, `${GRAPH}/${env.FACEBOOK_PAGE_ID}/feed`, {
        method: 'POST', form: { message: v.text, link: v.link, access_token: env.FACEBOOK_PAGE_TOKEN },
      });
    },
  },
  instagram: {
    ready: (env) => missing(env, 'DISTRIBUTE_INSTAGRAM', ['INSTAGRAM_TOKEN', 'INSTAGRAM_USER_ID', 'INSTAGRAM_IMAGE_BASE']),
    async seen({ env, fetchImpl }) {
      const u = new URL(`${GRAPH}/${env.INSTAGRAM_USER_ID}/media`);
      u.search = new URLSearchParams({ fields: 'id,caption', limit: '100', access_token: env.INSTAGRAM_TOKEN });
      const r = await call(fetchImpl, u);
      return (r.data || []).map((p) => p.caption || '').join('\n');
    },
    /** Instagram needs a public JPEG per post: `<INSTAGRAM_IMAGE_BASE><slug>.jpg`. Items without one are skipped, not posted bare. */
    imageUrl: (env, v) => `${env.INSTAGRAM_IMAGE_BASE.replace(/\/?$/, '/')}${v.item.split(':')[1]}.jpg`,
    async publish({ env, fetchImpl }, v) {
      const image = ADAPTERS.instagram.imageUrl(env, v);
      const head = await fetchImpl(image, { method: 'HEAD' });
      if (!head.ok || !/jpe?g/i.test(head.headers.get('content-type') || '')) return { skipped: `no JPEG at ${image}` };
      const base = `${GRAPH}/${env.INSTAGRAM_USER_ID}`;
      const c = await call(fetchImpl, `${base}/media`, { method: 'POST', form: { image_url: image, caption: v.text, access_token: env.INSTAGRAM_TOKEN } });
      return call(fetchImpl, `${base}/media_publish`, { method: 'POST', form: { creation_id: c.id, access_token: env.INSTAGRAM_TOKEN } });
    },
  },
  email: {
    ready: (env) => missing(env, 'DISTRIBUTE_EMAIL', ['BUTTONDOWN_API_KEY']),
    async seen({ env, fetchImpl }) {
      const r = await call(fetchImpl, `${BUTTONDOWN}/emails`, { headers: { authorization: `Token ${env.BUTTONDOWN_API_KEY}` } });
      return (r.results || []).map((e) => e.body || '').join('\n');
    },
    /** Draft unless EMAIL_SEND=true, so the owner reads the first issues before anyone receives one. */
    async publish({ env, fetchImpl }, v) {
      return call(fetchImpl, `${BUTTONDOWN}/emails`, {
        method: 'POST', headers: { authorization: `Token ${env.BUTTONDOWN_API_KEY}` },
        json: { subject: v.title, body: v.text, status: env.EMAIL_SEND === 'true' ? 'about_to_send' : 'draft' },
      });
    },
  },
};
