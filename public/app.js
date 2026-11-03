'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const state = { assembly: null, selectedType: null, selectedMethod: null, tab: 'cs', code: '', maxFileBytes: 25 * 1024 * 1024, busy: false, request: 0, toastTimer: null, noteTimer: null };
  const tokenString = (token) => typeof token === 'number' ? `0x${token.toString(16).padStart(8, '0')}` : String(token ?? '');
  const asText = (value, fallback = '—') => value == null || value === '' ? fallback : String(value);
  const formatBytes = (bytes) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString('en-US', { maximumFractionDigits: 2 })} MB` : `${(bytes / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KB`;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function status(message, kind = '') {
    $('status').className = `status-message ${kind}`;
    $('status-text').textContent = message;
  }

  function toast(message, success = false) {
    clearTimeout(state.toastTimer);
    $('toast').textContent = message;
    $('toast').className = `toast${success ? ' success' : ''}`;
    $('toast').hidden = false;
    state.toastTimer = setTimeout(() => { $('toast').hidden = true; }, success ? 3500 : 9000);
  }

  async function api(path, options) {
    const response = await fetch(path, { credentials: 'same-origin', ...options });
    let result;
    try { result = await response.json(); }
    catch { throw new Error(`The analyzer returned an invalid response (HTTP ${response.status}).`); }
    if (!response.ok) {
      const detail = result.error?.message ?? result.error ?? result.message;
      throw new Error(typeof detail === 'string' ? detail : `Analysis could not be completed (HTTP ${response.status}).`);
    }
    return result;
  }

  function setBusy(busy) {
    state.busy = busy;
    ['open-top', 'open-hero', 'open-demo'].forEach((id) => { $(id).disabled = busy; });
  }

  function showWarnings(warnings = []) {
    const box = $('warnings');
    box.replaceChildren();
    for (const warning of warnings) box.append(element('p', '', typeof warning === 'string' ? warning : JSON.stringify(warning)));
    box.hidden = warnings.length === 0;
  }

  function noteKey() { return state.assembly ? `lupa-dotnet:notes:${state.assembly.sha256}` : null; }

  function saveNotes() {
    clearTimeout(state.noteTimer);
    if (!state.assembly) return;
    try {
      localStorage.setItem(noteKey(), $('notes').value);
      $('notes-state').textContent = 'Saved in this browser, keyed by SHA-256.';
    } catch { $('notes-state').textContent = 'The browser could not save your notes.'; }
  }

  function hydrateAssembly(assembly) {
    if (!assembly || typeof assembly.id !== 'string' || !Array.isArray(assembly.types)) throw new Error('The returned metadata is incomplete.');
    if (state.assembly) saveNotes();
    state.request += 1;
    state.assembly = assembly;
    state.selectedType = null;
    state.selectedMethod = null;
    $('empty-state').hidden = true;
    $('analysis-view').hidden = false;
    $('tree-search').disabled = false;
    $('tree-search').value = '';
    $('string-search').value = '';
    $('assembly-name').lastElementChild.textContent = asText(assembly.assemblyName, assembly.name);
    $('assembly-name').title = asText(assembly.name);
    $('document-name').textContent = asText(assembly.name);
    $('document-subtitle').textContent = `${asText(assembly.assemblyName)} · ${asText(assembly.version)} · ${asText(assembly.framework, 'Framework not identified')}`;
    $('metric-architecture').textContent = asText(assembly.architecture);
    $('metric-framework').textContent = asText(assembly.framework);
    const methodCount = assembly.types.reduce((sum, type) => sum + (type.methods?.length ?? 0), 0);
    $('metric-counts').textContent = `${assembly.types.length} / ${methodCount}`;
    $('metric-bytes').textContent = formatBytes(Number(assembly.bytes) || 0);
    $('type-count').textContent = String(assembly.types.length);
    $('detail-sha').textContent = asText(assembly.sha256);
    $('detail-mvid').textContent = asText(assembly.mvid);
    $('detail-version').textContent = asText(assembly.version);
    $('copy-sha').disabled = !assembly.sha256;
    $('notes').disabled = false;
    try { $('notes').value = localStorage.getItem(noteKey()) || ''; $('notes-state').textContent = 'Saved in this browser, keyed by SHA-256.'; }
    catch { $('notes').value = ''; $('notes-state').textContent = 'Notes are unavailable in this browser.'; }
    $('reference-count').textContent = String(assembly.references?.length || 0);
    const references = $('references');
    references.replaceChildren();
    for (const reference of assembly.references || []) {
      const row = element('div', 'reference', reference.name);
      row.append(element('small', '', reference.version));
      references.append(row);
    }
    if (!references.childElementCount) references.append(element('p', 'muted', 'No declared references.'));
    showWarnings(assembly.warnings || []);
    renderTree();
    setTab('cs');
    const firstType = assembly.types.find((type) => type.methods?.some((method) => method.hasBody)) ?? assembly.types[0];
    const firstMethod = firstType?.methods?.find((method) => method.hasBody) ?? firstType?.methods?.[0];
    if (firstMethod) selectMethod(firstType, firstMethod);
    else showCode('// No method body is available in this assembly.');
    status(`File analyzed · ${assembly.types.length} types · ${methodCount} methods`);
  }

  async function importFile(file) {
    if (!file || state.busy) return;
    if (file.size === 0) { toast('The file is empty. Select a .NET assembly.'); return; }
    if (file.size > state.maxFileBytes) { toast(`The per-file limit is ${formatBytes(state.maxFileBytes)}.`); return; }
    setBusy(true);
    status(`Reading ${file.name}…`, 'busy');
    try {
      const assembly = await api('/api/assemblies', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      hydrateAssembly(assembly);
    } catch (error) { status(error.message, 'error'); toast(error.message); }
    finally { setBusy(false); $('file-input').value = ''; }
  }

  async function openDemo() {
    if (state.busy) return;
    setBusy(true);
    status('Opening the harmless demonstration assembly…', 'busy');
    try { hydrateAssembly(await api('/api/demo')); }
    catch (error) { status(error.message, 'error'); toast(error.message); }
    finally { setBusy(false); }
  }

  function renderTree() {
    const tree = $('tree');
    tree.replaceChildren();
    if (!state.assembly) return;
    const query = $('tree-search').value.trim().toLocaleLowerCase('en-US');
    const groups = new Map();
    for (const type of state.assembly.types) {
      const typeMatch = `${type.name} ${type.namespace} ${type.fullName}`.toLocaleLowerCase('en-US').includes(query);
      const methods = (type.methods || []).filter((method) => typeMatch || `${method.name} ${method.signature}`.toLocaleLowerCase('en-US').includes(query));
      if (query && !typeMatch && !methods.length) continue;
      const namespace = type.namespace || '(global)';
      if (!groups.has(namespace)) groups.set(namespace, []);
      groups.get(namespace).push({ type, methods });
    }
    for (const [namespace, entries] of groups) {
      const group = element('div', 'namespace');
      const heading = element('button', 'namespace-title');
      heading.type = 'button';
      heading.title = namespace;
      const chevron = element('span', 'tree-chevron', '▾');
      chevron.setAttribute('aria-hidden', 'true');
      heading.append(chevron, element('span', '', namespace));
      heading.setAttribute('aria-expanded', 'true');
      const children = element('div');
      heading.addEventListener('click', () => {
        children.hidden = !children.hidden;
        heading.setAttribute('aria-expanded', String(!children.hidden));
        chevron.textContent = children.hidden ? '▸' : '▾';
      });
      group.append(heading, children);
      for (const { type, methods } of entries) {
        const item = element('div', 'tree-type');
        const expanded = Boolean(query) || state.selectedType === type;
        const typeButton = element('button', `type-button${state.selectedType === type ? ' selected' : ''}`);
        typeButton.type = 'button';
        typeButton.title = type.fullName || type.name;
        typeButton.setAttribute('aria-expanded', String(expanded));
        const typeChevron = element('span', 'tree-chevron', expanded ? '▾' : '▸');
        typeChevron.setAttribute('aria-hidden', 'true');
        typeButton.append(typeChevron, element('span', 'tree-symbol', 'C'), element('span', 'tree-label', type.name));
        const methodList = element('div', 'method-list');
        methodList.hidden = !expanded;
        function populateMethods() {
          if (methodList.childElementCount) return;
          for (const method of methods) {
            const selected = state.selectedType === type && state.selectedMethod === method;
            const button = element('button', `method-button${selected ? ' selected' : ''}${method.hasBody ? '' : ' no-body'}`);
            button.type = 'button';
            button.title = `${method.signature || method.name} · ${tokenString(method.token)}`;
            if (selected) button.setAttribute('aria-current', 'true');
            button.append(element('span', 'tree-symbol', 'm'), element('span', 'tree-label', method.name));
            button.addEventListener('click', () => selectMethod(type, method));
            methodList.append(button);
          }
        }
        typeButton.addEventListener('click', () => {
          methodList.hidden = !methodList.hidden;
          if (!methodList.hidden) populateMethods();
          typeButton.setAttribute('aria-expanded', String(!methodList.hidden));
          typeChevron.textContent = methodList.hidden ? '▸' : '▾';
        });
        if (expanded) populateMethods();
        item.append(typeButton, methodList);
        children.append(item);
      }
      tree.append(group);
    }
    if (!groups.size) tree.append(element('p', 'tree-empty muted', 'No matching type or method.'));
  }

  function showCode(code) {
    state.code = String(code ?? '');
    $('code-content').textContent = state.code;
    const count = Math.max(1, state.code.split('\n').length);
    $('line-numbers').textContent = Array.from({ length: count }, (_, index) => index + 1).join('\n');
    $('code-panel').scrollTop = 0;
    $('code-panel').scrollLeft = 0;
  }

  function selectMethod(type, method) {
    state.selectedType = type;
    state.selectedMethod = method;
    renderTree();
    if (state.tab !== 'cs' && state.tab !== 'il') setTab('cs');
    else loadMethod();
  }

  async function loadMethod() {
    const assembly = state.assembly;
    const method = state.selectedMethod;
    if (!assembly || !method) return;
    const request = ++state.request;
    const language = state.tab;
    $('code-path').textContent = `${state.selectedType.fullName || state.selectedType.name} › ${method.signature || method.name}`;
    $('code-path').title = $('code-path').textContent;
    $('code-token').textContent = tokenString(method.token);
    showCode('// Loading code…');
    status(`Reading ${method.name} as ${language === 'cs' ? 'C#' : 'IL'}…`, 'busy');
    try {
      const result = await api(`/api/assemblies/${encodeURIComponent(assembly.id)}/code?token=${encodeURIComponent(tokenString(method.token))}&language=${language}`);
      if (request !== state.request) return;
      showCode(result.code);
      showWarnings([...(assembly.warnings || []), ...(result.warnings || [])]);
      status(`${language === 'cs' ? 'Reconstructed C#' : 'IL instructions'} · ${tokenString(method.token)} · static inspection`);
    } catch (error) {
      if (request !== state.request) return;
      showCode(`// This method could not be read.\n// ${error.message}`);
      status(error.message, 'error');
      toast(error.message);
    }
  }

  function setTab(tab) {
    state.tab = tab;
    state.request += 1;
    for (const button of document.querySelectorAll('[data-tab]')) {
      const selected = button.dataset.tab === tab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    $('code-panel').hidden = tab === 'strings';
    $('strings-panel').hidden = tab !== 'strings';
    $('download-code').disabled = !state.assembly;
    $('code-panel').setAttribute('aria-labelledby', `tab-${tab}`);
    if (!state.assembly) return;
    showWarnings(state.assembly.warnings || []);
    if (tab === 'metadata') {
      $('code-path').textContent = 'Assembly metadata';
      $('code-token').textContent = 'JSON';
      const { strings, ...metadata } = state.assembly;
      showCode(JSON.stringify({ ...metadata, stringsCount: strings?.length || 0 }, null, 2));
      status('Assembly metadata · statically extracted fields');
    } else if (tab === 'strings') {
      $('code-path').textContent = 'Declared assembly strings';
      $('code-token').textContent = '#US';
      renderStrings();
      status('String literals · displayed as text');
    } else if (state.selectedMethod) loadMethod();
    else {
      $('code-path').textContent = 'Select a method in the explorer';
      $('code-token').textContent = '';
      showCode('// Select a method in the explorer to read its code.');
    }
  }

  function renderStrings() {
    const strings = state.assembly?.strings || [];
    const query = $('string-search').value.toLocaleLowerCase('en-US');
    const matches = strings.filter((item) => String(item.value ?? '').toLocaleLowerCase('en-US').includes(query));
    const shown = matches.slice(0, 1000);
    $('strings-count').textContent = `${matches.length} of ${strings.length} strings${matches.length > shown.length ? ' · showing the first 1,000; refine your search' : ''}`;
    const list = $('strings-list');
    list.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const item of shown) {
      const row = element('div', 'string-row');
      row.append(element('span', 'string-token', tokenString(item.token)), element('span', 'string-value', item.value));
      fragment.append(row);
    }
    list.append(fragment);
    if (!shown.length) list.append(element('p', 'no-results', query ? 'No strings match your search.' : 'No string literals found.'));
  }

  function download(content, name, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = element('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  for (const id of ['open-top', 'open-hero']) $(id).addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (event) => importFile(event.target.files[0]));
  $('open-demo').addEventListener('click', openDemo);
  $('tree-search').addEventListener('input', renderTree);
  $('string-search').addEventListener('input', renderStrings);
  document.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => setTab(button.dataset.tab)));
  document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[data-tab]')];
    const current = tabs.findIndex((tab) => tab.dataset.tab === state.tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next].dataset.tab);
    tabs[next].focus();
  });
  $('notes').addEventListener('input', () => {
    $('notes-state').textContent = 'Saving…';
    clearTimeout(state.noteTimer);
    state.noteTimer = setTimeout(saveNotes, 400);
  });
  window.addEventListener('pagehide', saveNotes);
  $('copy-sha').addEventListener('click', async () => {
    if (!state.assembly?.sha256) return;
    try { await navigator.clipboard.writeText(state.assembly.sha256); toast('SHA-256 copied.', true); }
    catch { toast('Copy failed. Select the SHA-256 in the panel and copy it manually.'); }
  });
  $('download-code').addEventListener('click', () => {
    if (!state.assembly) return;
    const query = $('string-search').value.toLocaleLowerCase('en-US');
    const code = state.tab === 'strings' ? (state.assembly.strings || []).filter((item) => String(item.value ?? '').toLocaleLowerCase('en-US').includes(query)).slice(0, 1000).map((item) => `${tokenString(item.token)}\t${item.value}`).join('\n') : state.code;
    const name = `${state.assembly.name || 'assembly'}-${state.tab}-${tokenString(state.selectedMethod?.token) || 'all'}.txt`.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
    download(code, name);
  });
  $('export-report').addEventListener('click', () => {
    if (!state.assembly) return;
    const report = { application: 'Lupa.NET', exportedAt: new Date().toISOString(), analysis: 'static', ...state.assembly, notes: $('notes').value };
    download(JSON.stringify(report, null, 2), `lupa-net-${state.assembly.sha256 || 'report'}.json`, 'application/json;charset=utf-8');
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.body.classList.remove('inspector-open');
      $('details-toggle').setAttribute('aria-expanded', 'false');
    }
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && state.assembly) {
      event.preventDefault();
      $('tree-search').focus();
    }
  });
  $('details-toggle').addEventListener('click', () => {
    const open = document.body.classList.toggle('inspector-open');
    $('details-toggle').setAttribute('aria-expanded', String(open));
  });
  let dragDepth = 0;
  window.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = state.busy ? 'none' : 'copy';
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) $('drop-overlay').hidden = true;
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    if (files.length > 1) { toast('Select one file at a time.'); return; }
    importFile(files[0]);
  });
  window.addEventListener('blur', () => { dragDepth = 0; $('drop-overlay').hidden = true; });

  async function initialize() {
    try {
      const info = await api('/api/status');
      if (Number.isFinite(info.maxFileBytes) && info.maxFileBytes > 0) state.maxFileBytes = info.maxFileBytes;
      $('file-limit').textContent = `One file at a time · up to ${formatBytes(state.maxFileBytes)}`;
      $('engine-version').textContent = `ICSharpCode.Decompiler ${info.engineVersion || ''}`.trim();
      if (info.engineReady) status('Analyzer ready · no target is running');
      else status('The analysis engine is unavailable. Check your local setup.', 'error');
    } catch (error) { status('Could not connect to the local analyzer.', 'error'); toast(error.message); }
  }
  initialize();
})();
