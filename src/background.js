const DB_NAME = "attention-jellyfish";
const DB_VERSION = 1;
const VISITS_STORE = "visits";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VISITS_STORE)) {
        const store = db.createObjectStore(VISITS_STORE, { keyPath: "id" });
        store.createIndex("lastViewedAt", "lastViewedAt");
        store.createIndex("day", "day");
        store.createIndex("topic", "topic");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(mode, operation) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(VISITS_STORE, mode);
    const store = transaction.objectStore(VISITS_STORE);
    let result;

    try {
      result = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  }));
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function localDay(timestamp) {
  const value = new Date(timestamp);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeText(value, maxLength = 12000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function recordVisit(payload) {
  const now = Number(payload.viewedAt) || Date.now();
  const day = localDay(now);
  const url = normalizeText(payload.url, 2000);
  const id = `${day}::${url}`;
  const db = await openDatabase();
  const existing = await new Promise((resolve, reject) => {
    const transaction = db.transaction(VISITS_STORE, "readonly");
    const request = transaction.objectStore(VISITS_STORE).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });

  const resolvedTopic = normalizeText(payload.topic, 80) || existing?.topic || "暂未识别";
  const next = {
    id,
    day,
    url,
    title: normalizeText(payload.title, 500) || existing?.title || "未命名内容",
    author: normalizeText(payload.author, 120) || existing?.author || "",
    cover: normalizeText(payload.cover, 2000) || existing?.cover || "",
    tags: Array.from(new Set([...(existing?.tags || []), ...(payload.tags || [])]))
      .map((tag) => normalizeText(tag, 80))
      .filter(Boolean)
      .slice(0, 30),
    content: normalizeText(payload.content, 12000) || existing?.content || "",
    topic: resolvedTopic,
    topicSource: payload.topicSource || existing?.topicSource || "system",
    firstViewedAt: existing?.firstViewedAt || now,
    lastViewedAt: now,
    activeSeconds: Math.max(0, Number(existing?.activeSeconds || 0) + Number(payload.activeSeconds || 0)),
    viewCount: Number(existing?.viewCount || 0) || 1,
    events: [
      ...(existing?.events || []),
      { at: now, topic: resolvedTopic, seconds: Math.max(0, Number(payload.activeSeconds || 0)) }
    ].filter((event) => event.at >= Date.now() - RETENTION_MS).slice(-240),
    signals: {
      expanded: Boolean(existing?.signals?.expanded || payload.signals?.expanded),
      video: Boolean(existing?.signals?.video || payload.signals?.video),
      liked: Boolean(existing?.signals?.liked || payload.signals?.liked),
      collected: Boolean(existing?.signals?.collected || payload.signals?.collected),
      comments: Boolean(existing?.signals?.comments || payload.signals?.comments)
    }
  };

  await runTransaction("readwrite", (store) => store.put(next));
  return next;
}

async function getAllVisits() {
  const db = await openDatabase();
  try {
    return await requestResult(db.transaction(VISITS_STORE, "readonly").objectStore(VISITS_STORE).getAll());
  } finally {
    db.close();
  }
}

async function getVisits({ since = 0, until = Number.MAX_SAFE_INTEGER, day = "" } = {}) {
  const visits = await getAllVisits();
  return visits
    .filter((visit) => (!day || visit.day === day) && visit.lastViewedAt >= since && visit.lastViewedAt <= until)
    .sort((a, b) => b.lastViewedAt - a.lastViewedAt);
}

function searchableText(visit) {
  return [visit.title, visit.author, visit.topic, ...(visit.tags || []), visit.content].join(" ").toLowerCase();
}

function scoreVisit(visit, query) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 1;
  const fields = {
    title: String(visit.title || "").toLowerCase(),
    topic: String(visit.topic || "").toLowerCase(),
    tags: (visit.tags || []).join(" ").toLowerCase(),
    content: String(visit.content || "").toLowerCase()
  };
  return terms.reduce((total, term) => total
    + (fields.title.includes(term) ? 8 : 0)
    + (fields.topic.includes(term) ? 7 : 0)
    + (fields.tags.includes(term) ? 5 : 0)
    + (fields.content.includes(term) ? 2 : 0), 0);
}

async function searchVisits(query, options = {}) {
  const visits = await getVisits(options);
  const compactQuery = String(query || "").trim();
  if (!compactQuery) return visits;
  return visits
    .map((visit) => ({ ...visit, searchScore: scoreVisit(visit, compactQuery) }))
    .filter((visit) => visit.searchScore > 0 || searchableText(visit).includes(compactQuery.toLowerCase()))
    .sort((a, b) => b.searchScore - a.searchScore || b.lastViewedAt - a.lastViewedAt);
}

async function updateTopic(id, topic) {
  const db = await openDatabase();
  const existing = await requestResult(db.transaction(VISITS_STORE, "readonly").objectStore(VISITS_STORE).get(id));
  db.close();
  if (!existing) return null;
  const next = { ...existing, topic: normalizeText(topic, 80) || "暂未识别", topicSource: "user" };
  await runTransaction("readwrite", (store) => store.put(next));
  return next;
}

async function deleteVisit(id) {
  await runTransaction("readwrite", (store) => store.delete(id));
}

async function cleanupExpired() {
  const cutoff = Date.now() - RETENTION_MS;
  const visits = await getAllVisits();
  const expired = visits.filter((visit) => visit.lastViewedAt < cutoff).map((visit) => visit.id);
  if (expired.length) {
    await runTransaction("readwrite", (store) => expired.forEach((id) => store.delete(id)));
  }

  const stored = await chrome.storage.local.get(["chatHistory"]);
  const chatHistory = (stored.chatHistory || []).filter((item) => Number(item.createdAt) >= cutoff);
  await chrome.storage.local.set({ chatHistory, lastCleanupAt: Date.now() });
  return expired.length;
}

async function clearAllData() {
  await runTransaction("readwrite", (store) => store.clear());
  await chrome.storage.local.remove(["chatHistory", "lastCleanupAt"]);
}

async function broadcastSettings(settings) {
  const tabs = await chrome.tabs.query({ url: ["https://www.xiaohongshu.com/*", "https://xiaohongshu.com/*"] });
  await Promise.allSettled(tabs.filter((tab) => tab.id).map((tab) => chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS", settings })));
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await chrome.storage.local.set({
    jellyfishVisible: true,
    recordingEnabled: true,
    retentionDays: 7,
    privacyMode: "local-only",
    ...(await chrome.storage.local.get())
  });
  chrome.alarms.create("attention-jellyfish-cleanup", { periodInMinutes: 360 });
  await cleanupExpired();
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("src/onboarding.html") });
});

