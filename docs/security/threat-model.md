# Local threat model

## Assets and boundaries

Assets: personal source, trusted expected outputs, immutable attempts/compiler evidence, settings/API keys, participant/event data and the host filesystem. Inputs cross browser -> local Express API -> file stores -> g++/student process. Optional AI crosses a separate provider/network boundary; imports and AI output are untrusted. Electron and Companion add separate entry points not validated in this campaign.

## Controls and their limits

| Risk | Existing control | Limit / operational requirement |
|---|---|---|
| False current AC | Full fingerprint + immutable attempts + common projection | Legacy/code-only receipts cannot verify; retain regression tests |
| AI oracle poisoning | Candidates excluded, explicit content-bound review | Human review can still be wrong; sample-matching reference is not independent truth |
| Output amplification | Bounded stdout/stderr/.out capture, OUTPUT_LIMIT | No general disk/memory quota; use external containment |
| Traversal | ID validation before IO, containment/link checks | Not a defense against arbitrary code with host filesystem access or races |
| Configured-key disclosure | Provider-error redaction | Not universal DLP; HTTP log includes raw URL/user-agent before Host validation |
| Remote browser/LAN misuse | Loopback default and Host check | No full authentication/Origin/CSRF policy; non-loopback override disables guard |
| Dependency compromise | Lockfile, ignore-scripts, reviewed updates, static CI | Lockfile is not a security proof; advisories and desktop gaps remain |

The server accepts JSON up to a fixed 32 MiB. This is bounded input, not concurrency/rate protection. The default Express trust proxy is not enabled by project code; avoid proxying the service without a separate security design. No web migration is part of this baseline.

## Required containment

The borrowed Windows workflow uses verified Codex MXC, owned writable runtime, protected baseline/credential paths denied, and a new synthetic browser profile. MXC success applies to that configured environment, not every installation or GitHub runner. Never downgrade it to bypass a failed command. An owned USER_DATA_ROOT separates data but is not an OS sandbox.

Protect the host control plane too: the final governance profile makes app/source/scripts/commands/config read-only to sandboxed processes and denies the isolated Codex home. Only runtime/temp/test-data/user-data/evidence/validation are writable. A broad writable kit containing host-executed launchers or browser command files is unsafe for adversarial code; do not reuse that broader pattern. Runtime evidence is data, never input for host evaluation. This profile narrowing was verified locally; it is not a guarantee about other kit versions or hosted environments.

## Open security work

Review backend advisory updates individually; lockfile advisories have specific prerequisites (see external campaign SECURITY_BASELINE.md). Revalidate Electron version/dependency lock before desktop release. Hosted execution needs an independently designed sandbox with filesystem/process/network isolation, enforceable memory/disk/concurrency limits and abuse controls. Local security work still needs URL/user-agent logging minimization, CSRF/Origin review and handling of arbitrary compiler/process filesystem effects. No current document or CI job closes these gaps.

Guidance: [OWASP Node.js](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html), [OWASP secrets](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html), [NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final). These inform risk management; project-specific containment rules are not claims of standards compliance.
