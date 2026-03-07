# Performance Notes

Vector performance comes from a small runtime model:

- Bun runtime and native APIs
- Zero runtime routing dependencies
- Pre-compiled route matchers
- Built-in cache hooks to avoid duplicate expensive work

Benchmarks in this repository include load, soak, and benchmark scripts under `tests/e2e`.

Run examples:

```bash
bun run test:load
bun run test:soak
bun run test:benchmark
bun run test:benchmark:io-schema
```

`test:benchmark:io-schema` is a concurrency sweep with mixed validated API traffic and
Promise-based simulated I/O, useful for estimating max RPS under typical app patterns.

Performance depends on route logic, auth/cache integrations, and infrastructure.
Use benchmark numbers as directional rather than absolute.