chrome.runtime.onStartup.addListener(() => cleanupExpired());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "attention-jellyfish-cleanup") cleanupExpired();
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_JELLYFISH" });
  } catch {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/report.html") });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const respond = async () => {
    switch (message?.type) {
      case "RECORD_VISIT":
        return { ok: true, data: await recordVisit(message.payload || {}) };
      case "GET_RECENT":
        return { ok: true, data: await getVisits({ since: Date.now() - Number(message.minutes || 15) * 60 * 1000 }) };
      case "GET_VISITS":
        return { ok: true, data: await getVisits(message.options || {}) };
      case "SEARCH_VISITS":
        return { ok: true, data: await searchVisits(message.query, message.options || {}) };
      case "UPDATE_TOPIC":
        return { ok: true, data: await updateTopic(message.id, message.topic) };
      case "DELETE_VISIT":
        await deleteVisit(message.id);
        return { ok: true };
      case "GET_SETTINGS":
        return { ok: true, data: await chrome.storage.local.get() };
      case "SET_SETTINGS":
        await chrome.storage.local.set(message.settings || {});
        await broadcastSettings(message.settings || {});
        return { ok: true, data: await chrome.storage.local.get() };
      case "OPEN_REPORT":
        await chrome.tabs.create({ url: chrome.runtime.getURL("src/report.html") });
        return { ok: true };
      case "CLEANUP_EXPIRED":
        return { ok: true, deleted: await cleanupExpired() };
      case "CLEAR_ALL_DATA":
        await clearAllData();
        return { ok: true };
      default:
        return { ok: false, error: "UNKNOWN_MESSAGE" };
    }
  };

  respond().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
