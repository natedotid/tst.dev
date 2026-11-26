// CloudFront Function -- Viewer request
// ------------------------------------
// The Next.js static export (output: 'export', trailingSlash: true) emits one
// directory per route: /jwt/index.html, /json/index.html, ...
//
// S3/CloudFront do not automatically map an extensionless URL (/jwt) to that
// directory's index.html. This function rewrites any request whose URI has no
// file extension to point at the appropriate index.html, so clean routes work
// out of the box:
//
//   /          -> /index.html
//   /jwt       -> /jwt/index.html
//   /jwt/      -> /jwt/index.html
//
// Asset requests (anything with a file extension, e.g. /_next/static/*.js,
// /favicon.ico) pass through untouched.
//
// Setup:
//   1. CloudFront console -> Functions -> Create function
//   2. Paste this file, set the event type to "Viewer request"
//   3. Deploy, then attach it to the distribution's (all) cache behavior

// Pure ES5 on purpose: the CloudFront Functions runtime is a restricted
// JavaScript subset (no ES6+ string/array helpers, no arrow functions).
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // True when the last path segment contains a dot, i.e. looks like a file.
  var hasFileExtension = /\.[^/]+$/.test(uri);

  if (!hasFileExtension) {
    // Normalize to a directory and append the index document.
    var hasTrailingSlash = uri.charAt(uri.length - 1) === "/";
    request.uri = hasTrailingSlash ? uri + "index.html" : uri + "/index.html";
  }

  return request;
}
