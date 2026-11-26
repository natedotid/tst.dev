# tst.dev

Developer utilities at [tst.dev](https://tst.dev) that run in your browser: JWT, JSON, diff, regex, hashing, epoch, cron, URL, and CSV tools, plus DNS, email-auth, generator, and reference sections. The home page is a Smart Scratchpad that detects what you paste and previews it, with a link to the full tool.

tst.dev is a static site: a Next.js static export (App Router, `output: "export"`) that any static host can serve.

## Tools

Home tools:

| Tool | Route | What it does |
| --- | --- | --- |
| Smart Scratchpad | `/` | Detects pasted JWT, epoch, JSON, cron, URL, email headers, Base64, NDJSON, domains, hex, and Base32 |
| JWT Inspector | `/jwt/` | Decodes header and payload, shows claims, and checks expiry |
| JSON Formatter | `/json/` | Format, minify, and validate JSON; convert to YAML or NDJSON; errors marked by line |
| Text Diff | `/diff/` | Side-by-side line diff with word-level highlighting; optional compare-as-JSON mode |
| Regex Tester | `/regex/` | Live match highlighting with capture groups and a match cap |
| Hash, HMAC & Codecs | `/hash/` | SHA-1/256/384/512 digests, keyed HMAC (hex and Base64), and Base64, Base32, and hex codecs |
| Epoch Converter | `/epoch/` | Unix timestamps and human-readable time |
| Cron Explainer | `/cron/` | Plain-English schedule and the next 5 runs (5-field, 6-field seconds-first, and 6-field year-last) |
| URL Inspector | `/url/` | Parse a URL into parts and query parameters; percent-encode and decode |
| CSV to JSON | `/csv/` | Convert between CSV and JSON with header mapping and RFC 4180 quoting |

Section tools:

| Tool | Route | What it does |
| --- | --- | --- |
| Domain Inspector | `/dns/` | DNS records over DNS-over-HTTPS, SPF/DMARC/DKIM explanation, DKIM selector check, resolver comparison, and certificate history. The one tool that uses the network; see [Privacy and security](#privacy-and-security) |
| Email Header Analyzer | `/email/headers/` | Paste raw email headers: SPF/DKIM/DMARC verdicts, the delivery path with per-hop delays, plain-English flags |
| DKIM Key Generator | `/email/dkim/` | RSA DKIM keypair: the public TXT record for DNS and the private key for your mail server |
| UUID & ULID | `/generate/uuid/` | Bulk-generate UUID v4 and ULID identifiers |
| Password & Token | `/generate/password/` | Random passwords, EFF wordlist passphrases, API tokens, and an entropy meter |
| HTTP Status Codes | `/reference/status/` | IANA-assigned status codes with names, notes, and RFC references; filter by code or text |

The paste-and-transform tools live on the home page; the rest are in the tools menu (top right) and in the Cmd+K / Ctrl+K command palette.

## Privacy and security

tst.dev is a static site. The tools run in your browser, and CloudFront access logging is off.

- The Domain Inspector is the one tool that makes network requests. When you click, your browser sends the domain to the resolver you chose (Cloudflare by default, Google as an alternative, shown in the UI) and, for certificates, to crt.sh's public certificate-transparency index. The optional DKIM selector check uses the same resolver.
- The only storage is the opt-in Remember feature: when it is on for a tool, that tool saves its inputs to `localStorage`, and turning it off deletes them. The Password & Token tool has no Remember at all, so generated secrets are not persisted.
- Pageview analytics are optional at build time: the Fathom script (cookieless) is included only when `NEXT_PUBLIC_FATHOM_SITE_ID` is set.

The site sets no security headers; the CDN is the place to add them. Attach a response-headers policy that includes:

```
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.usefathom.com; connect-src 'self' https://cdn.usefathom.com https://cloudflare-dns.com https://dns.google https://crt.sh; img-src 'self' data: https://cdn.usefathom.com; style-src 'self' 'unsafe-inline'; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

Notes on the policy:

- `script-src 'unsafe-inline'` is required: the static export inlines its route payload scripts, and the redirect stubs for the old `/uuid/`, `/status/`, and `/ip/` URLs use inline scripts. `style-src 'unsafe-inline'` is needed by CodeMirror.
- The `connect-src` list names exactly the hosts the browser may contact: the two resolvers, crt.sh, and the Fathom script. Update it together with any change to a tool's network hosts.
- If you build without analytics, drop the three `https://cdn.usefathom.com` entries from `script-src`, `connect-src`, and `img-src`.

## Running locally

Node 20.9 or newer (`.nvmrc` pins 22).

```sh
npm ci
npm run dev
```

The dev server starts at http://localhost:3000.

`next/font/google` downloads the Geist font files at build time, so a build needs network access even though the site itself is static.

## Checks

```sh
npm test        # vitest unit tests for lib/
npm run lint    # eslint
npm run build   # static export to out/
```

## Deploying

`npm run build` writes the site to `out/`. Any static host works, with two requirements:

1. Extensionless URLs must resolve to their directory's `index.html`. The export uses `trailingSlash: true`, so `/jwt/` is a directory. For S3 + CloudFront, attach the viewer-request function in `cloudfront/viewer-request.js` to the distribution's default cache behavior; it rewrites extensionless URLs to `/<path>/index.html`. Keep it in pure ES5: CloudFront Functions runs a restricted JavaScript subset, so no `const`, arrow functions, or ES6 string helpers.
2. Serve `out/404.html` for missing paths: the S3 static-website error document, or CloudFront custom error responses mapping 403 and 404 to `/404.html` (both, for a plain S3 origin).

For an S3 + CloudFront deployment the usual pieces are: a private bucket with origin access control, a distribution with your certificate, the viewer-request function, the error responses, and the response-headers policy above.

`deploy.sh` automates that path. It reads `BUCKET`, `DIST_ID`, and the optional `FATHOM_SITE_ID` from the environment, or from a `deploy.env` file next to the script (copy `deploy.env.example` to `deploy.env` and fill in the values). It builds (skip with `--no-build`), syncs `out/` to the bucket, and creates a `/*` invalidation. It needs awscli v2 with `s3:PutObject`, `s3:DeleteObject`, and `s3:ListBucket` on the bucket and `cloudfront:CreateInvalidation` and `cloudfront:GetInvalidation` on the distribution.

## Project layout

- `app/` one folder per tool and section; each page is a thin server component with the route's metadata and the tool
- `components/` the client tool components, layout, and shared UI primitives
- `lib/` pure, framework-free logic; the pure modules are covered by co-located unit tests
- `fonts/` static Geist TTFs used by the OG image and icon generators (Satori accepts TTF, OTF, and WOFF1)
- `scripts/` Node scripts that regenerate the brand images from `public/logo.svg`
- `cloudfront/` the viewer-request function for S3 + CloudFront
- `.github/workflows/ci.yml` runs the tests, lint, and build on push and pull request

## Credits

- The Geist and Geist Mono fonts are by the Geist Project, under the SIL Open Font License 1.1 (`fonts/OFL.txt`).
- The passphrase generator uses the EFF Large Wordlist, CC BY 3.0 US.
- The HTTP status table is the IANA-assigned set of status codes.

## Contributing and license

See `CONTRIBUTING.md` for how to contribute. The code is MIT licensed; see `LICENSE`. To report a security issue, see `SECURITY.md`.
