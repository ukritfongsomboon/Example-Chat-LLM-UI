/**
 * Embeddable Chat Widget
 * Usage: <script src="http://localhost:3000/script.js" api-key="YOUR-KEY"></script>
 */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const scriptEl   = document.currentScript;
  const apiKey     = scriptEl?.getAttribute('api-key') || '';
  const scriptSrc  = scriptEl?.src || '';
  const baseUrl    = scriptSrc ? new URL(scriptSrc).origin : window.location.origin;
  const API_URL    = baseUrl + '/api/chat';

  // ── Load CDN deps ──────────────────────────────────────────────────────────
  function loadScript(url) {
    return new Promise((resolve) => {
      if (document.querySelector(`script[src="${url}"]`)) return resolve();
      const s   = document.createElement('script');
      s.src     = url;
      s.onload  = resolve;
      s.onerror = resolve; // degrade gracefully
      document.head.appendChild(s);
    });
  }

  Promise.all([
    loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js'),
  ]).then(initWidget);

  // ── CSS ─────────────────────────────────────────────────────────────────────
  const CSS = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      --accent1: #667eea;
      --accent2: #764ba2;
      --grad: linear-gradient(135deg, var(--accent1), var(--accent2));
      /* light theme */
      --bg-card:      #ffffff;
      --bg-header:    #ffffff;
      --bg-input:     #ffffff;
      --bg-bubble-ai: #f1f3f5;
      --bg-thinking:  #faf7ff;
      --bg-thinking-h:#f5f0ff;
      --border:       #e9ecef;
      --border-input: #dee2e6;
      --text-primary: #1a1a2e;
      --text-muted:   #6c757d;
      --text-faint:   #adb5bd;
      --shadow:       rgba(0,0,0,0.15);
      --code-bg:      rgba(0,0,0,0.07);
      --scrollbar:    #dee2e6;
    }

    :host([data-theme="dark"]) {
      --bg-card:      #1a1d27;
      --bg-header:    #1a1d27;
      --bg-input:     #1a1d27;
      --bg-bubble-ai: #252836;
      --bg-thinking:  #1e1a2e;
      --bg-thinking-h:#25203a;
      --border:       #2e3147;
      --border-input: #2e3147;
      --text-primary: #e8eaf0;
      --text-muted:   #8b8fa8;
      --text-faint:   #555870;
      --shadow:       rgba(0,0,0,0.50);
      --code-bg:      rgba(255,255,255,0.07);
      --scrollbar:    #2e3147;
    }

    /* ── FAB button ─────────────────────────────────────────────────────── */
    #fab {
      position: fixed;
      bottom: 28px; right: 28px;
      width: 56px; height: 56px;
      border-radius: 50%;
      background: var(--grad);
      border: none;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 20px rgba(118,75,162,0.45);
      transition: transform 0.2s, box-shadow 0.2s;
      z-index: 9998;
      color: #fff;
    }

    #fab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(118,75,162,0.55); }
    #fab svg   { width: 24px; height: 24px; transition: transform 0.3s; }
    #fab.open svg { transform: rotate(45deg); }

    /* unread badge */
    #fab .badge {
      position: absolute;
      top: 0; right: 0;
      width: 16px; height: 16px;
      background: #ef4444;
      border-radius: 50%;
      border: 2px solid #fff;
      font-size: 9px;
      color: #fff;
      display: none;
      align-items: center; justify-content: center;
      font-weight: 700;
    }

    /* ── Popup panel ────────────────────────────────────────────────────── */
    #popup {
      position: fixed;
      bottom: 96px; right: 28px;
      width: 380px;
      height: 560px;
      background: var(--bg-card);
      border-radius: 18px;
      box-shadow: 0 8px 40px var(--shadow);
      display: flex; flex-direction: column;
      overflow: hidden;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      transform-origin: bottom right;
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;
    }

    #popup.hidden {
      transform: scale(0.75) translateY(20px);
      opacity: 0;
      pointer-events: none;
    }

    @media (max-width: 440px) {
      #popup { right: 0; bottom: 0; width: 100vw; height: 100dvh; border-radius: 0; }
      #fab   { bottom: 16px; right: 16px; }
    }

    /* ── Header ─────────────────────────────────────────────────────────── */
    .chat-header {
      padding: 14px 16px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center; gap: 10px;
      flex-shrink: 0;
      transition: background 0.3s, border-color 0.3s;
    }

    .avatar {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: var(--grad);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 16px; flex-shrink: 0;
    }

    .info { flex: 1; min-width: 0; }
    .info h2 { font-size: 14px; font-weight: 600; color: var(--text-primary); }
    .info span { font-size: 11px; color: var(--text-muted); }

    .hdr-btn {
      width: 30px; height: 30px;
      border-radius: 50%;
      border: 1.5px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; flex-shrink: 0;
      transition: border-color 0.2s, color 0.2s, transform 0.3s;
    }

    .hdr-btn:hover { border-color: var(--accent1); color: var(--accent1); }
    #themeBtn:hover { transform: rotate(20deg); }
    #closeBtn:hover { transform: rotate(90deg); }
    #settingsBtn.active { border-color: var(--accent1); color: var(--accent1); }
    #settingsBtn svg { transition: transform 0.4s ease; }
    #settingsBtn.active svg { transform: rotate(60deg); }

    /* ── Settings dropdown ───────────────────────────────────────────────── */
    .settings-wrap { position: relative; flex-shrink: 0; }

    .settings-dropdown {
      position: absolute;
      top: calc(100% + 8px); right: 0;
      width: 220px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 8px 28px var(--shadow);
      padding: 6px 0;
      z-index: 100;
      transform-origin: top right;
      transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s ease;
    }

    .settings-dropdown.hidden {
      transform: scale(0.85) translateY(-6px);
      opacity: 0;
      pointer-events: none;
    }

    .settings-section {
      padding: 6px 14px 4px;
      font-size: 9px; font-weight: 700;
      color: var(--text-faint);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .settings-item {
      display: flex; align-items: center;
      padding: 9px 14px;
      gap: 10px;
      cursor: pointer;
      transition: background 0.15s;
      user-select: none;
    }

    .settings-item:hover { background: var(--bg-bubble-ai); }

    .settings-item .s-icon {
      width: 28px; height: 28px; border-radius: 8px;
      background: var(--bg-bubble-ai);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; color: var(--text-muted);
      transition: background 0.2s;
    }
    .settings-item:hover .s-icon { color: var(--accent1); }

    .settings-item .s-label { flex: 1; }
    .settings-item .s-label strong { font-size: 12px; color: var(--text-primary); display: block; }
    .settings-item .s-label span  { font-size: 10px; color: var(--text-muted); }

    .toggle-sw { position: relative; width: 32px; height: 18px; flex-shrink: 0; }
    .toggle-sw input { display: none; }
    .toggle-sl {
      position: absolute; inset: 0;
      background: var(--border); border-radius: 18px;
      transition: background 0.2s;
      cursor: pointer;
    }
    .toggle-sl::before {
      content: '';
      position: absolute;
      width: 12px; height: 12px;
      left: 3px; top: 3px;
      background: #fff; border-radius: 50%;
      transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .toggle-sw input:checked + .toggle-sl { background: var(--grad); }
    .toggle-sw input:checked + .toggle-sl::before { transform: translateX(14px); }

    .settings-divider {
      height: 1px; background: var(--border);
      margin: 4px 14px;
    }

    /* ── Messages ───────────────────────────────────────────────────────── */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 12px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
      background: var(--bg-card);
      transition: background 0.3s;
    }

    .messages::-webkit-scrollbar { width: 3px; }
    .messages::-webkit-scrollbar-thumb { background: var(--scrollbar); border-radius: 3px; }

    .msg {
      display: flex; gap: 8px;
      max-width: 90%;
      animation: msgIn 0.2s ease both;
    }

    @keyframes msgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .msg.user      { align-self: flex-end;   flex-direction: row-reverse; }
    .msg.assistant { align-self: flex-start; }

    .msg-content { display: flex; flex-direction: column; gap: 4px; }

    .msg-time {
      font-size: 10px; color: var(--text-faint);
      padding: 0 4px;
      display: flex; align-items: center; gap: 4px;
    }

    .msg.user .msg-time { align-self: flex-end; }

    .feedback-btn {
      background: none; border: none; cursor: pointer;
      font-size: 11px; padding: 0 1px;
      opacity: 0.4; transition: opacity 0.2s, transform 0.15s; line-height: 1;
    }
    .feedback-btn:hover { opacity: 1; transform: scale(1.2); }
    .feedback-btn.active { opacity: 1; }

    .bubble {
      padding: 9px 13px;
      border-radius: 16px;
      font-size: 13px; line-height: 1.55;
      word-break: break-word;
      animation: bubbleIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both;
    }

    @keyframes bubbleIn {
      from { opacity: 0; transform: scale(0.93) translateY(6px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }

    .msg.user .bubble {
      background: var(--grad);
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .msg.assistant .bubble {
      background: var(--bg-bubble-ai);
      color: var(--text-primary);
      border-bottom-left-radius: 4px;
      transition: background 0.3s, color 0.3s;
    }

    .msg.assistant .bubble:empty { display: none; }

    /* Markdown */
    .bubble p { margin: 0 0 7px; }
    .bubble p:last-child { margin-bottom: 0; }
    .bubble h1,.bubble h2,.bubble h3 { margin: 8px 0 3px; font-weight: 600; line-height: 1.3; }
    .bubble h1 { font-size: 16px; } .bubble h2 { font-size: 14px; } .bubble h3 { font-size: 13px; }
    .bubble ul,.bubble ol { margin: 3px 0 7px; padding-left: 18px; }
    .bubble li { margin-bottom: 2px; }
    .bubble code {
      background: var(--code-bg); border-radius: 3px;
      padding: 1px 4px;
      font-family: 'SF Mono','Fira Code',monospace; font-size: 11px;
    }
    .bubble pre {
      background: #1e1e2e; border-radius: 7px;
      padding: 10px 12px; overflow-x: auto; margin: 6px 0;
    }
    .bubble pre code { background: none; padding: 0; color: #cdd6f4; font-size: 11px; }
    .bubble blockquote { border-left: 3px solid #c9b8f0; margin: 5px 0; padding-left: 9px; color: var(--text-muted); }
    .bubble strong { font-weight: 600; }
    .bubble a { color: var(--accent1); text-decoration: none; }
    .bubble a:hover { text-decoration: underline; }
    .bubble table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 12px; }
    .bubble th,.bubble td { border: 1px solid var(--border); padding: 5px 8px; }
    .bubble th { background: var(--bg-bubble-ai); font-weight: 600; }
    .bubble hr { border: none; border-top: 1px solid var(--border); margin: 6px 0; }

    .bubble.streaming::after {
      content: '▋'; display: inline-block;
      color: var(--accent2);
      animation: blink 0.8s step-end infinite; margin-left: 1px;
    }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

    .msg-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: var(--grad);
      flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 12px; align-self: flex-end;
    }
    .msg.user .msg-avatar { background: var(--border); color: var(--text-muted); }

    /* Thinking */
    .thinking-block {
      border: 1px solid var(--border); border-radius: 10px;
      overflow: hidden; font-size: 12px;
      animation: slideDown 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
    }
    @keyframes slideDown { from{opacity:0;transform:translateY(-6px) scale(0.97)} to{opacity:1;transform:none} }

    .thinking-header {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 12px;
      background: var(--bg-thinking-h);
      cursor: pointer; color: #7c5cbf; font-weight: 500;
      user-select: none;
    }
    .thinking-header:hover { filter: brightness(0.95); }
    .thinking-header .chevron { margin-left: auto; transition: transform 0.25s; font-size: 9px; opacity: 0.6; }
    .thinking-header.open .chevron { transform: rotate(90deg); }

    .thinking-body {
      overflow: hidden; max-height: 0; padding: 0 12px;
      background: var(--bg-thinking); color: var(--text-muted);
      white-space: pre-wrap; word-break: break-word; line-height: 1.6;
      transition: max-height 0.35s ease, padding 0.25s ease; font-size: 12px;
    }
    .thinking-body.visible { max-height: 200px; padding: 8px 12px; overflow-y: auto; }

    .thinking-spinner {
      display: inline-block; width: 10px; height: 10px;
      border: 1.5px solid #c9b8f0; border-top-color: #764ba2;
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Tool badge */
    .tool-badge {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 3px 9px;
      background: #fff8e6; border: 1px solid #ffe49e;
      border-radius: 20px; font-size: 11px; color: #9a6700;
      animation: msgIn 0.2s ease; align-self: flex-start;
    }
    .tool-spinner {
      width: 8px; height: 8px;
      border: 1.5px solid #f5c542; border-top-color: #9a6700;
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }

    /* Typing indicator */
    .typing-indicator .bubble { display: flex; gap: 4px; align-items: center; padding: 10px 14px; }
    .dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-faint); animation: bounce 1.2s infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-5px)} }

    /* ── Input area ─────────────────────────────────────────────────────── */
    .input-area {
      padding: 10px 12px 14px;
      border-top: 1px solid var(--border);
      background: var(--bg-card);
      display: flex; flex-direction: column; gap: 6px;
      flex-shrink: 0;
      transition: background 0.3s, border-color 0.3s;
    }

    .input-row { display: flex; gap: 8px; align-items: flex-end; }

    .input-area textarea {
      flex: 1; resize: none;
      border: 1px solid var(--border-input);
      border-radius: 10px;
      padding: 9px 12px;
      font-size: 13px; font-family: inherit;
      outline: none;
      max-height: 100px; overflow-y: auto; line-height: 1.5;
      background: var(--bg-input); color: var(--text-primary);
      transition: border-color 0.2s, background 0.3s, color 0.3s;
    }
    .input-area textarea::placeholder { color: var(--text-faint); }
    .input-area textarea:focus { border-color: var(--accent1); }

    #sendBtn {
      width: 38px; height: 38px; border-radius: 50%;
      border: none; background: var(--grad);
      color: #fff; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: opacity 0.2s;
    }
    #sendBtn:disabled { opacity: 0.4; cursor: not-allowed; }
    #sendBtn svg { width: 16px; height: 16px; }

    .mic-btn {
      width: 38px; height: 38px; border-radius: 50%;
      border: 1.5px solid var(--border-input);
      background: var(--bg-input); color: var(--text-muted);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: all 0.2s;
    }
    .mic-btn svg { width: 16px; height: 16px; }
    .mic-btn:hover { border-color: #ef4444; color: #ef4444; }
    .mic-btn.recording {
      border-color: #ef4444; background: #fef2f2; color: #ef4444;
      animation: micPulse 1s ease-in-out infinite;
    }
    @keyframes micPulse {
      0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.3)}
      50%    {box-shadow:0 0 0 5px rgba(239,68,68,0)}
    }

    /* upload btn */
    .upload-btn {
      width: 38px; height: 38px; border-radius: 50%;
      border: 1.5px solid var(--border-input);
      background: var(--bg-input); color: var(--text-muted);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: all 0.2s;
    }
    .upload-btn svg { width: 16px; height: 16px; }
    .upload-btn:hover { border-color: var(--accent1); color: var(--accent1); }
    .upload-btn.has-image { border-color: var(--accent1); color: var(--accent1); background: #f0f0ff; }

    /* image preview */
    .image-preview { position: relative; display: inline-block; animation: msgIn 0.2s ease; }
    .image-preview img { height: 64px; border-radius: 8px; border: 1.5px solid var(--border); display: block; object-fit: cover; }
    .image-preview .remove-img {
      position: absolute; top: -5px; right: -5px;
      width: 16px; height: 16px; border-radius: 50%;
      background: #ef4444; color: #fff; border: none;
      font-size: 10px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .bubble img.chat-img { max-width: 220px; max-height: 160px; border-radius: 8px; display: block; margin-bottom: 5px; object-fit: cover; }

    /* confidence badge */
    .confidence-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 6px; border-radius: 20px;
      font-size: 10px; font-weight: 500;
      animation: msgIn 0.3s ease;
    }
    .confidence-badge.high   { background: #d4f7e7; color: #1a7a4a; }
    .confidence-badge.medium { background: #fff3cd; color: #856404; }
    .confidence-badge.low    { background: #fde8e8; color: #b91c1c; }
    .confidence-bar { width: 24px; height: 3px; border-radius: 2px; background: rgba(0,0,0,0.1); overflow: hidden; }
    .confidence-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
    .high   .confidence-bar-fill { background: #22c55e; }
    .medium .confidence-bar-fill { background: #f59e0b; }
    .low    .confidence-bar-fill { background: #ef4444; }

    /* powered-by */
    .powered {
      text-align: center; font-size: 10px;
      color: var(--text-faint); padding-bottom: 2px;
    }
    .powered a { color: var(--text-faint); text-decoration: none; }
  `;

  // ── Widget HTML ──────────────────────────────────────────────────────────────
  function buildHTML() {
    return `
      <button id="fab" title="Open chat" aria-label="Open chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="badge" id="unreadBadge"></span>
      </button>

      <div id="popup" class="hidden">
        <div class="chat-header">
          <div class="avatar"><svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M12 2l2 7.2L21 12l-7 2L12 22l-2-7.2L3 12l7-2z"/></svg></div>
          <div class="info">
            <h2>ARIX</h2>
            <span id="modelLabel">Standard mode</span>
          </div>
          <div class="settings-wrap">
            <button class="hdr-btn" id="settingsBtn" title="Settings">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <div class="settings-dropdown hidden" id="settingsDropdown">
              <div class="settings-section">Model</div>
              <label class="settings-item">
                <div class="s-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-5 0V4.5A2.5 2.5 0 0 1 9.5 2z"/>
                    <path d="M14.5 8A2.5 2.5 0 0 1 17 10.5v9a2.5 2.5 0 0 1-5 0v-9A2.5 2.5 0 0 1 14.5 8z"/>
                    <path d="M4.5 14A2.5 2.5 0 0 1 7 16.5v3a2.5 2.5 0 0 1-5 0v-3A2.5 2.5 0 0 1 4.5 14z"/>
                  </svg>
                </div>
                <div class="s-label">
                  <strong>Thinking mode</strong>
                  <span>เปิด reasoning ก่อนตอบ</span>
                </div>
                <div class="toggle-sw">
                  <input type="checkbox" id="thinkingToggle">
                  <div class="toggle-sl"></div>
                </div>
              </label>
              <div class="settings-divider"></div>
              <div class="settings-section">Display</div>
              <label class="settings-item">
                <div class="s-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                </div>
                <div class="s-label">
                  <strong>Confidence score</strong>
                  <span>แสดงระดับความมั่นใจ</span>
                </div>
                <div class="toggle-sw">
                  <input type="checkbox" id="confidenceToggle">
                  <div class="toggle-sl"></div>
                </div>
              </label>
              <div class="settings-divider"></div>
              <div class="settings-section">Input</div>
              <label class="settings-item">
                <div class="s-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
                <div class="s-label">
                  <strong>Vision mode</strong>
                  <span>แนบรูปภาพได้</span>
                </div>
                <div class="toggle-sw">
                  <input type="checkbox" id="visionToggle">
                  <div class="toggle-sl"></div>
                </div>
              </label>
            </div>
          </div>
          <button class="hdr-btn" id="themeBtn" title="Toggle dark/light mode">&#127769;</button>
          <button class="hdr-btn" id="closeBtn" title="Close chat">&#10005;</button>
        </div>

        <div class="messages" id="messages">
          <div class="msg assistant">
            <div class="msg-avatar"><svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2l2 7.2L21 12l-7 2L12 22l-2-7.2L3 12l7-2z"/></svg></div>
            <div class="msg-content">
              <div class="bubble">&#x1f44b; สวัสดีครับ — มีอะไรให้ช่วยไหมครับ?</div>
            </div>
          </div>
        </div>

        <div class="input-area">
          <div id="imagePreviewArea"></div>
          <div class="input-row">
            <input type="file" id="fileInput" accept="image/*" style="display:none">
            <button class="mic-btn" id="micBtn" title="Speech to text">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <button class="upload-btn" id="uploadBtn" title="Attach image" style="display:none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </button>
            <textarea id="chatInput" rows="1" placeholder="พิมพ์ข้อความ..."></textarea>
            <button id="sendBtn" title="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div class="powered">Powered by <a href="#" tabindex="-1">ARIX</a></div>
        </div>
      </div>
    `;
  }

  // ── Init widget ──────────────────────────────────────────────────────────────
  function initWidget() {
    if (window.__arixWidgetLoaded) return;
    window.__arixWidgetLoaded = true;

    if (window.marked) marked.setOptions({ breaks: true, gfm: true });

    // Shadow host — sits at fixed position, transparent to pointer events by default
    const host = document.createElement('div');
    host.id = 'arix-chat-widget';
    Object.assign(host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '999999' });
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    shadow.appendChild(styleEl);

    const root = document.createElement('div');
    root.innerHTML = buildHTML();
    shadow.appendChild(root);

    // Re-enable pointer events for interactive elements
    const fab   = shadow.getElementById('fab');
    const popup = shadow.getElementById('popup');
    fab.style.pointerEvents   = 'auto';
    popup.style.pointerEvents = 'auto';

    // ── Refs ──────────────────────────────────────────────────────────────────
    const messagesEl       = shadow.getElementById('messages');
    const inputEl          = shadow.getElementById('chatInput');
    const sendBtn          = shadow.getElementById('sendBtn');
    const thinkingToggle   = shadow.getElementById('thinkingToggle');
    const confidenceToggle = shadow.getElementById('confidenceToggle');
    const visionToggle     = shadow.getElementById('visionToggle');
    const modelLabel       = shadow.getElementById('modelLabel');
    const themeBtn         = shadow.getElementById('themeBtn');
    const closeBtn         = shadow.getElementById('closeBtn');
    const settingsBtn      = shadow.getElementById('settingsBtn');
    const settingsDropdown = shadow.getElementById('settingsDropdown');
    const micBtn           = shadow.getElementById('micBtn');
    const uploadBtn        = shadow.getElementById('uploadBtn');
    const fileInput        = shadow.getElementById('fileInput');
    const imagePreviewArea = shadow.getElementById('imagePreviewArea');
    const unreadBadge      = shadow.getElementById('unreadBadge');

    let pendingImage = null;

    // ── Open / Close ──────────────────────────────────────────────────────────
    let isOpen = false;
    let unread = 0;

    function openPopup() {
      isOpen = true;
      popup.classList.remove('hidden');
      fab.classList.add('open');
      fab.setAttribute('aria-label', 'Close chat');
      unread = 0;
      unreadBadge.style.display = 'none';
      unreadBadge.textContent = '';
      setTimeout(() => inputEl.focus(), 300);
    }

    function closePopup() {
      isOpen = false;
      popup.classList.add('hidden');
      fab.classList.remove('open');
      fab.setAttribute('aria-label', 'Open chat');
    }

    fab.addEventListener('click', () => isOpen ? closePopup() : openPopup());
    closeBtn.addEventListener('click', closePopup);

    // ── Theme ─────────────────────────────────────────────────────────────────
    const savedTheme = localStorage.getItem('arix-theme') || 'light';
    if (savedTheme === 'dark') {
      host.setAttribute('data-theme', 'dark');
      themeBtn.textContent = '\u2600\ufe0f';
    }

    themeBtn.addEventListener('click', () => {
      const isDark = host.getAttribute('data-theme') === 'dark';
      host.setAttribute('data-theme', isDark ? '' : 'dark');
      themeBtn.textContent = isDark ? '\ud83c\udf19' : '\u2600\ufe0f';
      localStorage.setItem('arix-theme', isDark ? 'light' : 'dark');
    });

    // ── Settings dropdown ─────────────────────────────────────────────────────
    function toggleSettings() {
      const open = !settingsDropdown.classList.contains('hidden');
      settingsDropdown.classList.toggle('hidden', open);
      settingsBtn.classList.toggle('active', !open);
    }

    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSettings();
    });

    // Close dropdown when clicking outside inside the shadow DOM
    shadow.addEventListener('click', (e) => {
      if (!settingsBtn.contains(e.target) && !settingsDropdown.contains(e.target)) {
        settingsDropdown.classList.add('hidden');
        settingsBtn.classList.remove('active');
      }
    });

    // ── Thinking toggle ───────────────────────────────────────────────────────
    thinkingToggle.addEventListener('change', () => {
      modelLabel.textContent = thinkingToggle.checked ? 'Thinking mode' : 'Standard mode';
    });

    // ── Vision toggle ─────────────────────────────────────────────────────────
    visionToggle.addEventListener('change', () => {
      uploadBtn.style.display = visionToggle.checked ? 'flex' : 'none';
      if (!visionToggle.checked) clearImage();
    });

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        pendingImage = e.target.result;
        uploadBtn.classList.add('has-image');
        imagePreviewArea.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'image-preview';
        const img = document.createElement('img');
        img.src = pendingImage;
        const rm = document.createElement('button');
        rm.className = 'remove-img';
        rm.textContent = '\u2715';
        rm.onclick = clearImage;
        wrap.append(img, rm);
        imagePreviewArea.appendChild(wrap);
      };
      reader.readAsDataURL(file);
      fileInput.value = '';
    });

    function clearImage() {
      pendingImage = null;
      uploadBtn.classList.remove('has-image');
      imagePreviewArea.innerHTML = '';
    }

    // ── Confidence score ──────────────────────────────────────────────────────
    function estimateConfidence(text, tokenCount) {
      const hedges  = ['อาจ','น่าจะ','คิดว่า','ไม่แน่ใจ','probably','might','perhaps','i think','not sure','unclear','possibly','maybe'];
      const factual = ['คือ','ได้แก่','เท่ากับ','is','are','equals','defined as'];
      const lower = text.toLowerCase();
      const hedgeCount   = hedges.filter(h => lower.includes(h)).length;
      const factualCount = factual.filter(f => lower.includes(f)).length;
      const lengthScore  = Math.min(tokenCount / 30, 1);
      let score = 0.65 + (lengthScore * 0.2) + (factualCount * 0.03) - (hedgeCount * 0.08);
      return Math.max(0.1, Math.min(0.99, score));
    }

    function renderConfidence(text, tokenCount, timeEl) {
      const score = estimateConfidence(text, tokenCount);
      const pct   = Math.round(score * 100);
      const level = pct >= 75 ? 'high' : pct >= 45 ? 'medium' : 'low';
      const label = pct >= 75 ? '\ud83d\udfe2' : pct >= 45 ? '\ud83d\udfe1' : '\ud83d\udd34';
      const badge = document.createElement('span');
      badge.className = 'confidence-badge ' + level;
      badge.innerHTML = '<div class="confidence-bar"><div class="confidence-bar-fill" style="width:0%"></div></div>' + label + ' <strong>' + pct + '%</strong>';
      timeEl.appendChild(badge);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        badge.querySelector('.confidence-bar-fill').style.width = pct + '%';
      }));
    }

    // ── Speech to text ────────────────────────────────────────────────────────
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtn.style.display = 'none';
    } else {
      const recognition = new SR();
      recognition.lang = 'th-TH';
      recognition.interimResults = true;
      recognition.continuous = false;
      let isRecording = false;
      let interimStart = 0;

      micBtn.addEventListener('click', () => isRecording ? recognition.stop() : recognition.start());

      recognition.addEventListener('start', () => {
        isRecording = true;
        micBtn.classList.add('recording');
        micBtn.title = 'กำลังฟัง... คลิกเพื่อหยุด';
        interimStart = inputEl.value.length;
      });

      recognition.addEventListener('result', (e) => {
        let interim = '', final = '';
        for (const r of e.results) {
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        inputEl.value = inputEl.value.slice(0, interimStart) + (final || interim);
        autoResize(inputEl);
      });

      recognition.addEventListener('end', () => {
        isRecording = false;
        micBtn.classList.remove('recording');
        micBtn.title = 'Speech to text';
        inputEl.focus();
      });

      recognition.addEventListener('error', (e) => {
        isRecording = false;
        micBtn.classList.remove('recording');
        if (e.error !== 'aborted') console.warn('[arix-widget] speech error:', e.error);
      });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function nowTime() {
      return new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    }

    function autoResize(el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }

    function scrollBottom() {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function safeParse(md) {
      if (window.DOMPurify && window.marked) {
        return DOMPurify.sanitize(marked.parse(md));
      }
      const d = document.createElement('div');
      d.textContent = md;
      return d.innerHTML;
    }

    // ── DOM builders ──────────────────────────────────────────────────────────
    function createAssistantMessage() {
      const wrap = document.createElement('div');
      wrap.className = 'msg assistant';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2l2 7.2L21 12l-7 2L12 22l-2-7.2L3 12l7-2z"/></svg>';

      const content = document.createElement('div');
      content.className = 'msg-content';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';

      const time = document.createElement('div');
      time.className = 'msg-time';
      time.textContent = nowTime();

      const likeBtn    = document.createElement('button');
      likeBtn.className = 'feedback-btn';
      likeBtn.textContent = '\ud83d\udc4d';
      const dislikeBtn = document.createElement('button');
      dislikeBtn.className = 'feedback-btn';
      dislikeBtn.textContent = '\ud83d\udc4e';

      likeBtn.addEventListener('click', () => {
        likeBtn.classList.toggle('active');
        dislikeBtn.classList.remove('active');
      });
      dislikeBtn.addEventListener('click', () => {
        dislikeBtn.classList.toggle('active');
        likeBtn.classList.remove('active');
      });

      time.append(likeBtn, dislikeBtn);
      content.append(bubble, time);
      wrap.append(avatar, content);
      messagesEl.appendChild(wrap);
      scrollBottom();
      return { content, bubble, time };
    }

    function addUserMessage(text, imageDataUrl) {
      const wrap = document.createElement('div');
      wrap.className = 'msg user';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.textContent = 'U';

      const content = document.createElement('div');
      content.className = 'msg-content';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';

      if (imageDataUrl) {
        const img = document.createElement('img');
        img.src = imageDataUrl;
        img.className = 'chat-img';
        bubble.appendChild(img);
      }
      if (text) {
        const span = document.createElement('span');
        span.textContent = text;
        bubble.appendChild(span);
      }

      const time = document.createElement('div');
      time.className = 'msg-time';
      time.textContent = nowTime();

      content.append(bubble, time);
      wrap.append(avatar, content);
      messagesEl.appendChild(wrap);
      scrollBottom();
    }

    function showTyping() {
      const wrap = document.createElement('div');
      wrap.className = 'msg assistant typing-indicator';

      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar';
      avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M12 2l2 7.2L21 12l-7 2L12 22l-2-7.2L3 12l7-2z"/></svg>';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      for (let i = 0; i < 3; i++) {
        const d = document.createElement('div');
        d.className = 'dot';
        bubble.appendChild(d);
      }

      wrap.append(avatar, bubble);
      messagesEl.appendChild(wrap);
      scrollBottom();
      return wrap;
    }

    function createThinkingBlock(content) {
      const block  = document.createElement('div');
      block.className = 'thinking-block';
      const header = document.createElement('div');
      header.className = 'thinking-header open';
      header.innerHTML = '<span class="thinking-spinner"></span><span>Thinking...</span><span class="chevron">\u25b6</span>';
      const body   = document.createElement('div');
      body.className = 'thinking-body visible';
      header.addEventListener('click', () => {
        header.classList.toggle('open');
        body.classList.toggle('visible');
      });
      block.append(header, body);
      content.insertBefore(block, content.firstChild);
      return { block, header, body };
    }

    function finalizeThinkingBlock(header) {
      header.innerHTML = '<span>\ud83d\udcad</span><span>Reasoning</span><span class="chevron">\u25b6</span>';
      header.classList.remove('open');
      const body = header.nextElementSibling;
      body.style.maxHeight = body.scrollHeight + 'px';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        body.classList.remove('visible');
        body.style.maxHeight = '';
      }));
    }

    // ── Send message ──────────────────────────────────────────────────────────
    async function sendMessage() {
      const text = inputEl.value.trim();
      if (!text) return;

      inputEl.value = '';
      autoResize(inputEl);
      sendBtn.disabled = true;

      const useThinking   = thinkingToggle.checked;
      const useConfidence = confidenceToggle.checked;
      const imageToSend   = pendingImage;
      clearImage();

      addUserMessage(text, imageToSend);
      const typing = showTyping();

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

        const res = await fetch(API_URL, {
          method:  'POST',
          headers,
          body: JSON.stringify({ message: text, thinking: useThinking, confidence: useConfidence, image: imageToSend || '' }),
        });

        if (!res.ok || !res.body) throw new Error('Server error');

        typing.remove();
        const { content, bubble, time } = createAssistantMessage();
        bubble.classList.add('streaming');

        let thinkingEl  = null;
        let isThinking  = false;
        let fullContent = '';
        let tokenCount  = 0;
        let toolBadges  = [];

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '', lastEvent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (line.startsWith('event:')) {
              lastEvent = line.slice(6).trim();
              continue;
            }
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();

            if (lastEvent === 'tool_use') {
              lastEvent = '';
              try {
                const { name } = JSON.parse(raw);
                const badge = document.createElement('div');
                badge.className = 'tool-badge';
                badge.innerHTML = '<span class="tool-spinner"></span> \u0e01\u0e33\u0e25\u0e31\u0e07\u0e43\u0e0a\u0e49 <strong>' + name + '</strong>';
                content.insertBefore(badge, bubble);
                toolBadges.push(badge);
                scrollBottom();
              } catch (_) {}
              continue;
            }

            if (lastEvent === 'error') {
              lastEvent = '';
              bubble.textContent = 'Error from server.';
              bubble.classList.remove('streaming');
              continue;
            }

            lastEvent = '';

            if (raw === '[DONE]') {
              if (thinkingEl) finalizeThinkingBlock(thinkingEl.header);
              toolBadges.forEach(b => b.remove());
              toolBadges = [];
              bubble.classList.remove('streaming');
              bubble.innerHTML = safeParse(fullContent);
              if (useConfidence && tokenCount > 0) {
                renderConfidence(fullContent, tokenCount, time);
              }
              if (!isOpen) {
                unread++;
                unreadBadge.textContent = unread > 9 ? '9+' : unread;
                unreadBadge.style.display = 'flex';
              }
              break;
            }

            try {
              const json  = JSON.parse(raw);
              const delta = json.choices?.[0]?.delta;
              if (!delta) continue;

              const reasoning = delta.reasoning ?? delta.reasoning_content;
              if (reasoning) {
                if (!thinkingEl) thinkingEl = createThinkingBlock(content);
                thinkingEl.body.textContent += reasoning;
                thinkingEl.body.scrollTop = thinkingEl.body.scrollHeight;
                scrollBottom();
              }

              const chunk = delta.content;
              if (chunk) {
                if (thinkingEl && isThinking) {
                  finalizeThinkingBlock(thinkingEl.header);
                  isThinking = false;
                }
                fullContent += fullContent === '' ? chunk.trimStart() : chunk;
                tokenCount++;
                bubble.innerHTML = safeParse(fullContent);
                scrollBottom();
              }

              if (reasoning && !isThinking) isThinking = true;
            } catch (_) {}
          }
        }
      } catch (err) {
        typing.remove();
        const { bubble } = createAssistantMessage();
        bubble.textContent = '\u0e44\u0e21\u0e48\u0e2a\u0e32\u0e21\u0e32\u0e23\u0e16\u0e40\u0e0a\u0e37\u0e48\u0e2d\u0e21\u0e15\u0e48\u0e2d\u0e01\u0e31\u0e1a\u0e40\u0e0b\u0e34\u0e23\u0e4c\u0e1f\u0e40\u0e27\u0e2d\u0e23\u0e4c\u0e44\u0e14\u0e49';
      } finally {
        sendBtn.disabled = false;
        inputEl.focus();
      }
    }

    // ── Events ────────────────────────────────────────────────────────────────
    sendBtn.addEventListener('click', sendMessage);

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    inputEl.addEventListener('input', () => autoResize(inputEl));
  }
})();
