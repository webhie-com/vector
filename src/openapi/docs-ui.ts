export function renderOpenAPIDocsHtml(
  spec: Record<string, unknown>,
  openapiPath: string,
  tailwindScriptPath: string,
  logoDarkPath: string,
  logoWhitePath: string,
  appleTouchIconPath: string,
  favicon32Path: string,
  favicon16Path: string,
  webManifestPath: string
): string {
  const specJson = JSON.stringify(spec).replace(/<\/script/gi, '<\\/script');
  const openapiPathJson = JSON.stringify(openapiPath);
  const tailwindScriptPathJson = JSON.stringify(tailwindScriptPath);
  const logoDarkPathJson = JSON.stringify(logoDarkPath);
  const logoWhitePathJson = JSON.stringify(logoWhitePath);
  const appleTouchIconPathJson = JSON.stringify(appleTouchIconPath);
  const favicon32PathJson = JSON.stringify(favicon32Path);
  const favicon16PathJson = JSON.stringify(favicon16Path);
  const webManifestPathJson = JSON.stringify(webManifestPath);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vector API Documentation</title>
  <link rel="apple-touch-icon" sizes="180x180" href=${appleTouchIconPathJson}>
  <link rel="icon" type="image/png" sizes="32x32" href=${favicon32PathJson}>
  <link rel="icon" type="image/png" sizes="16x16" href=${favicon16PathJson}>
  <link rel="manifest" href=${webManifestPathJson}>
  <script>
    if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  </script>
  <script src=${tailwindScriptPathJson}></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              DEFAULT: '#00A1FF',
              mint: '#00FF8F',
              soft: '#E4F5FF',
              deep: '#007BC5',
            },
            dark: { bg: '#0A0A0A', surface: '#111111', border: '#1F1F1F', text: '#EDEDED' },
            light: { bg: '#FFFFFF', surface: '#F9F9F9', border: '#E5E5E5', text: '#111111' }
          },
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace'],
          }
        }
      }
    };
  </script>
  <style>
    :root {
      --motion-fast: 180ms;
      --motion-base: 280ms;
      --motion-slow: 420ms;
      --motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
    }
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
    body { transition: background-color 150ms ease, color 150ms ease; }
    #sidebar-nav a,
    #send-btn,
    #copy-curl,
    #add-header-btn,
    #expand-body-btn,
    #expand-response-btn,
    #expand-close,
    #expand-apply {
      transition:
        transform var(--motion-fast) var(--motion-ease),
        opacity var(--motion-fast) var(--motion-ease),
        border-color var(--motion-fast) var(--motion-ease),
        background-color var(--motion-fast) var(--motion-ease),
        color var(--motion-fast) var(--motion-ease);
      will-change: transform, opacity;
    }
    #sidebar-nav a:hover,
    #send-btn:hover,
    #add-header-btn:hover,
    #expand-body-btn:hover,
    #expand-response-btn:hover {
      transform: translateY(-1px);
    }
    #endpoint-card {
      transition:
        box-shadow var(--motion-base) var(--motion-ease),
        transform var(--motion-base) var(--motion-ease),
        opacity var(--motion-base) var(--motion-ease);
    }
    .enter-fade-up {
      animation: enterFadeUp var(--motion-base) var(--motion-ease) both;
    }
    .enter-stagger {
      animation: enterStagger var(--motion-base) var(--motion-ease) both;
      animation-delay: var(--stagger-delay, 0ms);
    }
    @keyframes enterFadeUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes enterStagger {
      from { opacity: 0; transform: translateX(-6px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .button-spinner {
      display: inline-block;
      width: 0.875rem;
      height: 0.875rem;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 9999px;
      animation: spin 700ms linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    }
    .json-key { color: #007bc5; }
    .json-string { color: #334155; }
    .json-number { color: #00a1ff; }
    .json-boolean { color: #475569; }
    .json-null { color: #64748b; }
    .dark .json-key { color: #7dc9ff; }
    .dark .json-string { color: #d1d9e6; }
    .dark .json-number { color: #7dc9ff; }
    .dark .json-boolean { color: #93a4bf; }
    .dark .json-null { color: #7c8ba3; }
    .param-row {
      --param-row-bg-rgb: 255 255 255;
    }
    .dark .param-row {
      --param-row-bg-rgb: 10 10 10;
    }
    .param-row-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      width: 100%;
    }
    .param-row-main {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      overflow: hidden;
    }
    .param-tooltip-trigger {
      border: 0;
      margin: 0;
      padding: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
      min-width: 0;
    }
    .param-tooltip-trigger:focus-visible {
      outline: 2px solid rgba(0, 161, 255, 0.65);
      outline-offset: 2px;
      border-radius: 0.375rem;
    }
    .param-name-trigger {
      min-width: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }
    .param-name-text {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 18px), transparent 100%);
      -webkit-mask-image: linear-gradient(to right, #000 0%, #000 calc(100% - 18px), transparent 100%);
    }
    .param-type-fade {
      position: relative;
      z-index: 1;
      display: block;
      max-width: none;
      overflow: visible;
      text-overflow: clip;
      padding-left: 1.25rem;
      white-space: nowrap;
      text-align: left;
      justify-self: end;
      background: linear-gradient(
        90deg,
        rgba(var(--param-row-bg-rgb), 0) 0%,
        rgba(var(--param-row-bg-rgb), 0.76) 36%,
        rgba(var(--param-row-bg-rgb), 0.94) 68%,
        rgba(var(--param-row-bg-rgb), 1) 100%
      );
    }
    #param-value-tooltip {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 70;
      width: min(42rem, calc(100vw - 0.75rem));
      border-radius: 0.5rem;
      border: 1px solid rgba(15, 23, 42, 0.12);
      background: rgba(255, 255, 255, 0.92);
      color: #111111;
      box-shadow: 0 10px 20px rgba(15, 23, 42, 0.14);
      backdrop-filter: blur(12px) saturate(145%);
      -webkit-backdrop-filter: blur(12px) saturate(145%);
      padding: 0.4rem 0.6rem;
      opacity: 0;
      pointer-events: none;
      transform: translateY(6px) scale(0.98);
      transition:
        opacity var(--motion-fast) var(--motion-ease),
        transform var(--motion-fast) var(--motion-ease);
    }
    #param-value-tooltip.is-visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }
    .dark #param-value-tooltip {
      border-color: rgba(148, 163, 184, 0.24);
      background: rgba(17, 17, 17, 0.9);
      color: #ededed;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45);
    }
    #param-tooltip-line {
      margin: 0;
      font-size: 11px;
      line-height: 1.3;
      font-family: "JetBrains Mono", monospace;
      white-space: normal;
      word-break: break-word;
    }
    #param-tooltip-description {
      margin: 0.2rem 0 0;
      font-size: 11px;
      line-height: 1.3;
      opacity: 0.8;
      white-space: normal;
      word-break: break-word;
    }
  </style>
</head>
<body class="bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text font-sans antialiased flex h-screen overflow-hidden">
  <div id="mobile-backdrop" class="fixed inset-0 z-30 bg-black/40 opacity-0 pointer-events-none transition-opacity duration-300 md:hidden"></div>
  <aside id="docs-sidebar" class="fixed inset-y-0 left-0 z-40 w-72 md:w-64 border-r border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface flex flex-col flex-shrink-0 transition-transform duration-300 ease-out -translate-x-full md:translate-x-0 md:static md:z-auto transition-colors duration-150">
    <div class="h-14 flex items-center px-5 border-b border-light-border dark:border-dark-border">
      <div class="flex items-center">
        <img src=${logoDarkPathJson} alt="Vector" class="h-6 w-auto block dark:hidden" />
        <img src=${logoWhitePathJson} alt="Vector" class="h-6 w-auto hidden dark:block" />
      </div>
      <button id="sidebar-close" class="ml-auto p-1.5 rounded-full border border-light-border dark:border-dark-border bg-light-bg/90 dark:bg-dark-bg/90 opacity-90 hover:opacity-100 transition md:hidden" aria-label="Close Menu" title="Close Menu">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    </div>
    <div class="p-4">
      <div class="relative">
        <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <input
          id="sidebar-search"
          type="text"
          placeholder="Search routes..."
          class="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg focus:outline-none focus:border-brand dark:focus:border-brand transition-colors"
        />
      </div>
    </div>
    <div id="auth-panel" class="border-b border-light-border dark:border-dark-border">
      <button id="auth-toggle" class="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider opacity-60 hover:opacity-100 transition-opacity">
        <span class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          Auth
        </span>
        <svg id="auth-chevron" class="w-3.5 h-3.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
      </button>
      <div id="auth-fields" class="px-4 pb-3 space-y-2"></div>
    </div>
    <nav class="flex-1 overflow-y-auto px-3 py-2 space-y-6 text-sm" id="sidebar-nav"></nav>
  </aside>

  <main class="flex-1 flex flex-col min-w-0 relative">
    <header class="h-14 flex items-center justify-between px-6 border-b border-light-border dark:border-dark-border lg:border-none lg:bg-transparent absolute top-0 w-full z-10 bg-light-bg/80 dark:bg-dark-bg/80 backdrop-blur-sm transition-colors duration-150">
      <div class="md:hidden flex items-center gap-2">
        <button id="sidebar-open" class="p-1.5 rounded-full border border-light-border dark:border-dark-border bg-light-bg/90 dark:bg-dark-bg/90 opacity-90 hover:opacity-100 transition" aria-label="Open Menu" title="Open Menu">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
          </svg>
        </button>
        <img src=${logoDarkPathJson} alt="Vector" class="h-5 w-auto block dark:hidden" />
        <img src=${logoWhitePathJson} alt="Vector" class="h-5 w-auto hidden dark:block" />
      </div>
      <div class="flex-1"></div>
      <button id="theme-toggle" class="p-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors" aria-label="Toggle Dark Mode">
        <svg class="w-5 h-5 hidden dark:block text-dark-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        <svg class="w-5 h-5 block dark:hidden text-light-text" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
      </button>
    </header>

    <div class="flex-1 overflow-y-auto pt-14 pb-24">
      <div class="max-w-[860px] mx-auto px-6 py-12 lg:py-16">
        <div class="mb-12">
          <h1 class="text-4xl font-bold tracking-tight mb-4" id="tag-title">API</h1>
          <p class="text-lg opacity-80 max-w-2xl leading-relaxed" id="tag-description">Interactive API documentation.</p>
        </div>
        <hr class="border-t border-light-border dark:border-dark-border mb-12">
        <div class="mb-20" id="endpoint-card">
          <div class="flex items-center gap-3 mb-4">
             <span id="endpoint-method" class="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium"></span>
             <h2 class="text-xl font-semibold tracking-tight" id="endpoint-title">Operation</h2>
          </div>
          <div id="deprecated-banner" class="hidden mb-4 px-3 py-2 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium">
            ! This operation is deprecated
          </div>
          <p class="text-sm opacity-80 mb-8 font-mono" id="endpoint-path">/</p>
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div class="lg:col-span-5 space-y-8" id="params-column"></div>
            <div class="lg:col-span-7">
              <div class="rounded-lg border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg overflow-hidden group">
                <div class="flex items-center justify-between px-4 py-2 border-b border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface">
                   <span class="text-xs font-mono text-light-text/70 dark:text-dark-text/70">cURL</span>
                   <button class="text-xs text-light-text/50 hover:text-light-text dark:text-dark-text/50 dark:hover:text-dark-text transition-colors" id="copy-curl">Copy</button>
                </div>
                <pre class="p-4 text-sm font-mono text-light-text dark:text-dark-text overflow-x-auto leading-relaxed"><code id="curl-code"></code></pre>
              </div>
              <div class="mt-4 p-4 rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface">
                <div class="flex items-center justify-between mb-3">
                  <h4 class="text-sm font-medium">Try it out</h4>
                  <button id="send-btn" class="px-4 py-1.5 bg-brand text-white text-sm font-semibold rounded hover:bg-brand-deep transition-colors">
                    <span class="inline-flex items-center gap-2">
                      <span id="send-btn-spinner" class="button-spinner hidden" aria-hidden="true"></span>
                      <span id="send-btn-label">Submit</span>
                    </span>
                  </button>
                </div>
                <div class="space-y-4">
                  <div>
                    <div id="request-param-inputs" class="space-y-3"></div>
                  </div>

                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <p class="text-xs font-semibold uppercase tracking-wider opacity-60">Headers</p>
                      <button id="add-header-btn" class="p-1.5 rounded-full border border-light-border dark:border-dark-border bg-light-bg/90 dark:bg-dark-bg/90 opacity-90 hover:opacity-100 hover:border-brand/60 transition-colors" aria-label="Add Header" title="Add Header">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14m-7-7h14"></path>
                        </svg>
                      </button>
                    </div>
                    <div id="header-inputs" class="space-y-2"></div>
                  </div>

                  <div id="request-body-section">
                    <div class="flex items-center justify-between mb-2">
                      <p class="text-xs font-semibold uppercase tracking-wider opacity-60">Request Body</p>
                    </div>
                    <div class="relative h-40 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg overflow-hidden">
                      <pre id="body-highlight" class="absolute inset-0 m-0 p-3 pr-11 text-xs font-mono leading-5 overflow-auto whitespace-pre-wrap break-words pointer-events-none"></pre>
                      <textarea id="body-input" class="absolute inset-0 w-full h-full p-3 pr-11 text-xs font-mono leading-5 bg-transparent text-transparent caret-black dark:caret-white resize-none focus:outline-none overflow-auto placeholder:text-light-text/50 dark:placeholder:text-dark-text/40" placeholder='{"key":"value"}' spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
                      <button id="expand-body-btn" class="absolute bottom-2 right-2 p-1.5 rounded-full border border-light-border dark:border-dark-border bg-light-surface/95 dark:bg-dark-surface/95 opacity-90 hover:opacity-100 hover:border-brand/60 transition-colors" aria-label="Expand Request Body" title="Expand Request Body">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"></path>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div id="response-section">
                    <div class="flex items-center justify-between mb-2">
                      <p class="text-xs font-semibold uppercase tracking-wider opacity-60">Response</p>
                    </div>
                    <div class="relative">
                      <pre id="result" class="p-3 pr-11 text-xs font-mono rounded border border-light-border dark:border-dark-border overflow-x-auto min-h-[140px]"></pre>
                      <button id="expand-response-btn" class="absolute bottom-2 right-2 p-1.5 rounded-full border border-light-border dark:border-dark-border bg-light-surface/95 dark:bg-dark-surface/95 opacity-90 hover:opacity-100 hover:border-brand/60 transition-colors" aria-label="Expand Response" title="Expand Response">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 9V4h5M20 15v5h-5M15 4h5v5M9 20H4v-5"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <div id="expand-modal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4">
    <div class="w-full max-w-5xl rounded-lg border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface p-4">
      <div class="flex items-center justify-between mb-3">
        <h3 id="expand-modal-title" class="text-sm font-semibold">Expanded View</h3>
        <div class="flex items-center gap-2">
          <button id="expand-apply" class="hidden text-sm px-3 py-1.5 rounded bg-brand text-white font-semibold hover:bg-brand-deep transition-colors">Apply</button>
          <button id="expand-close" class="p-1.5 rounded-full border border-light-border dark:border-dark-border bg-light-bg/90 dark:bg-dark-bg/90 opacity-90 hover:opacity-100 hover:border-brand/60 transition-colors" aria-label="Close Modal" title="Close Modal">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      <div id="expand-editor-shell" class="hidden relative w-full h-[70vh] rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg overflow-hidden">
        <pre id="expand-editor-highlight" class="absolute inset-0 m-0 p-3 text-sm font-mono leading-6 overflow-auto whitespace-pre-wrap break-words pointer-events-none"></pre>
        <textarea id="expand-editor" class="absolute inset-0 w-full h-full p-3 text-sm font-mono leading-6 bg-transparent text-transparent caret-black dark:caret-white resize-none focus:outline-none overflow-auto" spellcheck="false" autocapitalize="off" autocorrect="off"></textarea>
      </div>
      <pre id="expand-viewer" class="hidden w-full h-[70vh] text-sm p-3 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg overflow-auto font-mono"></pre>
    </div>
  </div>
  <div id="param-value-tooltip" aria-hidden="true" role="tooltip">
    <p id="param-tooltip-line"></p>
    <p id="param-tooltip-description" class="hidden"></p>
  </div>

  <script>
    const spec = ${specJson};
    const openapiPath = ${openapiPathJson};
    const methodBadgeDefault = "bg-black/5 text-light-text/80 dark:bg-white/10 dark:text-dark-text/80";
    const methodBadge = {
      GET: "bg-brand-soft text-brand-deep dark:bg-brand/20 dark:text-brand",
      POST: "bg-brand-soft text-brand-deep dark:bg-brand/20 dark:text-brand",
      PUT: "bg-brand-soft text-brand-deep dark:bg-brand/20 dark:text-brand",
      PATCH: "bg-brand-soft text-brand-deep dark:bg-brand/20 dark:text-brand",
      DELETE: "bg-brand-soft text-brand-deep dark:bg-brand/20 dark:text-brand",
    };

    function getOperations() {
      const httpMethods = new Set([
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "head",
        "options",
      ]);

      const humanizePath = (path) =>
        path
          .replace(/^\\/+/, "")
          .replace(/[{}]/g, "")
          .replace(/[\\/_]+/g, " ")
          .trim() || "root";

      const toTitleCase = (value) =>
        value.replace(/\\w\\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));

      const getDisplayName = (op, method, path) => {
        if (typeof op.summary === "string" && op.summary.trim()) {
          return op.summary.trim();
        }

        if (typeof op.operationId === "string" && op.operationId.trim()) {
          const withoutPrefix = op.operationId.replace(
            new RegExp("^" + method + "_+", "i"),
            "",
          );
          const readable = withoutPrefix.replace(/_+/g, " ").trim();
          if (readable) return toTitleCase(readable);
        }

        return toTitleCase(humanizePath(path));
      };

      const ops = [];
      const paths = spec.paths || {};
      for (const path of Object.keys(paths)) {
        const methods = paths[path] || {};
        for (const method of Object.keys(methods)) {
          if (!httpMethods.has(method)) continue;
          const op = methods[method];
          ops.push({
            path,
            method: method.toUpperCase(),
            operation: op,
            tag: (op.tags && op.tags[0]) || "default",
            name: getDisplayName(op, method, path),
          });
        }
      }
      return ops;
    }

    const AUTH_STATE_KEY = "vector-docs-auth-v1";
    const AUTH_SELECTION_KEY = "vector-docs-auth-selection-v1";
    const HEADERS_STATE_KEY = "vector-docs-headers-v1";

    function loadSavedHeaders() {
      try {
        const raw = localStorage.getItem(HEADERS_STATE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
      return [{ key: "", value: "" }];
    }

    function saveHeaders() {
      try { localStorage.setItem(HEADERS_STATE_KEY, JSON.stringify(requestHeaders)); } catch {}
    }

    function loadAuthState() {
      try {
        const raw = localStorage.getItem(AUTH_STATE_KEY);
        if (raw) return JSON.parse(raw);
      } catch {}
      return {};
    }

    function saveAuthState() {
      try { localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(authState)); } catch {}
    }

    function loadAuthSelectionState() {
      try {
        const raw = localStorage.getItem(AUTH_SELECTION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch {}
      return {};
    }

    function saveAuthSelectionState() {
      try { localStorage.setItem(AUTH_SELECTION_KEY, JSON.stringify(authSelectionState)); } catch {}
    }

    const authSchemes = (spec.components && spec.components.securitySchemes) || {};
    let authState = loadAuthState();
    let authSelectionState = loadAuthSelectionState();

    const operations = getOperations();
    let selected = operations[0] || null;
    const operationParamValues = new Map();
    const operationBodyDrafts = new Map();
    const requestHeaders = loadSavedHeaders();
    let expandModalMode = null;
    let isMobileSidebarOpen = false;
    let sidebarSearchQuery = "";
    const paramTooltipRoot = document.getElementById("param-value-tooltip");
    const paramTooltipLine = document.getElementById("param-tooltip-line");
    const paramTooltipDescription = document.getElementById("param-tooltip-description");
    let activeParamTooltipTrigger = null;
    let paramTooltipHideTimer = null;

    function setMobileSidebarOpen(open) {
      const sidebar = document.getElementById("docs-sidebar");
      const backdrop = document.getElementById("mobile-backdrop");
      const openBtn = document.getElementById("sidebar-open");
      if (!sidebar || !backdrop || !openBtn) return;

      isMobileSidebarOpen = open;
      sidebar.classList.toggle("-translate-x-full", !open);
      backdrop.classList.toggle("opacity-0", !open);
      backdrop.classList.toggle("pointer-events-none", !open);
      openBtn.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.classList.toggle("overflow-hidden", open);
    }

    function getOperationKey(op) {
      return op.method + " " + op.path;
    }

    function getOpHash(op) {
      var tag = op.tag || "default";
      var id = (op.operation && op.operation.operationId)
        ? op.operation.operationId
        : op.method.toLowerCase() + "_" + op.path.split("/").filter(Boolean).join("_").replace(/[{}]/g, "");
      return "#/" + encodeURIComponent(tag) + "/" + encodeURIComponent(id);
    }

    function findOpByHash(hash) {
      if (!hash || hash.length <= 1) return null;
      var parts = hash.slice(1).split("/").filter(Boolean);
      if (parts.length < 2) return null;
      var hashTag = decodeURIComponent(parts[0]);
      var hashId = decodeURIComponent(parts[1]);
      return operations.find(function(op) {
        if (op.tag !== hashTag) return false;
        var id = (op.operation && op.operation.operationId)
          ? op.operation.operationId
          : op.method.toLowerCase() + "_" + op.path.split("/").filter(Boolean).join("_").replace(/[{}]/g, "");
        return id === hashId;
      }) || null;
    }

    function getOperationParameterGroups(op) {
      const params =
        op &&
        op.operation &&
        Array.isArray(op.operation.parameters)
          ? op.operation.parameters
          : [];

      return {
        all: params,
        path: params.filter((p) => p.in === "path"),
        query: params.filter((p) => p.in === "query"),
        headers: params.filter((p) => p.in === "header"),
      };
    }

    function getParameterValues(op) {
      const key = getOperationKey(op);
      if (!operationParamValues.has(key)) {
        operationParamValues.set(key, {});
      }
      return operationParamValues.get(key);
    }

    function getBodyDraft(op) {
      const key = getOperationKey(op);
      return operationBodyDrafts.get(key);
    }

    function setBodyDraft(op, bodyValue) {
      const key = getOperationKey(op);
      operationBodyDrafts.set(key, bodyValue);
    }

    function resolvePath(pathTemplate, pathParams, values) {
      let resolved = pathTemplate;
      for (const param of pathParams) {
        const rawValue = values[param.name];
        if (rawValue === undefined || rawValue === null || rawValue === "") {
          continue;
        }
        const placeholder = "{" + param.name + "}";
        resolved = resolved
          .split(placeholder)
          .join(encodeURIComponent(String(rawValue)));
      }
      return resolved;
    }

    function buildRequestPath(op, pathParams, queryParams, values, extraQuery) {
      const resolvedPath = resolvePath(op.path, pathParams, values);
      const query = new URLSearchParams();

      for (const param of queryParams) {
        const rawValue = values[param.name];
        if (rawValue === undefined || rawValue === null || rawValue === "") {
          continue;
        }
        query.append(param.name, String(rawValue));
      }

      if (extraQuery) {
        for (const key of Object.keys(extraQuery)) {
          const val = extraQuery[key];
          if (val) query.set(key, String(val));
        }
      }

      const queryString = query.toString();
      return queryString ? resolvedPath + "?" + queryString : resolvedPath;
    }

    function schemaDefaultValue(schema) {
      if (!schema || typeof schema !== "object") return null;
      if (schema.default !== undefined) return schema.default;
      if (schema.example !== undefined) return schema.example;
      if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
      if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
        return schemaDefaultValue(schema.oneOf[0]);
      }
      if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
        return schemaDefaultValue(schema.anyOf[0]);
      }
      if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
        return schemaDefaultValue(schema.allOf[0]);
      }

      switch (schema.type) {
        case "string":
          return "";
        case "number":
        case "integer":
          return 0;
        case "boolean":
          return false;
        case "array":
          return [];
        case "object": {
          const required = Array.isArray(schema.required) ? schema.required : [];
          const properties = schema.properties && typeof schema.properties === "object"
            ? schema.properties
            : {};
          const obj = {};
          for (const fieldName of required) {
            obj[fieldName] = schemaDefaultValue(properties[fieldName]);
          }
          return obj;
        }
        default:
          return null;
      }
    }

    function buildRequiredBodyPrefill(schema) {
      if (!schema || typeof schema !== "object") return "";
      const prefillValue = schemaDefaultValue(schema);
      if (
        prefillValue &&
        typeof prefillValue === "object" &&
        !Array.isArray(prefillValue) &&
        Object.keys(prefillValue).length === 0
      ) {
        return "";
      }
      try {
        return JSON.stringify(prefillValue, null, 2);
      } catch {
        return "";
      }
    }

    function hasMeaningfulRequestBodySchema(schema) {
      if (!schema || typeof schema !== "object") return false;
      if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return true;
      if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return true;
      if (Array.isArray(schema.allOf) && schema.allOf.length > 0) return true;
      if (schema.type && schema.type !== "object") return true;
      if (schema.additionalProperties !== undefined) return true;
      if (Array.isArray(schema.required) && schema.required.length > 0) return true;
      if (schema.properties && typeof schema.properties === "object") {
        return Object.keys(schema.properties).length > 0;
      }
      return false;
    }

    function renderSidebar() {
      const nav = document.getElementById("sidebar-nav");
      const groups = new Map();
      const query = sidebarSearchQuery.trim().toLowerCase();
      const visibleOps = query
        ? operations.filter((op) => {
            const haystack = [
              op.name,
              op.path,
              op.method,
              op.tag,
            ]
              .join(" ")
              .toLowerCase();
            return haystack.includes(query);
          })
        : operations;

      for (const op of visibleOps) {
        if (!groups.has(op.tag)) groups.set(op.tag, []);
        groups.get(op.tag).push(op);
      }
      nav.innerHTML = "";
      if (visibleOps.length === 0) {
        nav.innerHTML =
          '<p class="px-2 text-xs opacity-60">No routes match your search.</p>';
        return;
      }
      for (const [tag, ops] of groups.entries()) {
        ops.sort((a, b) => {
          const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          if (byName !== 0) return byName;

          const byPath = a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
          if (byPath !== 0) return byPath;

          return a.method.localeCompare(b.method, undefined, { sensitivity: "base" });
        });

        const block = document.createElement("div");
        block.innerHTML = '<h3 class="px-2 mb-2 font-semibold text-xs uppercase tracking-wider opacity-50"></h3><ul class="space-y-0.5"></ul>';
        block.querySelector("h3").textContent = tag;
        const list = block.querySelector("ul");
        for (const op of ops) {
          const li = document.createElement("li");
          li.className = "enter-stagger";
          li.style.setProperty("--stagger-delay", String(Math.min(list.children.length * 22, 180)) + "ms");
          const a = document.createElement("a");
          a.href = "#";
          a.className = op === selected
            ? "block px-2 py-1.5 rounded-md bg-brand-soft/70 dark:bg-brand/20 text-brand-deep dark:text-brand font-medium transition-colors"
            : "block px-2 py-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/5 transition-colors";

          const row = document.createElement("span");
          row.className = "flex items-center gap-2";

          const method = document.createElement("span");
          method.className = "px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold " + (methodBadge[op.method] || methodBadgeDefault);
          method.textContent = op.method;

          const name = document.createElement("span");
          name.textContent = op.name;
          if (op.operation && op.operation.deprecated) {
            name.style.textDecoration = "line-through";
            name.style.opacity = "0.5";
          }

          row.appendChild(method);
          row.appendChild(name);
          if (op.operation && op.operation.deprecated) {
            const badge = document.createElement("span");
            badge.className = "text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-500 font-semibold shrink-0";
            badge.textContent = "deprecated";
            row.appendChild(badge);
          }
          a.appendChild(row);

          a.onclick = (e) => {
            e.preventDefault();
            selected = op;
            history.pushState(null, "", getOpHash(op));
            renderSidebar();
            renderEndpoint();
            if (window.innerWidth < 768) {
              setMobileSidebarOpen(false);
            }
          };
          li.appendChild(a);
          list.appendChild(li);
        }
        nav.appendChild(block);
      }
    }

    function hideParamTooltip() {
      if (!paramTooltipRoot) return;
      if (paramTooltipHideTimer) {
        window.clearTimeout(paramTooltipHideTimer);
        paramTooltipHideTimer = null;
      }
      paramTooltipRoot.classList.remove("is-visible");
      paramTooltipRoot.setAttribute("aria-hidden", "true");
      if (activeParamTooltipTrigger) {
        activeParamTooltipTrigger.setAttribute("aria-expanded", "false");
      }
      activeParamTooltipTrigger = null;
    }

    function scheduleParamTooltipHide() {
      if (paramTooltipHideTimer) {
        window.clearTimeout(paramTooltipHideTimer);
      }
      paramTooltipHideTimer = window.setTimeout(() => {
        hideParamTooltip();
      }, 95);
    }

    function positionParamTooltip(trigger) {
      if (!paramTooltipRoot || !trigger) return;
      const viewportPadding = 8;
      const spacing = 10;
      const triggerRect = trigger.getBoundingClientRect();
      const tooltipRect = paramTooltipRoot.getBoundingClientRect();
      let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - tooltipRect.width - viewportPadding));
      let top = triggerRect.top - tooltipRect.height - spacing;
      if (top < viewportPadding) {
        top = triggerRect.bottom + spacing;
      }
      if (top + tooltipRect.height > window.innerHeight - viewportPadding) {
        top = window.innerHeight - tooltipRect.height - viewportPadding;
      }
      paramTooltipRoot.style.left = Math.round(left) + "px";
      paramTooltipRoot.style.top = Math.round(top) + "px";
    }

    function showParamTooltip(trigger) {
      if (
        !paramTooltipRoot ||
        !paramTooltipLine ||
        !paramTooltipDescription ||
        !trigger
      ) {
        return;
      }
      if (paramTooltipHideTimer) {
        window.clearTimeout(paramTooltipHideTimer);
        paramTooltipHideTimer = null;
      }
      const label = trigger.getAttribute("data-param-tooltip-label") || "Value";
      const value = trigger.getAttribute("data-param-tooltip-value") || "";
      const related = trigger.getAttribute("data-param-tooltip-related") || "";
      const description = trigger.getAttribute("data-param-tooltip-description") || "";
      if (activeParamTooltipTrigger && activeParamTooltipTrigger !== trigger) {
        activeParamTooltipTrigger.setAttribute("aria-expanded", "false");
      }
      activeParamTooltipTrigger = trigger;
      activeParamTooltipTrigger.setAttribute("aria-expanded", "true");
      const pathLabel = related ? " | path: " + related : "";
      paramTooltipLine.textContent = label + ": " + value + pathLabel;
      if (description.trim()) {
        paramTooltipDescription.textContent = description;
        paramTooltipDescription.classList.remove("hidden");
      } else {
        paramTooltipDescription.textContent = "";
        paramTooltipDescription.classList.add("hidden");
      }
      paramTooltipRoot.classList.add("is-visible");
      paramTooltipRoot.setAttribute("aria-hidden", "false");
      positionParamTooltip(trigger);
    }

    function registerParamTooltipTargets(scope) {
      if (!scope) return;
      const targets = scope.querySelectorAll("[data-param-tooltip-value]");
      for (const target of targets) {
        target.addEventListener("click", (event) => {
          event.preventDefault();
          if (
            activeParamTooltipTrigger === target &&
            paramTooltipRoot &&
            paramTooltipRoot.classList.contains("is-visible")
          ) {
            hideParamTooltip();
            return;
          }
          showParamTooltip(target);
        });
        target.addEventListener("mouseenter", () => {
          showParamTooltip(target);
        });
        target.addEventListener("mouseleave", (event) => {
          const related = event.relatedTarget;
          if (paramTooltipRoot && related && paramTooltipRoot.contains(related)) return;
          scheduleParamTooltipHide();
        });
        target.addEventListener("focus", () => {
          showParamTooltip(target);
        });
        target.addEventListener("blur", (event) => {
          const related = event.relatedTarget;
          if (paramTooltipRoot && related && paramTooltipRoot.contains(related)) return;
          scheduleParamTooltipHide();
        });
      }
    }

    function renderParamSection(title, params) {
      if (!params.length) return "";
      let rows = "";
      for (const p of params) {
        const schema = resolveSchemaRef(p.schema || {});
        const typeRaw = getSchemaTypeLabel(schema);
        const type = escapeHtml(typeRaw);
        const nameRaw = p.name || "";
        const name = escapeHtml(nameRaw);
        const tooltipName = escapeHtmlAttribute(nameRaw);
        const tooltipType = escapeHtmlAttribute(typeRaw);
        const tooltipDescription = (typeof p.description === "string" && p.description.trim())
          ? escapeHtmlAttribute(p.description.trim())
          : (typeof schema.description === "string" && schema.description.trim())
            ? escapeHtmlAttribute(schema.description.trim())
            : "";
        const desc = (typeof p.description === "string" && p.description.trim())
          ? '<p class="text-xs opacity-60 mt-0.5 leading-snug">' + renderMarkdown(p.description.trim()) + '</p>'
          : "";
        const extra = buildSchemaExtra(schema);
        rows +=
          '<div class="param-row py-2 border-b border-light-border/50 dark:border-dark-border/50">' +
          '<div class="param-row-head">' +
          '<div class="param-row-main">' +
          '<button type="button" class="param-tooltip-trigger param-name-trigger" data-param-tooltip-label="Parameter" data-param-tooltip-value="' +
          tooltipName +
          '" data-param-tooltip-description="' +
          tooltipDescription +
          '" aria-expanded="false">' +
          '<code class="text-sm font-mono param-name-text">' +
          name +
          "</code></button>" +
          '<span class="text-xs text-brand shrink-0">' +
          (p.required ? "required" : "optional") +
          "</span></div>" +
          '<button type="button" class="param-tooltip-trigger param-type-fade text-xs font-mono opacity-60" data-param-tooltip-label="Type" data-param-tooltip-value="' +
          tooltipType +
          '" data-param-tooltip-description="' +
          tooltipDescription +
          '" aria-expanded="false">' +
          type +
          "</button></div>" +
          desc +
          extra +
          "</div>";
      }
      return '<div><h3 class="text-sm font-semibold mb-3 flex items-center border-b border-light-border dark:border-dark-border pb-2">' + escapeHtml(title) + "</h3>" + rows + "</div>";
    }

    function getSchemaTypeLabel(schema) {
      const resolved = resolveSchemaRef(schema);
      if (!resolved || typeof resolved !== "object") return "unknown";
      if (Array.isArray(resolved.type)) return resolved.type.join(" | ");
      if (resolved.type) return String(resolved.type);
      if (resolved.properties) return "object";
      if (resolved.items) return "array";
      if (Array.isArray(resolved.oneOf)) return "oneOf";
      if (Array.isArray(resolved.anyOf)) return "anyOf";
      if (Array.isArray(resolved.allOf)) return "allOf";
      return "unknown";
    }

    function buildSchemaExtra(schema) {
      const resolved = resolveSchemaRef(schema);
      if (!resolved || typeof resolved !== "object") return "";
      const chips = [];
      if (resolved.format) chips.push(escapeHtml(String(resolved.format)));
      if (Array.isArray(resolved.enum) && resolved.enum.length > 0) {
        const shown = resolved.enum.slice(0, 5).map(function(v) { return escapeHtml(JSON.stringify(v)); });
        chips.push(shown.join(" | ") + (resolved.enum.length > 5 ? " …" : ""));
      }
      if (resolved.minimum !== undefined) chips.push("min: " + resolved.minimum);
      if (resolved.maximum !== undefined) chips.push("max: " + resolved.maximum);
      if (typeof resolved.exclusiveMinimum === "number") chips.push("&gt;" + resolved.exclusiveMinimum);
      if (typeof resolved.exclusiveMaximum === "number") chips.push("&lt;" + resolved.exclusiveMaximum);
      if (resolved.minLength !== undefined) chips.push("minLen: " + resolved.minLength);
      if (resolved.maxLength !== undefined) chips.push("maxLen: " + resolved.maxLength);
      if (resolved.minItems !== undefined) chips.push("minItems: " + resolved.minItems);
      if (resolved.maxItems !== undefined) chips.push("maxItems: " + resolved.maxItems);
      if (resolved.uniqueItems) chips.push("unique");
      if (resolved.pattern) chips.push("/" + escapeHtml(String(resolved.pattern)) + "/");
      if (!chips.length) return "";
      return '<div class="flex flex-wrap gap-1 mt-1.5">' +
        chips.map(function(c) {
          return '<span class="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 font-mono opacity-80">' + c + '</span>';
        }).join("") +
        '</div>';
    }

    function resolveSchemaRef(schema, visitedRefs) {
      if (!schema || typeof schema !== "object") return schema;
      const ref = typeof schema.$ref === "string" ? schema.$ref : "";
      if (!ref || !ref.startsWith("#/components/schemas/")) {
        return schema;
      }

      const seen = visitedRefs || new Set();
      if (seen.has(ref)) return schema;
      seen.add(ref);

      const parts = ref.split("/");
      const schemaName = parts[parts.length - 1];
      const referenced = spec && spec.components && spec.components.schemas && spec.components.schemas[schemaName];
      if (!referenced || typeof referenced !== "object") return schema;

      const merged = Object.assign({}, referenced, schema);
      delete merged.$ref;
      return resolveSchemaRef(merged, seen);
    }

    function buildSchemaChildren(schema) {
      const resolved = resolveSchemaRef(schema);
      if (!resolved || typeof resolved !== "object") return [];

      const children = [];

      if (resolved.properties && typeof resolved.properties === "object") {
        const requiredSet = new Set(
          Array.isArray(resolved.required) ? resolved.required : [],
        );
        for (const [name, childSchema] of Object.entries(resolved.properties)) {
          const childDef = childSchema || {};
          const isArrayType = Array.isArray(childDef.type)
            ? childDef.type.includes("array")
            : childDef.type === "array";
          const isArrayLike = isArrayType || childDef.items !== undefined;
          children.push({
            name: isArrayLike ? (name + "[]") : name,
            schema: childDef,
            required: requiredSet.has(name),
          });
        }
      }

      if (resolved.items) {
        children.push({
          name: getArrayItemNodeName(resolved.items),
          schema: resolved.items,
          required: true,
        });
      }

      return children;
    }

    function getArrayItemNodeName(itemSchema) {
      if (!itemSchema || typeof itemSchema !== "object") return "item";
      const title =
        typeof itemSchema.title === "string" && itemSchema.title.trim()
          ? itemSchema.title.trim()
          : "";
      if (title) return title;

      const ref =
        typeof itemSchema.$ref === "string" && itemSchema.$ref.trim()
          ? itemSchema.$ref.trim()
          : "";
      if (ref) {
        const parts = ref.split("/").filter(Boolean);
        const last = parts[parts.length - 1];
        if (last) return last;
      }

      const typeLabel = getSchemaTypeLabel(itemSchema);
      if (typeLabel && typeLabel !== "unknown") return typeLabel;
      return "type";
    }

    function renderSchemaFieldNode(field, depth, parentPath) {
      const schema = resolveSchemaRef(field.schema || {});
      const nameRaw = field.name || "field";
      const name = escapeHtml(nameRaw);
      const requiredLabel = field.required ? "required" : "optional";
      const typeRaw = getSchemaTypeLabel(schema);
      const type = escapeHtml(typeRaw);
      const tooltipName = escapeHtmlAttribute(nameRaw);
      const tooltipType = escapeHtmlAttribute(typeRaw);
      const fieldPath = parentPath ? (parentPath + "." + nameRaw) : nameRaw;
      const tooltipPath = escapeHtmlAttribute(fieldPath);
      const tooltipDescription = (typeof schema.description === "string" && schema.description.trim())
        ? escapeHtmlAttribute(schema.description.trim())
        : "";
      const children = buildSchemaChildren(schema);
      const padding = depth * 14;
      const extra = buildSchemaExtra(schema);

      if (!children.length) {
        return (
          '<div class="param-row py-2 border-b border-light-border/50 dark:border-dark-border/50" style="padding-left:' +
          padding +
          'px"><div class="param-row-head"><div class="param-row-main">' +
          '<button type="button" class="param-tooltip-trigger param-name-trigger" data-param-tooltip-label="Field" data-param-tooltip-value="' +
          tooltipName +
          '" data-param-tooltip-related="' +
          tooltipPath +
          '" data-param-tooltip-description="' +
          tooltipDescription +
          '" aria-expanded="false"><code class="text-sm font-mono param-name-text">' +
          name +
          '</code></button><span class="text-xs text-brand shrink-0">' +
          requiredLabel +
          '</span></div><button type="button" class="param-tooltip-trigger param-type-fade text-xs font-mono opacity-60" data-param-tooltip-label="Type" data-param-tooltip-value="' +
          tooltipType +
          '" data-param-tooltip-description="' +
          tooltipDescription +
          '" aria-expanded="false">' +
          type +
          "</button></div>" + extra + "</div>"
        );
      }

      let nested = "";
      for (const child of children) {
        nested += renderSchemaFieldNode(child, depth + 1, fieldPath);
      }

      return (
        '<details open>' +
        '<summary class="list-none cursor-pointer py-2 border-b border-light-border/50 dark:border-dark-border/50" style="padding-left:' +
        padding +
        'px"><div class="param-row-head"><div class="param-row-main"><span class="text-xs opacity-70 shrink-0">▾</span>' +
        '<button type="button" class="param-tooltip-trigger param-name-trigger" data-param-tooltip-label="Field" data-param-tooltip-value="' +
        tooltipName +
        '" data-param-tooltip-related="' +
        tooltipPath +
        '" data-param-tooltip-description="' +
        tooltipDescription +
        '" aria-expanded="false"><code class="text-sm font-mono param-name-text">' +
        name +
        '</code></button><span class="text-xs text-brand shrink-0">' +
        requiredLabel +
        '</span></div><button type="button" class="param-tooltip-trigger param-type-fade text-xs font-mono opacity-60" data-param-tooltip-label="Type" data-param-tooltip-value="' +
        tooltipType +
        '" data-param-tooltip-description="' +
        tooltipDescription +
        '" aria-expanded="false">' +
        type +
        "</button></div>" + extra + "</summary>" +
        "<div>" +
        nested +
        "</div></details>"
      );
    }

    function renderRequestBodySchemaSection(schema) {
      if (!schema || typeof schema !== "object") return "";
      const rootChildren = buildSchemaChildren(schema);
      if (!rootChildren.length) return "";

      let rows = "";
      for (const child of rootChildren) {
        rows += renderSchemaFieldNode(child, 0, "");
      }

      return (
        '<div><h3 class="text-sm font-semibold mb-3 flex items-center border-b border-light-border dark:border-dark-border pb-2">Request Body</h3>' +
        rows +
        "</div>"
      );
    }

    function renderResponseSchemasSection(responses) {
      if (!responses || typeof responses !== "object") return "";

      const statusCodes = Object.keys(responses).sort((a, b) => {
        const aNum = Number(a);
        const bNum = Number(b);
        if (Number.isInteger(aNum) && Number.isInteger(bNum)) return aNum - bNum;
        if (Number.isInteger(aNum)) return -1;
        if (Number.isInteger(bNum)) return 1;
        return a.localeCompare(b);
      });

      let sections = "";
      for (const statusCode of statusCodes) {
        const responseDef = responses[statusCode];
        if (!responseDef || typeof responseDef !== "object") continue;

        const responseDesc = (typeof responseDef.description === "string" && responseDef.description.trim())
          ? responseDef.description.trim()
          : "";

        const jsonSchema =
          responseDef.content &&
          responseDef.content["application/json"] &&
          responseDef.content["application/json"].schema;

        let rows = "";
        if (jsonSchema && typeof jsonSchema === "object") {
          const rootChildren = buildSchemaChildren(jsonSchema);
          for (const child of rootChildren) {
            rows += renderSchemaFieldNode(child, 0, "");
          }
        }

        if (!responseDesc && !rows) continue;

        const descHtml = responseDesc
          ? ' <span class="normal-case font-sans opacity-70 ml-1">— ' + escapeHtml(responseDesc) + '</span>'
          : "";
        const contentHtml = rows || '<p class="text-xs opacity-60 mt-1">No schema fields</p>';

        sections +=
          '<details class="mb-4">' +
          '<summary class="list-none cursor-pointer">' +
          '<h4 class="text-xs font-mono uppercase tracking-wider opacity-70 mb-2">Status ' +
          escapeHtml(statusCode) +
          descHtml +
          "</h4>" +
          "</summary>" +
          contentHtml +
          "</details>";
      }

      if (!sections) return "";

      return (
        '<div><h3 class="text-sm font-semibold mb-3 flex items-center border-b border-light-border dark:border-dark-border pb-2">Response Schemas</h3>' +
        sections +
        "</div>"
      );
    }

    function renderTryItParameterInputs(pathParams, queryParams) {
      const container = document.getElementById("request-param-inputs");
      if (!container || !selected) return;

      const values = getParameterValues(selected);
      container.innerHTML = "";

      const sections = [
        { title: "Path Values", params: pathParams },
        { title: "Query Values", params: queryParams },
      ];

      for (const section of sections) {
        if (!section.params.length) continue;

        const group = document.createElement("div");
        group.className = "space-y-2";

        const title = document.createElement("p");
        title.className = "text-xs font-semibold uppercase tracking-wider opacity-60";
        title.textContent = section.title;
        group.appendChild(title);

        for (const param of section.params) {
          const field = document.createElement("div");
          field.className = "space-y-1";

          const label = document.createElement("label");
          label.className = "text-xs opacity-80 flex items-center gap-2";

          const labelName = document.createElement("span");
          labelName.className = "font-mono";
          labelName.textContent = param.name;

          const required = document.createElement("span");
          required.className = "text-[10px] text-brand";
          required.textContent = param.required ? "required" : "optional";

          label.appendChild(labelName);
          label.appendChild(required);

          const input = document.createElement("input");
          input.type = "text";
          input.value = values[param.name] || "";
          input.placeholder =
            section.title === "Path Values" ? param.name : "optional";
          input.className =
            "w-full text-sm px-3 py-2 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg focus:outline-none focus:border-brand dark:focus:border-brand transition-colors font-mono";

          input.addEventListener("input", () => {
            values[param.name] = input.value;
            updateRequestPreview();
          });

          field.appendChild(label);
          field.appendChild(input);
          group.appendChild(field);
        }

        container.appendChild(group);
      }
    }

    function renderHeaderInputs() {
      const container = document.getElementById("header-inputs");
      if (!container) return;

      container.innerHTML = "";
      requestHeaders.forEach((entry, index) => {
        const row = document.createElement("div");
        row.className = "grid grid-cols-[1fr_1fr_auto] gap-2";

        const keyInput = document.createElement("input");
        keyInput.type = "text";
        keyInput.value = entry.key || "";
        keyInput.placeholder = "Header";
        keyInput.className =
          "w-full text-xs px-2.5 py-2 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg focus:outline-none focus:border-brand dark:focus:border-brand transition-colors font-mono";
        keyInput.addEventListener("input", () => {
          entry.key = keyInput.value;
          saveHeaders();
          updateRequestPreview();
        });

        const valueInput = document.createElement("input");
        valueInput.type = "text";
        valueInput.value = entry.value || "";
        valueInput.placeholder =
          String(entry.key || "").toLowerCase() === "authorization"
            ? "Bearer token"
            : "Value";
        valueInput.className =
          "w-full text-xs px-2.5 py-2 rounded border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg focus:outline-none focus:border-brand dark:focus:border-brand transition-colors font-mono";
        valueInput.addEventListener("input", () => {
          entry.value = valueInput.value;
          saveHeaders();
          updateRequestPreview();
        });

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className =
          "p-1.5 rounded-full border border-light-border dark:border-dark-border bg-light-bg/90 dark:bg-dark-bg/90 opacity-90 hover:opacity-100 hover:border-brand/60 transition-colors";
        removeButton.setAttribute("aria-label", "Remove Header");
        removeButton.setAttribute("title", "Remove Header");
        removeButton.innerHTML =
          '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 12h12"></path></svg>';
        removeButton.addEventListener("click", () => {
          requestHeaders.splice(index, 1);
          saveHeaders();
          renderHeaderInputs();
          updateRequestPreview();
        });

        row.appendChild(keyInput);
        row.appendChild(valueInput);
        row.appendChild(removeButton);
        container.appendChild(row);
      });
    }

    function hasHeaderName(headers, expectedName) {
      const target = expectedName.toLowerCase();
      return Object.keys(headers).some((key) => key.toLowerCase() === target);
    }

    function buildCookieHeaderValue(cookieValues) {
      const entries = Object.entries(cookieValues);
      if (!entries.length) return "";
      return entries
        .map(([name, value]) => String(name) + "=" + encodeURIComponent(String(value)))
        .join("; ");
    }

    function getRequestHeadersObject(op) {
      const auth = getAuthHeaders(op);
      const authCookies = getAuthCookieParams(op);
      if (Object.keys(authCookies).length > 0) {
        const cookieHeader = buildCookieHeaderValue(authCookies);
        if (cookieHeader) {
          auth["Cookie"] = cookieHeader;
        }
      }
      const manual = {};
      for (const entry of requestHeaders) {
        const key = String(entry.key || "").trim();
        const value = String(entry.value || "").trim();
        if (!key || !value) continue;
        manual[key] = value;
      }
      // Auth provides defaults; manual headers win on conflict
      return Object.assign({}, auth, manual);
    }

    function buildCurl(op, headers, body, requestPath) {
      const url = window.location.origin + requestPath;
      const lines = ['curl -X ' + op.method + ' "' + url + '"'];

      for (const [name, value] of Object.entries(headers)) {
        const safeName = String(name).replace(/"/g, '\\"');
        const safeValue = String(value).replace(/"/g, '\\"');
        lines.push('  -H "' + safeName + ": " + safeValue + '"');
      }

      if (body) {
        lines.push("  -d '" + body.replace(/'/g, "'\\\\''") + "'");
      }

      return lines.join(" \\\\\\n");
    }

    function formatBodyJsonInput() {
      const bodyInput = document.getElementById("body-input");
      if (!bodyInput) return;
      const current = bodyInput.value.trim();
      if (!current) return;
      try {
        bodyInput.value = JSON.stringify(JSON.parse(current), null, 2);
      } catch {}
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function escapeHtmlAttribute(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function renderMarkdown(text) {
      if (!text || typeof text !== "string") return "";
      var s = escapeHtml(text);
      // inline code — process first to protect content inside backticks
      s = s.replace(/\`([^\`\\n]+)\`/g, '<code class="text-xs font-mono bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">$1</code>');
      // bold **text**
      s = s.replace(/\\*\\*([^*\\n]+)\\*\\*/g, '<strong>$1</strong>');
      // italic *text*
      s = s.replace(/\\*([^*\\n]+)\\*/g, '<em>$1</em>');
      // links [text](url)
      s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, function(m, txt, url) {
        var lc = url.toLowerCase().replace(/\\s/g, "");
        if (lc.indexOf("javascript:") === 0 || lc.indexOf("data:") === 0 || lc.indexOf("vbscript:") === 0) return txt;
        return '<a href="' + url.replace(/"/g, '&quot;') + '" target="_blank" rel="noopener noreferrer" class="text-brand hover:underline">' + txt + '</a>';
      });
      return s;
    }

    function toPrettyJson(value) {
      const trimmed = (value || "").trim();
      if (!trimmed) return null;
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return null;
      }
    }

    function highlightJson(jsonText) {
      const escaped = escapeHtml(jsonText);
      return escaped.replace(
        /("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\btrue\\b|\\bfalse\\b|\\bnull\\b|-?\\d+(?:\\.\\d+)?(?:[eE][+\\-]?\\d+)?)/g,
        (match) => {
          let cls = "json-number";
          if (match.startsWith('"')) {
            cls = match.endsWith(":") ? "json-key" : "json-string";
          } else if (match === "true" || match === "false") {
            cls = "json-boolean";
          } else if (match === "null") {
            cls = "json-null";
          }
          return '<span class="' + cls + '">' + match + "</span>";
        },
      );
    }

    function updateBodyJsonPresentation() {
      const bodyInput = document.getElementById("body-input");
      const highlight = document.getElementById("body-highlight");
      const bodySection = document.getElementById("request-body-section");

      if (!bodyInput || !highlight || !bodySection) return;
      if (bodySection.classList.contains("hidden")) {
        highlight.innerHTML = "";
        return;
      }

      const raw = bodyInput.value || "";
      if (!raw.trim()) {
        const placeholder = bodyInput.getAttribute("placeholder") || "";
        highlight.innerHTML = '<span class="opacity-40">' + escapeHtml(placeholder) + "</span>";
        return;
      }

      const prettyJson = toPrettyJson(raw);
      if (!prettyJson) {
        highlight.innerHTML = escapeHtml(raw);
        return;
      }

      highlight.innerHTML = highlightJson(raw);
    }

    function syncBodyEditorScroll() {
      const bodyInput = document.getElementById("body-input");
      const highlight = document.getElementById("body-highlight");
      if (!bodyInput || !highlight) return;
      highlight.scrollTop = bodyInput.scrollTop;
      highlight.scrollLeft = bodyInput.scrollLeft;
    }

    function updateExpandEditorPresentation() {
      const editor = document.getElementById("expand-editor");
      const highlight = document.getElementById("expand-editor-highlight");
      if (!editor || !highlight) return;
      const raw = editor.value || "";
      if (!raw.trim()) {
        highlight.innerHTML = "";
        return;
      }
      const prettyJson = toPrettyJson(raw);
      highlight.innerHTML = prettyJson ? highlightJson(raw) : escapeHtml(raw);
    }

    function syncExpandEditorScroll() {
      const editor = document.getElementById("expand-editor");
      const highlight = document.getElementById("expand-editor-highlight");
      if (!editor || !highlight) return;
      highlight.scrollTop = editor.scrollTop;
      highlight.scrollLeft = editor.scrollLeft;
    }

    function formatResponseText(responseText) {
      const trimmed = (responseText || "").trim();
      if (!trimmed) return { text: "(empty)", isJson: false };
      try {
        return {
          text: JSON.stringify(JSON.parse(trimmed), null, 2),
          isJson: true,
        };
      } catch {
        return {
          text: responseText,
          isJson: false,
        };
      }
    }

    function setResponseContent(headerText, bodyText, isJson) {
      const result = document.getElementById("result");
      if (!result) return;
      const fullText = String(headerText || "") + String(bodyText || "");
      result.dataset.raw = fullText;
      result.dataset.header = String(headerText || "");
      result.dataset.body = String(bodyText || "");
      result.dataset.isJson = isJson ? "true" : "false";
      if (isJson) {
        result.innerHTML = escapeHtml(String(headerText || "")) + highlightJson(String(bodyText || ""));
      } else {
        result.textContent = fullText;
      }
    }

    function setSubmitLoading(isLoading) {
      const sendButton = document.getElementById("send-btn");
      const spinner = document.getElementById("send-btn-spinner");
      const label = document.getElementById("send-btn-label");
      if (!sendButton) return;

      sendButton.disabled = isLoading;
      sendButton.classList.toggle("opacity-80", isLoading);
      sendButton.classList.toggle("cursor-wait", isLoading);
      if (spinner) spinner.classList.toggle("hidden", !isLoading);
      if (label) label.textContent = isLoading ? "Sending..." : "Submit";
    }

    function updateRequestPreview() {
      if (!selected) return;

      const { path, query } = getOperationParameterGroups(selected);
      const values = getParameterValues(selected);
      const requestPath = buildRequestPath(selected, path, query, values, getAuthQueryParams(selected));
      const bodyInput = document.getElementById("body-input");
      const body = bodyInput ? bodyInput.value.trim() : "";
      const headers = getRequestHeadersObject(selected);
      if (body && !hasHeaderName(headers, "Content-Type")) {
        headers["Content-Type"] = "application/json";
      }

      document.getElementById("endpoint-path").textContent = requestPath;
      document.getElementById("curl-code").textContent = buildCurl(
        selected,
        headers,
        body,
        requestPath,
      );
    }

    function renderEndpoint() {
      if (!selected) return;
      const endpointCard = document.getElementById("endpoint-card");
      if (endpointCard) {
        endpointCard.classList.remove("enter-fade-up");
        // Restart CSS animation for each operation switch
        void endpointCard.offsetWidth;
        endpointCard.classList.add("enter-fade-up");
      }

      const op = selected.operation || {};
      const reqSchema = op.requestBody && op.requestBody.content && op.requestBody.content["application/json"] && op.requestBody.content["application/json"].schema;
      const requestBodySection = document.getElementById("request-body-section");
      const bodyInput = document.getElementById("body-input");
      const expandBodyBtn = document.getElementById("expand-body-btn");
      const supportsBody = hasMeaningfulRequestBodySchema(reqSchema);

      if (requestBodySection) {
        requestBodySection.classList.toggle("hidden", !supportsBody);
      }
      if (supportsBody && bodyInput) {
        const existingDraft = getBodyDraft(selected);
        if (typeof existingDraft === "string") {
          bodyInput.value = existingDraft;
        } else {
          const prefill = buildRequiredBodyPrefill(reqSchema);
          bodyInput.value = prefill;
          setBodyDraft(selected, prefill);
        }
      } else if (!supportsBody && bodyInput) {
        bodyInput.value = "";
      }
      if (expandBodyBtn) {
        expandBodyBtn.disabled = !supportsBody;
      }
      setResponseContent("", "", false);

      const deprecatedBanner = document.getElementById("deprecated-banner");
      if (deprecatedBanner) {
        deprecatedBanner.classList.toggle("hidden", !op.deprecated);
      }

      document.getElementById("tag-title").textContent = selected.tag;
      document.getElementById("tag-description").innerHTML = op.description ? renderMarkdown(op.description) : "Interactive API documentation.";
      const methodNode = document.getElementById("endpoint-method");
      methodNode.textContent = selected.method;
      methodNode.className = "px-2.5 py-0.5 rounded-full text-xs font-mono font-medium " + (methodBadge[selected.method] || methodBadgeDefault);
      document.getElementById("endpoint-title").textContent = selected.name;
      document.getElementById("endpoint-path").textContent = selected.path;

      const { all: params, query, path, headers } =
        getOperationParameterGroups(selected);

      let html = "";
      html += renderParamSection("Path Parameters", path);
      html += renderParamSection("Query Parameters", query);
      html += renderParamSection("Header Parameters", headers);

      html += renderRequestBodySchemaSection(reqSchema);
      html += renderResponseSchemasSection(op.responses);
      const paramsColumn = document.getElementById("params-column");
      if (paramsColumn) {
        hideParamTooltip();
        paramsColumn.innerHTML = html || '<div class="text-sm opacity-70">No parameters</div>';
        registerParamTooltipTargets(paramsColumn);
      }
      renderAuthPanel();
      renderTryItParameterInputs(path, query);
      renderHeaderInputs();
      updateRequestPreview();
      updateBodyJsonPresentation();
      syncBodyEditorScroll();
    }

    document.getElementById("copy-curl").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(document.getElementById("curl-code").textContent || ""); } catch {}
    });
    if (paramTooltipRoot) {
      paramTooltipRoot.addEventListener("mouseenter", () => {
        if (paramTooltipHideTimer) {
          window.clearTimeout(paramTooltipHideTimer);
          paramTooltipHideTimer = null;
        }
      });
      paramTooltipRoot.addEventListener("mouseleave", () => {
        scheduleParamTooltipHide();
      });
    }
    document.addEventListener("pointerdown", (event) => {
      if (!paramTooltipRoot) return;
      const target = event.target;
      if (target && paramTooltipRoot.contains(target)) return;
      if (target && target.closest && target.closest("[data-param-tooltip-value]")) return;
      hideParamTooltip();
    });
    document.getElementById("sidebar-search").addEventListener("input", (event) => {
      sidebarSearchQuery = event.currentTarget.value || "";
      renderSidebar();
    });

    document.getElementById("send-btn").addEventListener("click", async () => {
      if (!selected) return;
      const { path, query } = getOperationParameterGroups(selected);
      const values = getParameterValues(selected);
      const missingPathParams = path.filter((param) => {
        if (param.required === false) return false;
        const value = values[param.name];
        return value === undefined || value === null || String(value).trim() === "";
      });

      if (missingPathParams.length > 0) {
        setResponseContent(
          "",
          "Missing required path parameter(s): " +
            missingPathParams.map((param) => param.name).join(", "),
          false,
        );
        return;
      }

      const requestPath = buildRequestPath(selected, path, query, values, getAuthQueryParams(selected));
      formatBodyJsonInput();
      updateBodyJsonPresentation();
      const op = selected.operation || {};
      const reqSchema = op.requestBody && op.requestBody.content && op.requestBody.content["application/json"] && op.requestBody.content["application/json"].schema;
      const supportsBody = hasMeaningfulRequestBodySchema(reqSchema);
      const bodyInput = document.getElementById("body-input");
      const body =
        supportsBody && bodyInput ? bodyInput.value.trim() : "";
      const headers = getRequestHeadersObject(selected);
      if (body && !hasHeaderName(headers, "Content-Type")) {
        headers["Content-Type"] = "application/json";
      }

      setSubmitLoading(true);
      try {
        const requestStart = performance.now();
        applyAuthCookies(selected);
        const response = await fetch(requestPath, {
          method: selected.method,
          headers,
          body: body || undefined,
          credentials: "same-origin",
        });
        const text = await response.text();
        const responseTimeMs = Math.round(performance.now() - requestStart);
        const contentType = response.headers.get("content-type") || "unknown";
        const formattedResponse = formatResponseText(text);
        const headerText =
          "Status: " + response.status + " " + response.statusText + "\\n" +
          "Content-Type: " + contentType + "\\n" +
          "Response Time: " + responseTimeMs + " ms\\n\\n";
        setResponseContent(
          headerText,
          formattedResponse.text,
          formattedResponse.isJson,
        );
      } catch (error) {
        setResponseContent("", "Request failed: " + String(error), false);
      } finally {
        setSubmitLoading(false);
      }
    });

    function openExpandModal(mode) {
      const modal = document.getElementById("expand-modal");
      const title = document.getElementById("expand-modal-title");
      const editorShell = document.getElementById("expand-editor-shell");
      const editor = document.getElementById("expand-editor");
      const viewer = document.getElementById("expand-viewer");
      const apply = document.getElementById("expand-apply");
      const bodyInput = document.getElementById("body-input");
      const result = document.getElementById("result");
      if (!modal || !title || !editorShell || !editor || !viewer || !apply) return;

      expandModalMode = mode;
      modal.classList.remove("hidden");
      modal.classList.add("flex");

      if (mode === "body") {
        title.textContent = "Request Body";
        editorShell.classList.remove("hidden");
        viewer.classList.add("hidden");
        apply.classList.remove("hidden");
        editor.value = bodyInput ? bodyInput.value : "";
        updateExpandEditorPresentation();
        syncExpandEditorScroll();
      } else {
        title.textContent = "Response";
        viewer.classList.remove("hidden");
        editorShell.classList.add("hidden");
        apply.classList.add("hidden");
        const hasResponse = Boolean(result && result.dataset && result.dataset.raw);
        if (!hasResponse) {
          viewer.textContent = "(empty response yet)";
          return;
        }

        const header = result.dataset.header || "";
        const body = result.dataset.body || "";
        const isJson = result.dataset.isJson === "true";
        if (isJson) {
          viewer.innerHTML = escapeHtml(header) + highlightJson(body);
        } else {
          viewer.textContent = result.dataset.raw || "(empty response yet)";
        }
      }
    }

    function closeExpandModal() {
      const modal = document.getElementById("expand-modal");
      if (!modal) return;
      modal.classList.add("hidden");
      modal.classList.remove("flex");
      expandModalMode = null;
    }

    document.getElementById("add-header-btn").addEventListener("click", () => {
      requestHeaders.push({ key: "", value: "" });
      saveHeaders();
      renderHeaderInputs();
      updateRequestPreview();
    });
    document.getElementById("body-input").addEventListener("input", () => {
      if (selected) {
        setBodyDraft(selected, document.getElementById("body-input").value);
      }
      updateRequestPreview();
      updateBodyJsonPresentation();
      syncBodyEditorScroll();
    });
    document.getElementById("body-input").addEventListener("scroll", () => {
      syncBodyEditorScroll();
    });
    document.getElementById("body-input").addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      const input = event.currentTarget;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const value = input.value;
      const tab = "  ";
      input.value = value.slice(0, start) + tab + value.slice(end);
      input.selectionStart = input.selectionEnd = start + tab.length;
      if (selected) {
        setBodyDraft(selected, input.value);
      }
      updateRequestPreview();
      updateBodyJsonPresentation();
      syncBodyEditorScroll();
    });
    document.getElementById("body-input").addEventListener("blur", () => {
      formatBodyJsonInput();
      if (selected) {
        setBodyDraft(selected, document.getElementById("body-input").value);
      }
      updateRequestPreview();
      updateBodyJsonPresentation();
      syncBodyEditorScroll();
    });
    document.getElementById("expand-editor").addEventListener("input", () => {
      updateExpandEditorPresentation();
      syncExpandEditorScroll();
    });
    document.getElementById("expand-editor").addEventListener("scroll", () => {
      syncExpandEditorScroll();
    });
    document.getElementById("expand-editor").addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      event.preventDefault();
      const editor = event.currentTarget;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const value = editor.value;
      const tab = "  ";
      editor.value = value.slice(0, start) + tab + value.slice(end);
      editor.selectionStart = editor.selectionEnd = start + tab.length;
      updateExpandEditorPresentation();
      syncExpandEditorScroll();
    });
    document.getElementById("expand-editor").addEventListener("blur", () => {
      const editor = document.getElementById("expand-editor");
      const current = editor.value.trim();
      if (current) {
        try {
          editor.value = JSON.stringify(JSON.parse(current), null, 2);
        } catch {}
      }
      updateExpandEditorPresentation();
      syncExpandEditorScroll();
    });
    document.getElementById("expand-body-btn").addEventListener("click", () => {
      openExpandModal("body");
    });
    document.getElementById("expand-response-btn").addEventListener("click", () => {
      openExpandModal("response");
    });
    document.getElementById("expand-close").addEventListener("click", closeExpandModal);
    document.getElementById("expand-apply").addEventListener("click", () => {
      if (expandModalMode !== "body") {
        closeExpandModal();
        return;
      }

      const editor = document.getElementById("expand-editor");
      const bodyInput = document.getElementById("body-input");
      if (editor && bodyInput) {
        bodyInput.value = editor.value;
        formatBodyJsonInput();
        if (selected) {
          setBodyDraft(selected, bodyInput.value);
        }
        updateRequestPreview();
        updateBodyJsonPresentation();
        syncBodyEditorScroll();
      }
      closeExpandModal();
    });
    document.getElementById("expand-modal").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) {
        closeExpandModal();
      }
    });
    document.getElementById("sidebar-open").addEventListener("click", () => {
      setMobileSidebarOpen(true);
    });
    document.getElementById("sidebar-close").addEventListener("click", () => {
      setMobileSidebarOpen(false);
    });
    document.getElementById("mobile-backdrop").addEventListener("click", () => {
      setMobileSidebarOpen(false);
    });
    window.addEventListener("resize", () => {
      if (activeParamTooltipTrigger) {
        positionParamTooltip(activeParamTooltipTrigger);
      }
      if (window.innerWidth >= 768 && isMobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
    });
    window.addEventListener("scroll", () => {
      if (activeParamTooltipTrigger) {
        positionParamTooltip(activeParamTooltipTrigger);
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideParamTooltip();
        if (isMobileSidebarOpen) {
          setMobileSidebarOpen(false);
        }
        closeExpandModal();
      }
    });

    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;
    themeToggleBtn.addEventListener('click', () => {
      htmlElement.classList.toggle('dark');
      if (htmlElement.classList.contains('dark')) {
        localStorage.setItem('theme', 'dark');
      } else {
        localStorage.setItem('theme', 'light');
      }
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!('theme' in localStorage)) {
        if (e.matches) htmlElement.classList.add('dark');
        else htmlElement.classList.remove('dark');
      }
    });

    function getOperationSecurityRequirements(op) {
      const operationSecurity = op && op.operation && Array.isArray(op.operation.security)
        ? op.operation.security
        : null;
      if (operationSecurity) {
        return operationSecurity;
      }
      return Array.isArray(spec.security) ? spec.security : [];
    }

    function getAuthSelectionKeyForOperation(op) {
      if (!op) return "";
      return getOperationKey(op);
    }

    function getAuthSchemeOptionsForOperation(op) {
      const requirements = getOperationSecurityRequirements(op).filter((requirement) =>
        requirement && typeof requirement === "object" && !Array.isArray(requirement)
      );
      if (!requirements.length) return [];

      const seen = new Set();
      const options = [];
      for (const requirement of requirements) {
        for (const schemeName of Object.keys(requirement)) {
          if (!Object.prototype.hasOwnProperty.call(authSchemes, schemeName)) continue;
          if (seen.has(schemeName)) continue;
          seen.add(schemeName);
          options.push(schemeName);
        }
      }
      return options;
    }

    function getSelectedAuthSchemeForOperation(op) {
      const selectionKey = getAuthSelectionKeyForOperation(op);
      if (!selectionKey) return null;

      const selectedScheme = authSelectionState[selectionKey];
      if (!selectedScheme || typeof selectedScheme !== "string") return null;

      const options = Object.keys(authSchemes);
      if (!options.includes(selectedScheme)) {
        delete authSelectionState[selectionKey];
        saveAuthSelectionState();
        return null;
      }

      return selectedScheme;
    }

    function setSelectedAuthSchemeForOperation(op, schemeName) {
      const selectionKey = getAuthSelectionKeyForOperation(op);
      if (!selectionKey) return;

      if (!schemeName) {
        delete authSelectionState[selectionKey];
      } else {
        authSelectionState[selectionKey] = schemeName;
      }
      saveAuthSelectionState();
    }

    function hasAuthStateForScheme(schemeName) {
      const scheme = authSchemes[schemeName];
      if (!scheme) return false;

      const state = authState[schemeName] || {};
      const type = (scheme.type || "").toLowerCase();
      const httpScheme = (scheme.scheme || "").toLowerCase();

      if (type === "http" && httpScheme === "basic") {
        return Boolean(state.username && state.password);
      }
      if (type === "http") {
        return Boolean(state.token);
      }
      if (type === "apikey") {
        return Boolean(state.value);
      }
      if (type === "oauth2" || type === "openidconnect") {
        return Boolean(state.token);
      }

      return false;
    }

    function chooseOperationSecurityRequirement(op) {
      const requirements = getOperationSecurityRequirements(op).filter((requirement) =>
        requirement && typeof requirement === "object" && !Array.isArray(requirement)
      );
      if (!requirements.length) return null;

      const selectedScheme = getSelectedAuthSchemeForOperation(op);
      if (selectedScheme) {
        const selectedRequirement = requirements.find((requirement) =>
          Object.prototype.hasOwnProperty.call(requirement, selectedScheme)
        );
        if (selectedRequirement) return selectedRequirement;
      }

      let bestRequirement = null;
      let bestScore = -1;

      for (const requirement of requirements) {
        const schemeNames = Object.keys(requirement).filter((schemeName) =>
          Object.prototype.hasOwnProperty.call(authSchemes, schemeName)
        );
        if (!schemeNames.length) continue;

        const providedCount = schemeNames.filter((schemeName) => hasAuthStateForScheme(schemeName)).length;
        const isComplete = providedCount === schemeNames.length;
        const score = isComplete ? 1000 + providedCount : providedCount;

        if (score > bestScore) {
          bestScore = score;
          bestRequirement = requirement;
        }
      }

      return bestRequirement || requirements[0];
    }

    function getAuthSchemeNamesForOperation(op) {
      const schemeNames = Object.keys(authSchemes);
      if (!schemeNames.length) return [];

      const selectedScheme = getSelectedAuthSchemeForOperation(op);
      if (selectedScheme) {
        const requirement = chooseOperationSecurityRequirement(op);
        if (requirement && Object.prototype.hasOwnProperty.call(requirement, selectedScheme)) {
          return Object.keys(requirement).filter((schemeName) =>
            Object.prototype.hasOwnProperty.call(authSchemes, schemeName)
          );
        }
        return [selectedScheme];
      }

      const requirement = chooseOperationSecurityRequirement(op);
      if (!requirement) return [];

      return Object.keys(requirement).filter((schemeName) =>
        Object.prototype.hasOwnProperty.call(authSchemes, schemeName)
      );
    }

    function getAuthHeaders(op) {
      const headers = {};
      const schemeNames = getAuthSchemeNamesForOperation(op);
      const allSchemeNames = Object.keys(authSchemes);

      if (!allSchemeNames.length) {
        const state = authState["__default__"] || {};
        if (state.token) headers["Authorization"] = "Bearer " + state.token;
        return headers;
      }
      if (!schemeNames.length) return headers;

      for (const schemeName of schemeNames) {
        const scheme = authSchemes[schemeName];
        const state = authState[schemeName] || {};
        const type = (scheme.type || "").toLowerCase();
        const httpScheme = (scheme.scheme || "").toLowerCase();

        if (type === "http" && httpScheme === "basic") {
          if (state.username && state.password) {
            try {
              headers["Authorization"] = "Basic " + btoa(state.username + ":" + state.password);
            } catch {}
          }
        } else if (type === "http") {
          if (state.token) headers["Authorization"] = "Bearer " + state.token;
        } else if (type === "apikey" && (scheme.in || "").toLowerCase() === "header") {
          if (state.value && scheme.name) headers[scheme.name] = state.value;
        } else if (type === "oauth2" || type === "openidconnect") {
          if (state.token) headers["Authorization"] = "Bearer " + state.token;
        }
      }
      return headers;
    }

    function getAuthQueryParams(op) {
      const params = {};
      for (const schemeName of getAuthSchemeNamesForOperation(op)) {
        const scheme = authSchemes[schemeName];
        if ((scheme.type || "").toLowerCase() === "apikey" && (scheme.in || "").toLowerCase() === "query") {
          const state = authState[schemeName] || {};
          if (state.value && scheme.name) params[scheme.name] = state.value;
        }
      }
      return params;
    }

    function getAuthCookieParams(op) {
      const cookies = {};
      for (const schemeName of getAuthSchemeNamesForOperation(op)) {
        const scheme = authSchemes[schemeName];
        if ((scheme.type || "").toLowerCase() !== "apikey") continue;
        if ((scheme.in || "").toLowerCase() !== "cookie") continue;
        const state = authState[schemeName] || {};
        if (state.value && scheme.name) {
          cookies[scheme.name] = state.value;
        }
      }
      return cookies;
    }

    function applyAuthCookies(op) {
      const cookies = getAuthCookieParams(op);
      for (const [name, value] of Object.entries(cookies)) {
        try {
          document.cookie = encodeURIComponent(String(name)) + "=" + encodeURIComponent(String(value)) + "; path=/";
        } catch {}
      }
    }

    function renderAuthPanel() {
      const fields = document.getElementById("auth-fields");
      if (!fields) return;
      fields.innerHTML = "";

      const schemeNames = Object.keys(authSchemes);
      const op = selected;
      const operationSchemeOptions = op ? getAuthSchemeOptionsForOperation(op) : [];
      const availableSchemeOptions = Object.keys(authSchemes);
      const selectedScheme = op ? getSelectedAuthSchemeForOperation(op) : null;

      function getAuthSchemeDisplayLabel(schemeName) {
        const scheme = authSchemes[schemeName] || {};
        const type = (scheme.type || "").toLowerCase();
        const httpScheme = (scheme.scheme || "").toLowerCase();
        const location = (scheme.in || "").toLowerCase();

        if (type === "http" && httpScheme === "basic") return "HTTP Basic";
        if (type === "http" && httpScheme === "bearer") return "HTTP Bearer";
        if (type === "http" && httpScheme === "digest") return "HTTP Digest";
        if (type === "http") return "HTTP " + (httpScheme || "Token");
        if (type === "apikey") return "API Key" + (location ? " (" + location + ")" : "");
        if (type === "oauth2") return "OAuth 2.0";
        if (type === "openidconnect") return "OpenID Connect";
        if (type === "mutualtls") return "Mutual TLS";
        return schemeName;
      }

      function makeInput(placeholder, value, onInput, type) {
        const inp = document.createElement("input");
        inp.type = type || "text";
        inp.value = value || "";
        inp.placeholder = placeholder;
        inp.className = "w-full text-xs px-2.5 py-2 rounded-md border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg focus:outline-none focus:border-brand dark:focus:border-brand transition-colors font-mono";
        inp.addEventListener("input", onInput);
        return inp;
      }

      function makeLabel(text, small) {
        const el = document.createElement("p");
        el.className = small
          ? "text-[10px] font-medium uppercase tracking-wider opacity-55"
          : "text-[10px] font-semibold uppercase tracking-wider opacity-55";
        el.textContent = text;
        return el;
      }

      function makeField(label, input) {
        const wrapper = document.createElement("div");
        wrapper.className = "space-y-1";
        wrapper.appendChild(makeLabel(label, true));
        wrapper.appendChild(input);
        return wrapper;
      }

      function makeSchemeCard(title, subtitle) {
        const card = document.createElement("div");
        card.className = "space-y-2 rounded-md border border-light-border dark:border-dark-border bg-light-bg/40 dark:bg-dark-bg/40 p-2.5";

        const titleRow = document.createElement("div");
        titleRow.className = "flex items-center justify-between gap-2";

        const heading = document.createElement("p");
        heading.className = "text-[11px] font-semibold tracking-wide";
        heading.textContent = title;
        titleRow.appendChild(heading);

        if (subtitle) {
          const note = document.createElement("span");
          note.className = "text-[10px] opacity-60 font-mono";
          note.textContent = subtitle;
          titleRow.appendChild(note);
        }

        card.appendChild(titleRow);
        return card;
      }

      if (!schemeNames.length) {
        if (!authState["__default__"]) authState["__default__"] = {};
        const defaultCard = makeSchemeCard("Default Auth", "bearer");
        defaultCard.appendChild(makeField("Token", makeInput("Enter token…", authState["__default__"].token, function(e) {
          authState["__default__"].token = e.target.value;
          saveAuthState();
          updateRequestPreview();
        })));
        fields.appendChild(defaultCard);
        return;
      }

      if (op && availableSchemeOptions.length > 0) {
        const selectorWrap = document.createElement("div");
        selectorWrap.className = "space-y-1";
        selectorWrap.appendChild(makeLabel("Auth Type"));
        const select = document.createElement("select");
        select.className = "w-full text-xs px-2.5 py-2 rounded-md border border-light-border dark:border-dark-border bg-light-bg dark:bg-dark-bg focus:outline-none focus:border-brand dark:focus:border-brand transition-colors font-mono";

        const autoOption = document.createElement("option");
        autoOption.value = "";
        autoOption.textContent = "Auto";
        select.appendChild(autoOption);

        for (const schemeName of availableSchemeOptions) {
          const option = document.createElement("option");
          option.value = schemeName;
          const isOperationScheme = operationSchemeOptions.includes(schemeName);
          const label = getAuthSchemeDisplayLabel(schemeName);
          option.textContent = isOperationScheme
            ? label
            : (label + " • override");
          select.appendChild(option);
        }

        select.value = selectedScheme || "";
        select.addEventListener("change", function(e) {
          setSelectedAuthSchemeForOperation(op, e.target.value || "");
          renderAuthPanel();
          updateRequestPreview();
        });
        selectorWrap.appendChild(select);
        fields.appendChild(selectorWrap);
      }

      const schemesToRender = selectedScheme
        ? [selectedScheme]
        : (operationSchemeOptions.length ? operationSchemeOptions : schemeNames);

      for (const schemeName of schemesToRender) {
        const scheme = authSchemes[schemeName];
        if (!authState[schemeName]) authState[schemeName] = {};
        const state = authState[schemeName];
        const type = (scheme.type || "").toLowerCase();
        const httpScheme = (scheme.scheme || "").toLowerCase();
        const card = makeSchemeCard(getAuthSchemeDisplayLabel(schemeName), schemeName);

        if (type === "http" && httpScheme === "basic") {
          card.appendChild(makeField("Username", makeInput("Username", state.username, function(e) {
            authState[schemeName].username = e.target.value;
            saveAuthState();
            updateRequestPreview();
          })));
          card.appendChild(makeField("Password", makeInput("Password", state.password, function(e) {
            authState[schemeName].password = e.target.value;
            saveAuthState();
            updateRequestPreview();
          }, "password")));
        } else if (type === "apikey") {
          const paramName = scheme.name || "key";
          const location = (scheme.in || "header").toLowerCase();
          card.appendChild(makeField("API Key", makeInput(paramName + " (" + location + ")", state.value, function(e) {
            authState[schemeName].value = e.target.value;
            saveAuthState();
            updateRequestPreview();
          })));
        } else if (type === "oauth2") {
          card.appendChild(makeField("Access Token", makeInput("OAuth2 access token…", state.token, function(e) {
            authState[schemeName].token = e.target.value;
            saveAuthState();
            updateRequestPreview();
          })));
        } else if (type === "openidconnect") {
          card.appendChild(makeField("ID Token / Access Token", makeInput("OpenID Connect token…", state.token, function(e) {
            authState[schemeName].token = e.target.value;
            saveAuthState();
            updateRequestPreview();
          })));
        } else if (type === "http" && httpScheme === "digest") {
          card.appendChild(makeField("Digest Credential", makeInput("Digest token…", state.token, function(e) {
            authState[schemeName].token = e.target.value;
            saveAuthState();
            updateRequestPreview();
          })));
        } else if (type === "http" && httpScheme === "bearer") {
          card.appendChild(makeField("Bearer Token", makeInput("Bearer token…", state.token, function(e) {
            authState[schemeName].token = e.target.value;
            saveAuthState();
            updateRequestPreview();
          })));
        } else if (type === "mutualtls") {
          const hint = document.createElement("p");
          hint.className = "text-xs opacity-70 leading-relaxed";
          hint.textContent = "Configured by your client certificate. No token input required.";
          card.appendChild(hint);
        } else {
          card.appendChild(makeField("Token", makeInput("Token…", state.token, function(e) {
            authState[schemeName].token = e.target.value;
            saveAuthState();
            updateRequestPreview();
          })));
        }
        fields.appendChild(card);
      }
    }

    let authPanelOpen = true;
    document.getElementById("auth-toggle").addEventListener("click", function() {
      authPanelOpen = !authPanelOpen;
      const fieldsEl = document.getElementById("auth-fields");
      const chevron = document.getElementById("auth-chevron");
      if (fieldsEl) fieldsEl.classList.toggle("hidden", !authPanelOpen);
      if (chevron) chevron.style.transform = authPanelOpen ? "" : "rotate(-90deg)";
    });

    // Restore selected operation from URL hash, or set hash for the default selection
    var initMatch = findOpByHash(window.location.hash);
    if (initMatch) {
      selected = initMatch;
    } else if (selected) {
      history.replaceState(null, "", getOpHash(selected));
    }

    window.addEventListener("popstate", function() {
      var match = findOpByHash(window.location.hash);
      if (match) {
        selected = match;
        renderSidebar();
        renderEndpoint();
      }
    });

    setMobileSidebarOpen(false);
    renderAuthPanel();
    renderSidebar();
    renderEndpoint();
  </script>
</body>
</html>`;
}
