# Contributing

tst.dev is a small side project, so replies can be slow. Issues are welcome, and please open one before a pull request so we can agree on the direction first.

Before submitting a change, run the checks, and make sure all three pass:

```sh
npm test
npm run lint
npm run build
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `style:`, `perf:`.

## Privacy rules

The tools run in the browser, and that is part of the design. A change that makes a tool send requests to a host it did not contact before:

- must set `network: true` on the tool's registry entry in `lib/tools.ts` or `lib/sections.ts`,
- must make the call only on a user action,
- must add the host to the CSP `connect-src` list in the README,
- should discuss the new destination in an issue first.

Do not add analytics, tracking, or storage beyond the opt-in Remember feature.

## Tone

Be kind in issues and pull requests.
