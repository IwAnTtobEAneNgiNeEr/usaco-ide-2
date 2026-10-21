# USACO IDE 2.0

Local C++ practice IDE: Express backend, vanilla JavaScript frontend, file-based workspace and g++ Judge. This source includes the Truth Core fixes verified before the 2026-10-17 governance campaign. It was received as an extracted ZIP; a Git commit, remote owner and upstream ancestry have not been established.

**Local use only.** C++ runs with the server process's OS permissions. Temporary work directories, output caps and application checks do not supply hosted isolation, memory quotas or disk quotas. Use the verified MXC environment on the borrowed Windows machine. Do not expose the service to LAN/Internet.

## Quickstart

Node 24 and GCC 16.2 were validated locally; npm and a C++17-capable g++ are required. The older engines >=18 manifest range is not a promise that end-of-life Node releases remain supported. Electron packaging and other platforms have not been revalidated here.

On a trusted development environment, install exactly the backend lockfile dependencies (no lifecycle hooks):

~~~powershell
npm ci --prefix backend --ignore-scripts
node scripts/verify-repository.cjs
# Pick a NEW, owned directory outside source; never point at another user's data.
$env:USACO_IDE_USER_DATA_DIR = 'C:\path\to\owned-usaco-data'
$env:USACO_IDE_HOST = '127.0.0.1'
$env:USACO_COMPANION_PORT = '0'
npm start
~~~

Default UI: http://127.0.0.1:5050. AI is optional. Configure it manually only if authorized; prompts can send source/problem material to the selected provider. Never commit API settings or copy a personal browser profile. See [AI configuration](docs/AIConfiguration.md).

On the borrowed Windows machine, **do not run the server/compiler directly using the quickstart**. Reuse the kit MXC wrapper and isolated runtime described in [development and tests](docs/operations/development.md). The wrapper reuses existing dependencies instead of reinstalling them.

## Develop safely

- [AGENTS.md](AGENTS.md): concise instructions and approval boundaries.
- [Development, tests and recovery](docs/operations/development.md): reproducible commands and rollback.
- [Truth Core contract](docs/security/truth-core.md): current versus historical verdicts, oracle trust and immutable evidence.
- [Threat model](docs/security/threat-model.md) and [SECURITY.md](SECURITY.md): controls, limitations and private reporting.
- [CONTRIBUTING.md](CONTRIBUTING.md): review and regression expectations.

npm test runs real compiler tests, so containment is required on the borrowed machine. CI runs only static repository/syntax checks; it does not claim Judge/browser/security coverage. Dependency alerts and remote rules remain reviewable proposals until an owner-approved sync.

Runtime belongs under USACO_IDE_USER_DATA_DIR: data/ and workspace/. Without it, the app defaults to the source root; .gitignore helps avoid accidental additions but is not a security boundary. Keep backups outside Git. Local research/event logs exist; review [docs/NCKH.md](docs/NCKH.md) before handling participant data.

Historical product plans are retained in [legacy notes](docs/reference/legacy-product-direction.md). They are not a migration plan or verified Git provenance. This campaign introduces no web deployment or product redesign. License: [MIT](LICENSE), preserved without changing copyright/ownership claims.
