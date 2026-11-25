// CloudFront Function (runtime cloudfront-js-2.0), viewer response, default
// behaviour of the site distribution.
//
// S3 cannot answer a redirect through the REST endpoint that Origin Access
// Control uses, so the deploy script uploads an empty stub object at "a/b"
// for every directory "a/b/" that has an index.html, carrying the metadata
// header below. This function turns that stub into the 307 to "/a/b/" that
// Cloudflare's auto-trailing-slash sent. Every other response passes through
// with the stub header removed.

var STUB_HEADER = 'x-amz-meta-dir-redirect';

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

function handler(event) {
  var response = event.response;
  var headers = response.headers;
  if (headers[STUB_HEADER] && response.statusCode === 200) {
    var uri = event.request.uri;
    response.statusCode = 307;
    response.statusDescription = 'Temporary Redirect';
    headers.location = { value: uri + '/' + queryString(event.request.querystring || {}) };
    headers['cache-control'] = { value: 'public, max-age=300' };
  }
  delete headers[STUB_HEADER];
  return response;
}
