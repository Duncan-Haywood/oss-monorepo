// CloudFront Function (runtime cloudfront-js-2.0), viewer request, default
// behaviour of the site distribution. It reproduces what the two Cloudflare
// Workers did for the site (platform/pages/cloudflare/router.mjs and
// wrangler.toml's html_handling = "auto-trailing-slash"):
//
//   - a host in HOST_REDIRECTS (www., grants.) answers 301 to the apex,
//     with the configured path prefix (grants.marisstella.app/x ->
//     marisstella.app/grants/x, as the grant-autopilot Worker does today);
//   - "/a/index.html" answers 307 to "/a/", and "/a/b.html" answers 307 to
//     "/a/b", as Cloudflare's auto-trailing-slash does (307 kept for parity);
//   - "/a/" is fetched from S3 key "a/index.html";
//   - "/a/b" is fetched from S3 key "a/b": the deploy script
//     (platform/aws/site/deploy/) uploads "a/b.html" under that key, and for
//     a directory "a/b/" it uploads a stub at "a/b" that viewer-response.js
//     turns into a 307 to "/a/b/".
//
// No shard: S3 has no file limit, so the two-Worker split is gone.
// Paths under an app origin (/grants/*) never reach this function; their
// cache behaviour has no function attached.
//
// The one placeholder below is filled by OpenTofu's templatefile(); this
// file avoids JS template literals so templatefile() leaves the rest alone.
// router.test.mjs fills it the same way before running the handler.

var CONFIG = ${config_json};

function queryString(qs) {
  var parts = [];
  for (var name in qs) {
    var p = qs[name];
    if (p.multiValue && p.multiValue.length) {
      for (var i = 0; i < p.multiValue.length; i++) {
        parts.push(name + (p.multiValue[i].value === '' ? '' : '=' + p.multiValue[i].value));
      }
    } else {
      parts.push(name + (p.value === '' ? '' : '=' + p.value));
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function redirect(status, location) {
  return {
    statusCode: status,
    statusDescription: status === 301 ? 'Moved Permanently' : 'Temporary Redirect',
    headers: {
      location: { value: location },
      'cache-control': { value: 'public, max-age=300' },
    },
  };
}

function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';
  var uri = request.uri;
  var qs = queryString(request.querystring || {});

  if (Object.prototype.hasOwnProperty.call(CONFIG.hostRedirects, host)) {
    return redirect(301, 'https://' + CONFIG.apex + CONFIG.hostRedirects[host] + uri + qs);
  }

  if (uri.length > 1 && uri.slice(-11) === '/index.html') {
    return redirect(307, uri.slice(0, -10) + qs);
  }
  if (uri.length > 5 && uri.slice(-5) === '.html' && uri.slice(-6) !== '/.html') {
    return redirect(307, uri.slice(0, -5) + qs);
  }
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  }
  return request;
}
