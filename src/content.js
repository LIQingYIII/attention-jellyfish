(() => {
  if (window.__attentionJellyfishLoaded) return;
  window.__attentionJellyfishLoaded = true;

  const TOPIC_RULES = [
    ["户外 / 露营", ["露营", "户外", "帐篷", "徒步", "登山", "营地", "天幕", "睡袋", "防潮垫", "冲锋衣"]],
    ["旅行", ["旅行", "旅游", "攻略", "酒店", "民宿", "景点", "机票", "周末去哪", "citywalk", "出发"]],
    ["摄影", ["摄影", "拍照", "相机", "镜头", "构图", "调色", "胶片", "写真"]],
    ["美食", ["美食", "探店", "餐厅", "食谱", "烘焙", "咖啡", "火锅", "料理", "好吃"]],
    ["家居", ["家居", "装修", "收纳", "软装", "家具", "卧室", "客厅", "租房改造"]],
    ["穿搭", ["穿搭", "搭配", "OOTD", "女装", "男装", "鞋", "包包", "时尚"]],
    ["美妆 / 护肤", ["护肤", "美妆", "彩妆", "口红", "防晒", "面膜", "粉底", "香水"]],
    ["运动 / 健康", ["健身", "运动", "跑步", "瑜伽", "减脂", "增肌", "健康", "训练"]],
    ["数码 / AI", ["数码", "手机", "电脑", "AI", "人工智能", "大模型", "软件", "效率工具", "耳机"]],
    ["职场 / 学习", ["职场", "工作", "求职", "面试", "简历", "学习", "考研", "留学", "读书"]],
    ["宠物", ["宠物", "猫", "狗", "小猫", "小狗", "养猫", "养狗"]],
    ["影视 / 娱乐", ["电影", "电视剧", "综艺", "明星", "演唱会", "音乐", "追剧"]],
    ["情感 / 生活", ["情感", "恋爱", "生活", "成长", "日常", "关系", "独居"]]
  ];

  const PET_CELL = { width: 96, height: 104 };
  const PET_ANIMATIONS = {
    idle: { row: 0, frames: 6, interval: 620 },
    waving: { row: 3, frames: 4, interval: 420 },
    failed: { row: 5, frames: 8, interval: 500 },
    waiting: { row: 6, frames: 6, interval: 560 },
    running: { row: 7, frames: 6, interval: 360 },
    review: { row: 8, frames: 6, interval: 500 }
  };

  const state = {
    visible: true,
    recording: true,
    activeSeconds: 0,
    flushedSeconds: 0,
    videoSeconds: 0,
    lastSignature: "",
    current: null,
    meaningfulSignal: false,
    signals: { expanded: false, video: false, liked: false, collected: false, comments: false },
    focused: document.visibilityState === "visible" && document.hasFocus(),
    panelOpen: false,
    recent: [],
    petMode: "idle",
    petFrame: 0,
    petTimer: null,
    petReturnMode: "idle",
    host: null,
    shadow: null
  };

  const shadowStyles = `
    :host { all: initial; color-scheme: light; }
    * { box-sizing: border-box; }
    .aj-root {
      --aj-body-a: #dff6ff;
      --aj-body-b: #a8ddff;
      --aj-body-c: #a9a7f6;
      --aj-deep: #676fc4;
      --aj-ink: #24334f;
      --aj-muted: #71809b;
      --aj-surface: rgba(248, 252, 255, .94);
      --aj-line: rgba(121, 151, 196, .18);
      --aj-drift: 4px;
      --aj-tempo: 4.8s;
      --aj-saturation: .82;
      --aj-contrast: .96;
      position: fixed;
      top: 84px;
      right: 24px;
      z-index: 2147483646;
      font-family: "PingFang SC", "Hiragino Sans GB", sans-serif;
      color: var(--aj-ink);
    }
    .aj-root[hidden] { display: none !important; }
    .aj-orb {
      width: 96px;
      height: 104px;
      position: relative;
      border: 0;
      padding: 0;
      background: transparent;
      cursor: pointer;
      filter: drop-shadow(0 14px 18px rgba(102, 130, 189, .22));
      animation: aj-float var(--aj-tempo) cubic-bezier(.45, 0, .55, 1) infinite alternate;
      transition: filter .35s ease, transform .35s cubic-bezier(.22, 1, .36, 1);
    }
    .aj-orb:hover { filter: drop-shadow(0 18px 22px rgba(102, 130, 189, .3)); transform: translateY(-2px) scale(1.025); }
    .aj-orb:focus-visible { outline: 3px solid rgba(103, 111, 196, .42); outline-offset: 5px; border-radius: 44px; }
    .aj-mascot {
      position: absolute;
      inset: 0;
      display: block;
      width: 96px;
      height: 104px;
      background-image: url("${chrome.runtime.getURL("assets/pet/xiaolan-spritesheet-v2.webp")}");
      background-repeat: no-repeat;
      background-size: 768px 1144px;
      background-position: 0 0;
      pointer-events: none;
      transform-origin: 50% 58%;
      filter: saturate(var(--aj-saturation)) contrast(var(--aj-contrast));
      transition: filter .7s ease;
    }
    .aj-status-dot {
      position: absolute;
      right: 3px;
      top: 5px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #a8ddff;
      border: 2px solid rgba(255,255,255,.9);
      box-shadow: 0 0 0 3px rgba(168,221,255,.2);
    }
    .aj-panel {
      position: absolute;
      top: 4px;
      right: 103px;
      width: min(354px, calc(100vw - 132px));
      min-height: 330px;
      max-height: min(560px, calc(100vh - 96px));
      padding: 22px;
      border-radius: 22px;
      overflow: auto;
      background: var(--aj-surface);
      border: 1px solid rgba(255,255,255,.9);
      box-shadow: 0 24px 64px rgba(45, 67, 107, .18), 0 3px 10px rgba(45, 67, 107, .08);
      backdrop-filter: blur(24px) saturate(1.1);
      opacity: 0;
      visibility: hidden;
      transform: translateX(10px) scale(.97);
      transform-origin: top right;
      transition: opacity .22s ease, visibility .22s ease, transform .32s cubic-bezier(.22,1,.36,1);
    }
    .aj-root[data-panel="open"] .aj-panel { opacity: 1; visibility: visible; transform: none; }
    .aj-kicker { color: var(--aj-muted); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; }
    .aj-header { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin: 7px 0 20px; }
    .aj-title { margin: 0; font-size: 22px; line-height: 1.25; font-weight: 650; letter-spacing: -.03em; }
    .aj-close { width: 30px; height: 30px; border: 0; border-radius: 50%; color: var(--aj-muted); background: rgba(110,139,182,.09); cursor: pointer; font-size: 20px; line-height: 1; }
    .aj-close:hover { color: var(--aj-ink); background: rgba(110,139,182,.15); }
    .aj-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 20px; }
    .aj-metric { padding: 12px 10px; border-radius: 15px; background: rgba(216, 239, 252, .48); border: 1px solid rgba(132,164,204,.12); }
    .aj-metric-value { display: block; font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
    .aj-metric-label { display: block; margin-top: 3px; color: var(--aj-muted); font-size: 10px; }
    .aj-section-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 12px; color: var(--aj-muted); }
    .aj-timeline { position: relative; display: grid; gap: 8px; margin: 0 0 20px; padding-left: 15px; }
    .aj-timeline::before { content: ""; position: absolute; left: 3px; top: 8px; bottom: 8px; width: 1px; background: var(--aj-line); }
    .aj-event { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 26px; font-size: 13px; }
    .aj-event::before { content: ""; position: absolute; left: -15px; top: 10px; width: 7px; height: 7px; border-radius: 50%; background: #a9a7f6; box-shadow: 0 0 0 4px rgba(169,167,246,.13); }
    .aj-event-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .aj-event-time { color: var(--aj-muted); font-size: 11px; flex: 0 0 auto; font-variant-numeric: tabular-nums; }
    .aj-empty { padding: 20px 0 22px; color: var(--aj-muted); font-size: 13px; line-height: 1.7; text-align: center; }
    .aj-report { width: 100%; min-height: 44px; border: 0; border-radius: 14px; color: white; background: #676fc4; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: 0 8px 18px rgba(103,111,196,.24); transition: transform .18s ease, box-shadow .18s ease; }
    .aj-report:hover { transform: translateY(-1px); box-shadow: 0 11px 23px rgba(103,111,196,.29); }
    .aj-report:active { transform: translateY(1px); }
    .aj-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; color: var(--aj-muted); font-size: 11px; }
    .aj-hide { border: 0; padding: 5px 0; color: var(--aj-muted); background: none; font: inherit; cursor: pointer; }
    .aj-hide:hover { color: var(--aj-ink); }
    @keyframes aj-float { from { translate: 0 calc(var(--aj-drift) * -.45); rotate: -1deg; } to { translate: calc(var(--aj-drift) * .35) var(--aj-drift); rotate: 1.4deg; } }
    @media (max-width: 720px) { .aj-root { right: 12px; top: 72px; } .aj-panel { right: 0; top: 110px; width: calc(100vw - 24px); } }
    @media (prefers-reduced-motion: reduce) { .aj-orb { animation: none !important; } .aj-panel { transition-duration: .01ms; } }
  `;

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response || { ok: false });
        });
      } catch (error) {
        resolve({ ok: false, error: error.message });
      }
    });
  }

  function textFrom(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element?.textContent?.replace(/\s+/g, " ").trim();
      if (text && text.length > 1) return text;
    }
    return "";
  }

  function metaContent(selector) {
    return document.querySelector(selector)?.getAttribute("content")?.trim() || "";
  }

  function extractTags(text) {
    const fromLinks = [...document.querySelectorAll('a[href*="search_result"], a[href*="keyword"], [class*="tag"]')]
      .map((node) => node.textContent?.trim())
      .filter((value) => value && value.length <= 40);
    const fromText = (text.match(/#[^#\s，。！？、]{2,30}/g) || []).map((value) => value.replace(/^#/, ""));
    return Array.from(new Set([...fromLinks, ...fromText].map((value) => value.replace(/^#/, "").trim()).filter(Boolean))).slice(0, 30);
  }

  function inferTopic(tags, title, content) {
    const source = `${tags.join(" ")} ${title} ${content.slice(0, 1500)}`.toLowerCase();
    const matches = TOPIC_RULES.map(([topic, words]) => ({
      topic,
      score: words.reduce((sum, word) => sum + (source.includes(word.toLowerCase()) ? (tags.some((tag) => tag.includes(word)) ? 4 : 1) : 0), 0)
    })).sort((a, b) => b.score - a.score);
    if (matches[0]?.score > 0) return matches[0].topic;
    const firstTag = tags.find((tag) => tag.length >= 2 && tag.length <= 14);
    return firstTag || "暂未识别";
  }

  function captureCurrentContent() {
    const title = metaContent('meta[property="og:title"]') || textFrom([
      "#detail-title", ".note-content .title", '[class*="note"] [class*="title"]', "h1"
    ]) || document.title.replace(/\s*[–—-]\s*小红书.*$/, "");
    const content = textFrom([
      "#detail-desc", ".note-content .desc", ".note-content", '[class*="note-content"]', '[class*="detail"] [class*="desc"]'
    ]);
    const tags = extractTags(`${title} ${content}`);
    const author = textFrom([
      ".author-wrapper .name", '[class*="author"] [class*="name"]', '[class*="user"] [class*="name"]'
    ]);
    const cover = metaContent('meta[property="og:image"]');
    const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href.split("#")[0];
    const meaningful = title.length > 2 && (content.length > 15 || tags.length > 0 || /\/explore\//.test(location.pathname));
    if (!meaningful) return null;
    return { url: canonical, title, content, tags, author, cover, topic: inferTopic(tags, title, content), topicSource: "system" };
  }

  function resetSession(next) {
    flushVisit(true);
    state.current = next;
    state.lastSignature = next ? `${next.url}|${next.title}` : "";
    state.activeSeconds = 0;
    state.flushedSeconds = 0;
    state.videoSeconds = 0;
    state.meaningfulSignal = false;
    state.signals = { expanded: false, video: false, liked: false, collected: false, comments: false };
  }

  async function flushVisit(force = false) {
    if (!state.recording || !state.current) return;
    const delta = Math.max(0, state.activeSeconds - state.flushedSeconds);
    const qualifies = state.activeSeconds >= 5 || state.meaningfulSignal || state.videoSeconds >= 5;
    if (!qualifies || (!force && delta < 10 && !state.meaningfulSignal)) return;
    state.signals.video = state.signals.video || state.videoSeconds >= 5;
    const response = await send({
      type: "RECORD_VISIT",
      payload: {
        ...state.current,
        viewedAt: Date.now(),
        activeSeconds: delta,
        signals: { ...state.signals }
      }
    });
    if (response.ok) {
      state.flushedSeconds = state.activeSeconds;
      state.meaningfulSignal = false;
      refreshRecent();
    }
  }

  function inspectPage() {
    const next = captureCurrentContent();
    const signature = next ? `${next.url}|${next.title}` : "";
    if (signature !== state.lastSignature) resetSession(next);
  }

  function markSignal(key) {
    state.signals[key] = true;
    state.meaningfulSignal = true;
    flushVisit();
  }

  function watchInteractions() {
    document.addEventListener("click", (event) => {
      const target = event.target?.closest?.("button, a, [role='button'], [class]");
      if (!target) return;
      const value = `${target.textContent || ""} ${target.className || ""}`.toLowerCase();
      if (/展开|more|expand/.test(value)) markSignal("expanded");
      if (/点赞|like|liked/.test(value)) markSignal("liked");
      if (/收藏|collect|favorite/.test(value)) markSignal("collected");
      if (/评论|comment/.test(value)) markSignal("comments");
      setTimeout(inspectPage, 650);
    }, true);

    document.addEventListener("play", (event) => {
      if (event.target instanceof HTMLVideoElement) state.videoSeconds = 0;
    }, true);
  }

  function minuteLabel(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
  }

  function summarizeRecent(visits) {
    const events = visits.flatMap((visit) => (visit.events || [{ at: visit.lastViewedAt, topic: visit.topic, seconds: visit.activeSeconds }])
      .filter((event) => event.at >= Date.now() - 15 * 60 * 1000)
      .map((event) => ({ ...event, topic: visit.topicSource === "user" ? visit.topic : event.topic || visit.topic }))
    ).sort((a, b) => a.at - b.at);
    const topicSeconds = new Map();
    events.forEach((event) => topicSeconds.set(event.topic, (topicSeconds.get(event.topic) || 0) + Math.max(1, event.seconds || 0)));
    const totalSeconds = [...topicSeconds.values()].reduce((sum, value) => sum + value, 0);
    const topics = [...topicSeconds.entries()].sort((a, b) => b[1] - a[1]);
    const switches = events.reduce((count, event, index) => count + (index > 0 && event.topic !== events[index - 1].topic ? 1 : 0), 0);
    const diversity = topics.length <= 1 || totalSeconds <= 0 ? 0 : Math.min(1, -topics.reduce((sum, [, seconds]) => {
      const p = seconds / totalSeconds;
      return sum + p * Math.log(p);
    }, 0) / Math.log(Math.min(topics.length, 6)));
    const intensity = Math.min(1, events.length / 12 + totalSeconds / 900);
    const switchRate = Math.min(1, switches / 6);
    return { events, topics, totalSeconds, switches, diversity, intensity, switchRate };
  }

  function renderPetFrame() {
    const sprite = state.shadow?.querySelector(".aj-mascot");
    const root = state.shadow?.querySelector(".aj-root");
    const animation = PET_ANIMATIONS[state.petMode] || PET_ANIMATIONS.idle;
    if (!sprite || !root) return;
    sprite.style.backgroundPosition = `${-state.petFrame * PET_CELL.width}px ${-animation.row * PET_CELL.height}px`;
    root.dataset.pet = state.petMode;
  }

  function playPet(mode, options = {}) {
    const animation = PET_ANIMATIONS[mode] || PET_ANIMATIONS.idle;
    const once = options.once === true;
    if (state.petTimer) clearInterval(state.petTimer);
    state.petTimer = null;
    state.petMode = mode in PET_ANIMATIONS ? mode : "idle";
    state.petFrame = 0;
    state.petReturnMode = options.returnTo || state.petReturnMode || "idle";
    renderPetFrame();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    state.petTimer = setInterval(() => {
      state.petFrame += 1;
      if (state.petFrame >= animation.frames) {
        if (once) {
          playPet(state.petReturnMode);
          return;
        }
        state.petFrame = 0;
      }
      renderPetFrame();
    }, animation.interval);
  }

  function attentionPetMode(summary) {
    if (state.panelOpen) return "review";
    if (!summary.events.length) return "idle";
    return summary.switchRate >= 0.45 || summary.diversity >= 0.58 ? "running" : "idle";
  }

  function applyJellyfishState(summary) {
    if (!state.shadow) return;
    const root = state.shadow.querySelector(".aj-root");
    root.style.setProperty("--aj-saturation", `${0.82 + summary.diversity * 0.48}`);
    root.style.setProperty("--aj-contrast", `${0.96 + summary.diversity * 0.12}`);
    root.style.setProperty("--aj-drift", `${4 + summary.switchRate * 18}px`);
    root.style.setProperty("--aj-tempo", `${Math.max(2.1, 5.4 - summary.intensity * 2.7)}s`);
    const nextMode = attentionPetMode(summary);
    if (nextMode !== state.petMode) playPet(nextMode);
  }

  function renderPanel() {
    if (!state.shadow) return;
    const summary = summarizeRecent(state.recent);
    applyJellyfishState(summary);
    const timeline = state.shadow.querySelector(".aj-timeline");
    const totalMinutes = Math.round(summary.totalSeconds / 60);
    state.shadow.querySelector('[data-value="time"]').textContent = `${totalMinutes}m`;
    state.shadow.querySelector('[data-value="topics"]').textContent = String(summary.topics.length);
    state.shadow.querySelector('[data-value="switches"]').textContent = String(summary.switches);
    if (!summary.events.length) {
      timeline.innerHTML = '<div class="aj-empty">浏览一篇内容超过5秒后，<br>这里会出现注意力轨迹。</div>';
      return;
    }
    const compact = [];
    summary.events.forEach((event) => {
      const previous = compact[compact.length - 1];
      if (previous?.topic === event.topic) {
        previous.seconds += event.seconds || 0;
        previous.at = event.at;
      } else compact.push({ ...event, seconds: event.seconds || 0 });
    });
    timeline.innerHTML = compact.slice(-6).reverse().map((event) => `
      <div class="aj-event">
        <span class="aj-event-name">${escapeHtml(event.topic)}</span>
        <span class="aj-event-time">${minuteLabel(event.at)} · ${Math.max(1, Math.round(event.seconds / 60))}m</span>
      </div>
    `).join("");
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[character]));
  }

  async function refreshRecent() {
    const response = await send({ type: "GET_RECENT", minutes: 15 });
    if (response.ok) {
      state.recent = response.data || [];
      renderPanel();
    }
  }

  function createJellyfish() {
    const host = document.createElement("div");
    host.id = "attention-jellyfish-host";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>${shadowStyles}</style>
      <div class="aj-root" data-panel="closed">
        <button class="aj-orb" type="button" aria-label="打开最近15分钟注意力轨迹" aria-expanded="false">
          <span class="aj-mascot" aria-hidden="true"></span>
          <span class="aj-status-dot" title="正在本地记录"></span>
        </button>
        <section class="aj-panel" aria-label="最近15分钟注意力轨迹">
          <div class="aj-kicker">Attention flow</div>
          <div class="aj-header">
            <h2 class="aj-title">最近15分钟</h2>
            <button class="aj-close" type="button" aria-label="关闭">×</button>
          </div>
          <div class="aj-metrics">
            <div class="aj-metric"><strong class="aj-metric-value" data-value="time">0m</strong><span class="aj-metric-label">有效浏览</span></div>
            <div class="aj-metric"><strong class="aj-metric-value" data-value="topics">0</strong><span class="aj-metric-label">经过主题</span></div>
            <div class="aj-metric"><strong class="aj-metric-value" data-value="switches">0</strong><span class="aj-metric-label">主题切换</span></div>
          </div>
          <div class="aj-section-title"><span>注意力轨迹</span><span>仅保存在本地</span></div>
          <div class="aj-timeline"></div>
          <button class="aj-report" type="button">打开今日日报</button>
          <div class="aj-footer"><span>记录状态：正在记录</span><button class="aj-hide" type="button">隐藏水母</button></div>
        </section>
      </div>
    `;
    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;

    const root = shadow.querySelector(".aj-root");
    const orb = shadow.querySelector(".aj-orb");
    const close = shadow.querySelector(".aj-close");
    orb.addEventListener("click", () => {
      state.panelOpen = !state.panelOpen;
      root.dataset.panel = state.panelOpen ? "open" : "closed";
      orb.setAttribute("aria-expanded", String(state.panelOpen));
      if (state.panelOpen) {
        playPet("review");
        refreshRecent();
      } else {
        applyJellyfishState(summarizeRecent(state.recent));
      }
    });
    orb.addEventListener("mouseenter", () => {
      if (!state.panelOpen) playPet("waving", { once: true, returnTo: attentionPetMode(summarizeRecent(state.recent)) });
    });
    close.addEventListener("click", () => {
      state.panelOpen = false;
      root.dataset.panel = "closed";
      orb.setAttribute("aria-expanded", "false");
      applyJellyfishState(summarizeRecent(state.recent));
    });
    shadow.querySelector(".aj-report").addEventListener("click", () => {
      send({ type: "OPEN_REPORT" });
    });
    shadow.querySelector(".aj-hide").addEventListener("click", async () => {
      state.visible = false;
      root.hidden = true;
      await send({ type: "SET_SETTINGS", settings: { jellyfishVisible: false } });
    });
    renderPanel();
    playPet("waving", { once: true, returnTo: "idle" });
  }

  function setVisible(visible) {
    state.visible = visible;
    const root = state.shadow?.querySelector(".aj-root");
    if (root) root.hidden = !visible;
    send({ type: "SET_SETTINGS", settings: { jellyfishVisible: visible } });
  }

  async function initialize() {
    const response = await send({ type: "GET_SETTINGS" });
    if (response.ok) {
      state.visible = response.data.jellyfishVisible !== false;
      state.recording = response.data.recordingEnabled !== false;
    }
    createJellyfish();
    setVisible(state.visible);
    inspectPage();
    watchInteractions();
    refreshRecent();

    const observer = new MutationObserver(() => {
      clearTimeout(observer.timer);
      observer.timer = setTimeout(inspectPage, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(() => {
      state.focused = document.visibilityState === "visible" && document.hasFocus();
      if (state.focused && state.current) {
        state.activeSeconds += 1;
        const playing = [...document.querySelectorAll("video")].some((video) => !video.paused && !video.ended && video.readyState >= 2);
        if (playing) state.videoSeconds += 1;
      }
      flushVisit();
    }, 1000);
    setInterval(refreshRecent, 15000);
  }

  window.addEventListener("focus", () => { state.focused = true; });
  window.addEventListener("blur", () => { state.focused = false; flushVisit(true); });
  document.addEventListener("visibilitychange", () => {
    state.focused = document.visibilityState === "visible" && document.hasFocus();
    if (!state.focused) flushVisit(true);
  });
  window.addEventListener("beforeunload", () => flushVisit(true));

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TOGGLE_JELLYFISH") {
      setVisible(!state.visible);
      sendResponse({ ok: true, visible: state.visible });
    }
    if (message?.type === "APPLY_SETTINGS") {
      if (typeof message.settings?.jellyfishVisible === "boolean") {
        state.visible = message.settings.jellyfishVisible;
        const root = state.shadow?.querySelector(".aj-root");
        if (root) root.hidden = !state.visible;
      }
      if (typeof message.settings?.recordingEnabled === "boolean") state.recording = message.settings.recordingEnabled;
      sendResponse({ ok: true });
    }
  });

  initialize();
})();
