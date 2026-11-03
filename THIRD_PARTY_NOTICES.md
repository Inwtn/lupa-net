# Third-party notices

## ILSpy / ICSharpCode.Decompiler

- Project: https://github.com/icsharpcode/ILSpy
- Bundled package: **11.1.0.9782**, preserved in `vendor/` with its extracted files.
- Package metadata copyright: Copyright 2011-2026 AlphaSierraPapa.
- License: MIT; the preserved upstream notice is [docs/LICENSE-ILSPY.txt](docs/LICENSE-ILSPY.txt).
- Incorporated Humanizer code carries its own MIT notice, preserved in [docs/LICENSE-HUMANIZER.txt](docs/LICENSE-HUMANIZER.txt).
- Package dependency and licensing metadata are preserved in the `.nuspec` and original NuGet package.

The upstream license text and package metadata use different copyright date ranges; their original wording has been preserved.

## User-provided runtimes

Node.js, PowerShell, and the .NET runtime are not redistributed here. The analyzer uses `System.Reflection.Metadata` and `System.Collections.Immutable` from the PowerShell runtime. Validation used PowerShell 7.6.5 with .NET 10 libraries, supplying the APIs required by the pinned engine. Other runtimes require validation.

## Lupa.NET implementation

The interface, server, analyzer integration, scripts, and harmless demo were created for Lupa.NET. There are no external JavaScript libraries, remote fonts, CDNs, or application telemetry. The project's own code is covered by the root MIT license. Third-party code retains its original notices.
