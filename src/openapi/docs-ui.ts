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

    const operations = getOperations();
    let selected = operations[0] || null;
    const operationParamValues = new Map();
    const operationBodyDrafts = new Map();
    const requestHeaders = [{ key: "Authorization", value: "" }];
    let expandModalMode = null;
    let isMobileSidebarOpen = false;
    let sidebarSearchQuery = "";

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

    function buildRequestPath(op, pathParams, queryParams, values) {
      const resolvedPath = resolvePath(op.path, pathParams, values);
      const query = new URLSearchParams();

      for (const param of queryParams) {
        const rawValue = values[param.name];
        if (rawValue === undefined || rawValue === null || rawValue === "") {
          continue;
        }
        query.append(param.name, String(rawValue));
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

          row.appendChild(method);
          row.appendChild(name);
          a.appendChild(row);

          a.onclick = (e) => {
            e.preventDefault();
            selected = op;
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

    function renderParamSection(title, params) {
      if (!params.length) return "";
      let rows = "";
      for (const p of params) {
        const type = escapeHtml((p.schema && p.schema.type) || "unknown");
        const name = escapeHtml(p.name || "");
        rows += '<div class="py-2 flex justify-between border-b border-light-border/50 dark:border-dark-border/50"><div><code class="text-sm font-mono">' + name + '</code><span class="text-xs text-brand ml-2">' + (p.required ? "required" : "optional") + '</span></div><span class="text-xs font-mono opacity-60">' + type + '</span></div>';
      }
      return '<div><h3 class="text-sm font-semibold mb-3 flex items-center border-b border-light-border dark:border-dark-border pb-2">' + escapeHtml(title) + "</h3>" + rows + "</div>";
    }

    function getSchemaTypeLabel(schema) {
      if (!schema || typeof schema !== "object") return "unknown";
      if (Array.isArray(schema.type)) return schema.type.join(" | ");
      if (schema.type) return String(schema.type);
      if (schema.properties) return "object";
      if (schema.items) return "array";
      if (Array.isArray(schema.oneOf)) return "oneOf";
      if (Array.isArray(schema.anyOf)) return "anyOf";
      if (Array.isArray(schema.allOf)) return "allOf";
      return "unknown";
    }

    function buildSchemaChildren(schema) {
      if (!schema || typeof schema !== "object") return [];

      const children = [];

      if (schema.properties && typeof schema.properties === "object") {
        const requiredSet = new Set(
          Array.isArray(schema.required) ? schema.required : [],
        );
        for (const [name, childSchema] of Object.entries(schema.properties)) {
          children.push({
            name,
            schema: childSchema || {},
            required: requiredSet.has(name),
          });
        }
      }

      if (schema.items) {
        children.push({
          name: "items[]",
          schema: schema.items,
          required: true,
        });
      }

      return children;
    }

    function renderSchemaFieldNode(field, depth) {
      const schema = field.schema || {};
      const name = escapeHtml(field.name || "field");
      const requiredLabel = field.required ? "required" : "optional";
      const type = escapeHtml(getSchemaTypeLabel(schema));
      const children = buildSchemaChildren(schema);
      const padding = depth * 14;

      if (!children.length) {
        return (
          '<div class="py-2 border-b border-light-border/50 dark:border-dark-border/50" style="padding-left:' +
          padding +
          'px"><div class="flex justify-between"><div><code class="text-sm font-mono">' +
          name +
          '</code><span class="text-xs text-brand ml-2">' +
          requiredLabel +
          '</span></div><span class="text-xs font-mono opacity-60">' +
          type +
          "</span></div></div>"
        );
      }

      let nested = "";
      for (const child of children) {
        nested += renderSchemaFieldNode(child, depth + 1);
      }

      return (
        '<details class="border-b border-light-border/50 dark:border-dark-border/50" open>' +
        '<summary class="list-none cursor-pointer py-2 flex justify-between items-center" style="padding-left:' +
        padding +
        'px"><div class="flex items-center gap-2"><span class="text-xs opacity-70">▾</span><code class="text-sm font-mono">' +
        name +
        '</code><span class="text-xs text-brand">' +
        requiredLabel +
        '</span></div><span class="text-xs font-mono opacity-60">' +
        type +
        "</span></summary>" +
        '<div class="pb-1">' +
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
        rows += renderSchemaFieldNode(child, 0);
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

        const jsonSchema =
          responseDef.content &&
          responseDef.content["application/json"] &&
          responseDef.content["application/json"].schema;

        if (!jsonSchema || typeof jsonSchema !== "object") continue;

        const rootChildren = buildSchemaChildren(jsonSchema);
        if (!rootChildren.length) continue;

        let rows = "";
        for (const child of rootChildren) {
          rows += renderSchemaFieldNode(child, 0);
        }

        sections +=
          '<div class="mb-4"><h4 class="text-xs font-mono uppercase tracking-wider opacity-70 mb-2">Status ' +
          escapeHtml(statusCode) +
          "</h4>" +
          rows +
          "</div>";
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

    function getRequestHeadersObject() {
      const headers = {};
      for (const entry of requestHeaders) {
        const key = String(entry.key || "").trim();
        const value = String(entry.value || "").trim();
        if (!key || !value) continue;
        headers[key] = value;
      }
      return headers;
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
      const requestPath = buildRequestPath(selected, path, query, values);
      const bodyInput = document.getElementById("body-input");
      const body = bodyInput ? bodyInput.value.trim() : "";
      const headers = getRequestHeadersObject();
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

      document.getElementById("tag-title").textContent = selected.tag;
      document.getElementById("tag-description").textContent = op.description || "Interactive API documentation.";
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
      document.getElementById("params-column").innerHTML = html || '<div class="text-sm opacity-70">No parameters</div>';
      renderTryItParameterInputs(path, query);
      renderHeaderInputs();
      updateRequestPreview();
      updateBodyJsonPresentation();
      syncBodyEditorScroll();
    }

    document.getElementById("copy-curl").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(document.getElementById("curl-code").textContent || ""); } catch {}
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

      const requestPath = buildRequestPath(selected, path, query, values);
      formatBodyJsonInput();
      updateBodyJsonPresentation();
      const op = selected.operation || {};
      const reqSchema = op.requestBody && op.requestBody.content && op.requestBody.content["application/json"] && op.requestBody.content["application/json"].schema;
      const supportsBody = hasMeaningfulRequestBodySchema(reqSchema);
      const bodyInput = document.getElementById("body-input");
      const body =
        supportsBody && bodyInput ? bodyInput.value.trim() : "";
      const headers = getRequestHeadersObject();
      if (body && !hasHeaderName(headers, "Content-Type")) {
        headers["Content-Type"] = "application/json";
      }

      setSubmitLoading(true);
      try {
        const requestStart = performance.now();
        const response = await fetch(requestPath, { method: selected.method, headers, body: body || undefined });
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
      if (window.innerWidth >= 768 && isMobileSidebarOpen) {
        setMobileSidebarOpen(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
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

    setMobileSidebarOpen(false);
    renderSidebar();
    renderEndpoint();
  </script>
</body>
</html>`;
}
