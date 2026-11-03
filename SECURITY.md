# Security

Lupa.NET is a local static-analysis tool for a single user. It is not an antivirus, a malware sandbox, a multi-user web service, or a guarantee that an input is safe.

## Trust boundary

- The analyzer reads target bytes as PE/CLI metadata. It does not load the target into the CLR for execution or invoke its methods.
- ILSpy, Node.js, PowerShell, the .NET runtime, and Lupa.NET itself are trusted code in the analysis environment.
- A separate worker and timeouts provide fault containment, not OS-level isolation. Workers have the user's privileges; network access is not blocked by this project.
- The HTTP listener binds to loopback and validates Host and Origin. It has no user authentication. Do not expose it to other machines or a public proxy.
- Imported files are copied into `.runtime/`. Normal cleanup is best effort; abrupt termination can leave bytes behind.
- Browser notes and exports can contain sample content or sensitive findings. The app does not automatically publish them.

Use a dedicated isolated environment for suspicious files. Avoid credentials, shared folders, and other sensitive material in that environment. Decompilation does not neutralize an executable, and changing its extension does not change its capabilities.

## Reporting a vulnerability

Use the repository's private security reporting option if it is available. Otherwise, open an issue requesting a private reporting channel without including exploit payloads or confidential evidence. Do not attach malware, company logs, credentials, memory dumps, or employee information to public issues.

No response-time commitment or formal security certification is provided. Existing tests cover specified behavior with benign fixtures, not all malformed assemblies or sandbox escape scenarios.
