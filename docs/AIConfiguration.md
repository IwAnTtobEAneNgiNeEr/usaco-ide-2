# Optional AI configuration

AI is optional; normal editing/judging does not require a provider account. Configure an authorized endpoint/model/key manually in Settings -> AI. Do not copy someone else's credentials or put secrets in Git, screenshots, reports or a delivery archive.

Settings persist under USER_DATA_ROOT/data/ai-settings.json. Without USACO_IDE_USER_DATA_DIR, USER_DATA_ROOT defaults to the project root; on the borrowed machine the wrapper provides owned runtime data outside source. The example file contains placeholders only. Never commit the runtime settings file. If a real key leaks, revoke/rotate it at the provider; deleting local traces is not revocation.

Prompts may include problem statements, tests and source. Requests go to the configured provider URL; authorization and data-sharing choices are the owner's responsibility. Use synthetic material for tests. Do not place secrets in URL query strings: HTTP request URLs/user agents may be logged. Local research/event logs also exist; this application is not universally telemetry-free.

Provider-error redaction removes configured key material and recognized URI/auth/query/Bearer forms. It is a scoped defense, not a guarantee that all sensitive information in prompts, responses, logs or arbitrary provider text is removed. Review exports separately.

Generated outputs remain candidate oracle material regardless of non-empty expected output or reference sample matches. See TestGeneration.md and security/truth-core.md. Compile failure, mismatch or no independent verification leaves review required; it must not silently modify the trusted judge suite.
