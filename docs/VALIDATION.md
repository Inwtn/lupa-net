# Validation

The English publication copy was validated on November 3, 2026 with Node.js **24.22.1**, PowerShell **7.6.5**, .NET **10** runtime libraries, and ILSpy **11.1.0.9782** on Windows.

## Checks performed

- `node --check server.cjs` and `node --check public/app.js`: passed.
- `node --test tests/integration.test.cjs`: **7 tests passed, 0 failed** (approximately 17.5 seconds).
- The included `demo/Demo.dll` was compiled from `demo/Demo.cs`. No demo methods or analyzed target methods were invoked.
- The included engine DLL and original NuGet package match the hashes recorded in [ENGINE.md](ENGINE.md).
- The publication copy was assembled from an explicit tool-file allowlist. Original investigation folders, imported runtime files, incident screenshots, and raw workstation-specific REA records were excluded.

The first test attempt encountered a sandbox restriction on connecting to its own temporary loopback listener (`EACCES`). The same suite passed when allowed to make those local HTTP requests. No firewall or antivirus configuration was changed.

## Coverage

1. Verified engine availability and loopback binding.
2. Demo types, signatures, strings, and identity metadata.
3. Method C# reconstructs addition; IL includes `add` and `ret`.
4. Type-level C# and IL output.
5. Import identity and malformed PE rejection.
6. Origin, Host, content type, token, and private-file restrictions.
7. Declared upload limits before body acceptance.

The suite uses only the harmless demo and deliberately malformed synthetic bytes. No malware was executed, no C2 server was contacted, and no recovered malware was compiled during publication preparation.

## Limits of these results

The English UI has syntax checks; this publication pass does not claim a new end-to-end visual review of every interface state. Prior interface checks were performed on the original local version. Linux, macOS, runtimes other than the stated environment, hostile-parser resilience, worker memory quotas, and multi-user deployment were not validated.

SHA-256 manifests detect differences from the distributed file set. They do not certify the publisher, the safety of an input, or the absence of vulnerabilities.
