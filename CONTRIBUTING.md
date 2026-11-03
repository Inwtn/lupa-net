# Contributing

Use English for code comments, UI text, documentation, issues, and pull requests.

1. Create a branch for a focused change.
2. Use benign, self-contained fixtures. Include their source and explain what they test.
3. Run `npm test` and JavaScript syntax checks for changed scripts.
4. Update documentation for changes to API behavior, limits, or prerequisites.
5. Review the diff, run `npm run manifest`, and then `npm run verify`.

Do not commit `.runtime/`, malware samples, decompiled malware, incident exports, secrets, employee information, or company-specific paths. Ignore rules are a convenience; always inspect the files staged for commit.

Preserve the static-analysis boundary: target files are untrusted data. Changes that load or invoke target code, silently download target dependencies, or make the server reachable beyond loopback need a separate design review and are outside the current project scope.

Describe the concrete problem, the resulting behavior, and the checks you ran in your pull request. Preserve third-party license notices and identify any dependency version or hash changes.
