(() => {
  const DAY_MS = 86400000;
  const state = {
    mode: "day",
    selectedDate: new Date(),
    allVisits: [],
    periodVisits: [],
    topicFilter: "全部",
    search: ""
  };

  const elements = {
    title: document.querySelector("#report-title"),
    date: document.querySelector("#report-date"),
    label: document.querySelector("#report-label"),
    summary: document.querySelector("#neutral-summary"),
    metricTime: document.querySelector("#metric-time"),
    metricTimeNote: document.querySelector("#metric-time-note"),
    metricTopics: document.querySelector("#metric-topics"),
    metricTopicNote: document.querySelector("#metric-topic-note"),
    metricArticles: document.querySelector("#metric-articles"),
    topicChart: document.querySelector("#topic-chart"),
    changeContent: document.querySelector("#change-content"),
    filters: document.querySelector("#topic-filters"),
    articleList: document.querySelector("#article-list"),
    search: document.querySelector("#article-search"),
    previous: document.querySelector("#previous-period"),
    next: document.querySelector("#next-period"),
    aiLauncher: document.querySelector("#ai-launcher"),
    aiPanel: document.querySelector("#ai-panel"),
    aiConversation: document.querySelector("#ai-conversation"),
    aiForm: document.querySelector("#ai-form"),
    aiInput: document.querySelector("#ai-input"),
    aiSubmit: document.querySelector("#ai-submit"),
    settings: document.querySelector("#settings-dialog")
  };

  function send(message) {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      if (message.type === "GET_SETTINGS") return Promise.resolve({ ok: true, data: { jellyfishVisible: true, recordingEnabled: true } });
      if (message.type === "GET_VISITS") return Promise.resolve({ ok: true, data: [] });
      return Promise.resolve({ ok: true });
    }
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(response || { ok: false });
      });
    });
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function startOfWeek(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = result.getDay() || 7;
    result.setDate(result.getDate() - weekday + 1);
    return result.getTime();
  }

  function rangeFor(date = state.selectedDate, mode = state.mode) {
    const since = mode === "week" ? startOfWeek(date) : startOfDay(date);
    return { since, until: since + (mode === "week" ? 7 : 1) * DAY_MS - 1 };
  }

  function isToday(date) {
    return startOfDay(date) === startOfDay(new Date());
  }

  function duration(seconds) {
    const value = Math.max(0, Math.round(Number(seconds || 0)));
    if (value < 60) return value ? `${value}秒` : "0分钟";
    const minutes = Math.round(value / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}小时${remainder}分` : `${hours}小时`;
  }

  function groupTopics(visits) {
    const map = new Map();
    visits.forEach((visit) => {
      const topic = visit.topic || "暂未识别";
      const current = map.get(topic) || { topic, seconds: 0, count: 0 };
      current.seconds += Number(visit.activeSeconds || 0);
      current.count += 1;
      map.set(topic, current);
    });
    return [...map.values()].sort((a, b) => b.seconds - a.seconds || b.count - a.count);
  }

  function formatDateRange() {
    const { since, until } = rangeFor();
    const formatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" });
    if (state.mode === "day") return formatter.format(since);
    const short = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" });
    return `${short.format(since)} — ${short.format(until)}`;
  }

  function neutralSummary(visits, previousVisits) {
    if (!visits.length) return "这段时间还没有有效浏览记录。水母会继续安静地等待，不作任何判断。";
    const topics = groupTopics(visits);
    const total = topics.reduce((sum, item) => sum + item.seconds, 0);
    const leading = topics.slice(0, 3).map((item) => `“${item.topic}”${duration(item.seconds)}`).join("、");
    const previous = groupTopics(previousVisits);
    const previousMap = new Map(previous.map((item) => [item.topic, item.seconds]));
    const changed = topics.map((item) => ({ ...item, delta: item.seconds - (previousMap.get(item.topic) || 0) })).sort((a, b) => b.delta - a.delta)[0];
    const changeCopy = changed && changed.delta > 60
      ? `与前一个${state.mode === "day" ? "时段" : "星期"}相比，“${changed.topic}”出现得更多。`
      : "与前一个时段相比，主题分布没有明显变化。";
    return `注意力共经过${topics.length}个主题，有效停留${duration(total)}，主要流向${leading}。${changeCopy}`;
  }

  function renderHeader() {
    const today = isToday(state.selectedDate);
    elements.label.textContent = state.mode === "day" ? "DAILY ATTENTION FLOW" : "WEEKLY ATTENTION FLOW";
    elements.title.textContent = state.mode === "day"
      ? (today ? "今天的注意力流向" : "这一天的注意力流向")
      : "这一周的注意力流向";
    elements.date.textContent = `${formatDateRange()} · 本地时区`;
    const range = rangeFor();
    elements.next.disabled = range.until >= Date.now();
  }

  function renderMetrics(visits) {
    const topics = groupTopics(visits);
    const seconds = visits.reduce((sum, visit) => sum + Number(visit.activeSeconds || 0), 0);
    elements.metricTime.textContent = duration(seconds);
    elements.metricTimeNote.textContent = state.mode === "day" ? "这一天的有效停留" : "这一周的有效停留";
    elements.metricTopics.textContent = `${topics.length}个`;
    elements.metricTopicNote.textContent = topics[0] ? `停留最多：${topics[0].topic}` : "等待记录";
    elements.metricArticles.textContent = `${visits.length}篇`;
  }

  function renderTopicChart(visits) {
    const topics = groupTopics(visits).slice(0, 7);
    elements.topicChart.replaceChildren();
    if (!topics.length) {
      elements.topicChart.append(document.querySelector("#empty-template").content.cloneNode(true));
      return;
    }
    const max = Math.max(...topics.map((topic) => topic.seconds), 1);
    topics.forEach((topic, index) => {
      const row = document.createElement("div");
      row.className = "topic-row";
      const name = document.createElement("span");
      name.className = "topic-name";
      name.textContent = topic.topic;
      const track = document.createElement("div");
      track.className = "topic-track";
      const bar = document.createElement("div");
      bar.className = "topic-bar";
      bar.style.width = `${Math.max(2, topic.seconds / max * 100)}%`;
      bar.style.animationDelay = `${index * 55}ms`;
      track.append(bar);
      const time = document.createElement("span");
      time.className = "topic-time";
      time.textContent = duration(topic.seconds);
      row.append(name, track, time);
      elements.topicChart.append(row);
    });
  }

  function renderChanges(visits, previousVisits) {
    const current = groupTopics(visits);
    const previous = new Map(groupTopics(previousVisits).map((item) => [item.topic, item.seconds]));
    const changes = current.map((item) => ({ ...item, delta: item.seconds - (previous.get(item.topic) || 0) }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
    elements.changeContent.replaceChildren();
    if (!changes.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const title = document.createElement("h3");
      title.textContent = "等待形成变化";
      const copy = document.createElement("p");
      copy.textContent = "有了两个时段的记录后，这里会中性地描述兴趣变化。";
      empty.append(title, copy);
      elements.changeContent.append(empty);
      return;
    }
    changes.forEach((change) => {
      const item = document.createElement("div");
      item.className = "change-item";
      const heading = document.createElement("div");
      heading.className = "change-topic";
      const name = document.createElement("span");
      name.textContent = change.topic;
      const delta = document.createElement("span");
      delta.className = "change-delta";
      delta.textContent = change.delta === 0 ? "与此前接近" : `${change.delta > 0 ? "多" : "少"}${duration(Math.abs(change.delta))}`;
      const copy = document.createElement("p");
      copy.className = "change-copy";
      copy.textContent = change.delta > 0
        ? `这个主题在当前时段出现得比此前更多。`
        : change.delta < 0 ? `这个主题在当前时段出现得比此前少。` : "停留时间与此前接近。";
      heading.append(name, delta);
      item.append(heading, copy);
      elements.changeContent.append(item);
    });
  }

  function renderFilters(visits) {
    const topics = ["全部", ...groupTopics(visits).map((item) => item.topic)];
    if (!topics.includes(state.topicFilter)) state.topicFilter = "全部";
    elements.filters.replaceChildren();
    topics.forEach((topic) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-chip${topic === state.topicFilter ? " is-active" : ""}`;
      button.textContent = topic;
      button.addEventListener("click", () => {
        state.topicFilter = topic;
        renderFilters(state.periodVisits);
        renderArticles(state.periodVisits);
      });
      elements.filters.append(button);
    });
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(timestamp);
  }

  function filteredVisits(visits) {
    const query = state.search.toLowerCase();
    return visits.filter((visit) => {
      if (state.topicFilter !== "全部" && visit.topic !== state.topicFilter) return false;
      if (!query) return true;
      return [visit.title, visit.author, visit.topic, ...(visit.tags || []), visit.content].join(" ").toLowerCase().includes(query);
    });
  }

  function renderArticles(visits) {
    const selected = filteredVisits(visits);
    elements.articleList.replaceChildren();
    if (!selected.length) {
      elements.articleList.append(document.querySelector("#empty-template").content.cloneNode(true));
      return;
    }
    selected.forEach((visit) => {
      const card = document.createElement("article");
      card.className = "article-card";
      const cover = document.createElement("div");
      cover.className = `article-cover${visit.cover ? "" : " is-empty"}`;
      if (visit.cover) {
        const image = document.createElement("img");
        image.src = visit.cover;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => { image.remove(); cover.classList.add("is-empty"); });
        cover.append(image);
      }
      const copy = document.createElement("div");
      copy.className = "article-copy";
      const heading = document.createElement("h3");
      const link = document.createElement("a");
      link.href = visit.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = visit.title || "未命名内容";
      heading.append(link);
      const meta = document.createElement("div");
      meta.className = "article-meta";
      [visit.author, formatTime(visit.lastViewedAt), duration(visit.activeSeconds)].filter(Boolean).forEach((value) => {
        const span = document.createElement("span"); span.textContent = value; meta.append(span);
      });
      const tags = document.createElement("div");
      tags.className = "tag-line";
      tags.textContent = (visit.tags || []).slice(0, 6).map((tag) => `#${tag}`).join("  ") || "没有识别到页面Tag";
      copy.append(heading, meta, tags);
      const actions = document.createElement("div");
      actions.className = "article-actions";
      const editor = document.createElement("input");
      editor.className = "topic-editor";
      editor.type = "text";
      editor.value = visit.topic || "暂未识别";
      editor.setAttribute("aria-label", `纠正“${visit.title}”的主题`);
      editor.title = "修改后按回车或离开输入框保存";
      const saveTopic = async () => {
        const topic = editor.value.trim();
        if (!topic || topic === visit.topic) return;
        editor.disabled = true;
        const response = await send({ type: "UPDATE_TOPIC", id: visit.id, topic });
        editor.disabled = false;
        if (response.ok) await loadData();
      };
      editor.addEventListener("change", saveTopic);
      editor.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); editor.blur(); } });
      const remove = document.createElement("button");
      remove.className = "delete-article";
      remove.type = "button";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `删除“${visit.title}”`);
      remove.addEventListener("click", async () => {
        if (!confirm("删除这篇浏览记录？此操作无法恢复。")) return;
        await send({ type: "DELETE_VISIT", id: visit.id });
        await loadData();
      });
      actions.append(editor, remove);
      card.append(cover, copy, actions);
      elements.articleList.append(card);
    });
  }

  async function renderAll() {
    const range = rangeFor();
    const periodLength = range.until - range.since + 1;
    state.periodVisits = state.allVisits.filter((visit) => visit.lastViewedAt >= range.since && visit.lastViewedAt <= range.until);
    const previousVisits = state.allVisits.filter((visit) => visit.lastViewedAt >= range.since - periodLength && visit.lastViewedAt < range.since);
    renderHeader();
    renderMetrics(state.periodVisits);
    elements.summary.textContent = neutralSummary(state.periodVisits, previousVisits);
    renderTopicChart(state.periodVisits);
    renderChanges(state.periodVisits, previousVisits);
    renderFilters(state.periodVisits);
    renderArticles(state.periodVisits);
  }

  async function loadData() {
    const response = await send({ type: "GET_VISITS", options: { since: Date.now() - 8 * DAY_MS } });
    state.allVisits = response.ok ? response.data || [] : [];
    await renderAll();
  }

  function shiftPeriod(direction) {
    const days = state.mode === "week" ? 7 : 1;
    state.selectedDate = new Date(state.selectedDate.getTime() + direction * days * DAY_MS);
    state.search = "";
    elements.search.value = "";
    renderAll();
  }

  function openAI(open) {
    elements.aiLauncher.setAttribute("aria-expanded", String(open));
    elements.aiPanel.classList.toggle("is-open", open);
    elements.aiPanel.setAttribute("aria-hidden", String(!open));
    if (open) setTimeout(() => elements.aiInput.focus(), 180);
  }

  function appendMessage(type, text, sources = []) {
    const message = document.createElement("div");
    message.className = `message ${type === "user" ? "user-message" : "assistant-message"}`;
    const copy = document.createElement("p");
    copy.textContent = text;
    message.append(copy);
    if (sources.length) {
      const sourceList = document.createElement("div");
      sourceList.className = "message-sources";
      sources.slice(0, 5).forEach((source) => {
        const link = document.createElement("a");
        link.className = "source-link";
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = source.title;
        sourceList.append(link);
      });
      message.append(sourceList);
    }
    elements.aiConversation.append(message);
    elements.aiConversation.scrollTop = elements.aiConversation.scrollHeight;
  }

  async function askAI(question) {
    const prompt = question.trim();
    if (!prompt) return;
    appendMessage("user", prompt);
    elements.aiInput.value = "";
    elements.aiSubmit.disabled = true;
    const result = await window.AttentionLocalAI.answer(prompt, state.allVisits);
    appendMessage("assistant", result.text, result.sources);
    elements.aiSubmit.disabled = false;
    elements.aiInput.focus();
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(["chatHistory"]);
      const chatHistory = [...(stored.chatHistory || []), { question: prompt, answer: result.text, createdAt: Date.now() }].slice(-50);
      await chrome.storage.local.set({ chatHistory });
    }
  }

  document.querySelectorAll(".switch-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.selectedDate = new Date();
      document.querySelectorAll(".switch-button").forEach((item) => item.classList.toggle("is-active", item === button));
      renderAll();
    });
  });
  elements.previous.addEventListener("click", () => shiftPeriod(-1));
  elements.next.addEventListener("click", () => { if (!elements.next.disabled) shiftPeriod(1); });
  elements.search.addEventListener("input", () => { state.search = elements.search.value.trim(); renderArticles(state.periodVisits); });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); elements.search.focus(); }
    if (event.key === "Escape") openAI(false);
  });
  elements.aiLauncher.addEventListener("click", () => openAI(true));
  document.querySelector("#close-ai").addEventListener("click", () => openAI(false));
  document.querySelector("#ai-suggestions").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) askAI(button.textContent);
  });
  elements.aiForm.addEventListener("submit", (event) => { event.preventDefault(); askAI(elements.aiInput.value); });
  elements.aiInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); elements.aiForm.requestSubmit(); }
  });

  document.querySelector("#open-settings").addEventListener("click", async () => {
    const response = await send({ type: "GET_SETTINGS" });
    if (response.ok) {
      document.querySelector("#setting-visible").checked = response.data.jellyfishVisible !== false;
      document.querySelector("#setting-recording").checked = response.data.recordingEnabled !== false;
    }
    elements.settings.showModal();
  });
  document.querySelector("#setting-visible").addEventListener("change", (event) => send({ type: "SET_SETTINGS", settings: { jellyfishVisible: event.target.checked } }));
  document.querySelector("#setting-recording").addEventListener("change", (event) => send({ type: "SET_SETTINGS", settings: { recordingEnabled: event.target.checked } }));
  document.querySelector("#clear-data").addEventListener("click", async () => {
    if (!confirm("确定清除全部浏览记录和AI对话吗？此操作无法恢复。")) return;
    await send({ type: "CLEAR_ALL_DATA" });
    elements.settings.close();
    await loadData();
  });

  send({ type: "CLEANUP_EXPIRED" }).finally(loadData);
})();
