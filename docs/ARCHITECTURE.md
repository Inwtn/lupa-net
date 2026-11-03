# Architecture

## Components and data flow

The browser reads a user-selected file and posts its bytes to the local server with `application/octet-stream`. The server validates the size and PE magic, computes SHA-256, and writes a randomly named file under `.runtime/`. It starts a separate `pwsh` process with explicit arguments and no shell interpolation.

`backend/analyze.ps1` checks the engine DLL hash, loads that trusted library, and compiles `Analyzer.cs` in memory using reference assemblies supplied by PowerShell. The worker opens the target as a `PEFile`, reads metadata, and writes JSON to a temporary result file. No target methods or target attributes are invoked.

The metadata pass inventories types, signatures, references, and user strings. C# requests use `CSharpDecompiler`; IL requests use `ReflectionDisassembler`. `RuntimeOnlyResolver` limits dependency lookup to the PowerShell runtime directory and reports unresolved names. Its framework versions can differ from the target's framework.

The UI uses text nodes for displayed sample contents. Notes are stored in browser local storage under a SHA-256-based key. Exports are generated in the browser. Session state and decompiled code caches stay in the server process.

## Local HTTP API

| Request | Result |
| --- | --- |
| `GET /api/status` | Engine availability, version, and limits |
| `GET /api/demo` | Import the bundled harmless assembly |
| `POST /api/assemblies` | Import raw bytes; optional URL-encoded `X-File-Name` header |
| `GET /api/assemblies/{id}` | Session metadata |
| `GET /api/assemblies/{id}/code?token=0x06000001&language=cs` | Method C# (`cs`) or IL (`il`) |
| Same code endpoint with a `0x02......` token | Type C# or IL |

Tokens must exist in the imported module and identify a type or method. Other token tables and languages are rejected. Type output is available through the API; the current UI navigates methods.

## Operational limits

| Resource | Limit |
| --- | --- |
| Input file | 32 MiB |
| Assemblies per session | 8 |
| Concurrent analysis workers | 2 |
| Outer worker deadline | 35 seconds |
| Cooperative C#/IL cancellation | 20 seconds |
| Worker JSON result file | 20 MiB |
| Types / methods in inventory | 10,000 / 100,000 |
| User strings | 10,000 entries, 2 million total displayed characters |
| Individual string | 4,096 displayed characters |
| C#/IL response | 2 million characters |
| Code cache per assembly | 100 entries, 16 MiB budget |
| Visible/exported filtered strings | First 1,000 matching entries |

Some budgets are checked after parsing or generation. They do not impose an operating-system memory quota. The workers inherit the user's permissions and environment. Normal exit cleans tracked temporary files, but an interrupted worker or abrupt server exit can leave residues.

## Scope boundaries

There is no target execution, debugging, binary patching, project reconstruction, automatic string decryption, plugin retrieval, or C2 communication. ILSpy reads managed code; arbitrary native code is outside this version's scope. REA was used separately to inspect the trusted engine; it is not a runtime dependency of this application.
