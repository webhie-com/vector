# Vector Docs

This directory contains detailed guides that were intentionally moved out of the main README to keep onboarding concise.

## Guides

- [Configuration](configuration.md): Full `VectorConfigSchema` reference and examples.
- [Routing and Request API](routing.md): Route options, request fields, and handler behavior.
- [TypeScript Types](typescript.md): Custom app types for auth/context/metadata.
- [Schema Validation](schema-validation.md): `schema.input`/`schema.output`, validation behavior, and compatibility.
- [OpenAPI and Docs UI](openapi.md): OpenAPI config, generated endpoints, and docs UI setup.
- [CLI and Route Discovery](cli-and-discovery.md): CLI commands and auto-discovery patterns.
- [Versioned Checkpoints](checkpoints.md): Freeze route versions while keeping config live. Zero-downtime rollbacks via Unix sockets.
- [Checkpoints Architecture](checkpoints-architecture.md): Internal design and contributor guide for checkpoint system.
- [Error Reference](errors.md): `APIError` response format and helpers.
- [Migration Notes](migration.md): Practical notes for upgrading existing routes.
- [Performance Notes](performance.md): Runtime and routing design considerations.
