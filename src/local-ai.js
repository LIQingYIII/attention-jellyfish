(function () {
  const STOP_PHRASES = ["我今天", "我昨天", "我这周", "最近", "看过的", "看到了", "哪些", "什么", "帮我", "一下", "内容", "文章", "总结", "根据", "找出", "找找"];

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function duration(seconds) {
    const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
    return `${minutes}分钟`;
  }

  function scopeForQuestion(question) {
    const now = new Date();
    if (/昨天/.test(question)) {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
      return { since: start, until: start + 86400000 - 1, label: "昨天" };
    }
    if (/今天|今日/.test(question)) {
      return { since: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), until: Date.now(), label: "今天" };
    }
    return { since: Date.now() - 7 * 86400000, until: Date.now(), label: "最近7天" };
  }

  function keywords(question, visits) {
    let text = normalize(question).toLowerCase();
    STOP_PHRASES.forEach((phrase) => { text = text.replaceAll(phrase, " "); });
    const known = new Set();
    visits.forEach((visit) => {
      if (visit.topic && text.includes(visit.topic.toLowerCase())) known.add(visit.topic.toLowerCase());
      (visit.tags || []).forEach((tag) => { if (tag.length >= 2 && text.includes(tag.toLowerCase())) known.add(tag.toLowerCase()); });
    });
    text.split(/[，。！？、,.!?\s/]+/).filter((word) => word.length >= 2).forEach((word) => known.add(word));
    return [...known];
  }

  function relevance(visit, terms) {
    if (!terms.length) return 1;
    const title = normalize(visit.title).toLowerCase();
    const topic = normalize(visit.topic).toLowerCase();
    const tags = (visit.tags || []).join(" ").toLowerCase();
    const content = normalize(visit.content).toLowerCase();
    return terms.reduce((score, term) => score
      + (title.includes(term) ? 8 : 0)
      + (topic.includes(term) ? 7 : 0)
      + (tags.includes(term) ? 5 : 0)
      + (content.includes(term) ? 2 : 0), 0);
  }

  function groupTopics(visits) {
    const groups = new Map();
    visits.forEach((visit) => {
      const topic = visit.topic || "暂未识别";
      const current = groups.get(topic) || { topic, seconds: 0, count: 0 };
      current.seconds += Number(visit.activeSeconds || 0);
      current.count += 1;
      groups.set(topic, current);
    });
    return [...groups.values()].sort((a, b) => b.seconds - a.seconds || b.count - a.count);
  }

  function makeAnswer(question, allVisits) {
    const scope = scopeForQuestion(question);
    const scoped = allVisits.filter((visit) => visit.lastViewedAt >= scope.since && visit.lastViewedAt <= scope.until);
    if (!scoped.length) return { text: `${scope.label}还没有可用于回答的有效浏览记录。`, sources: [] };
    const terms = keywords(question, scoped);
    const ranked = scoped.map((visit) => ({ visit, score: relevance(visit, terms) }))
      .filter((item) => !terms.length || item.score > 0)
      .sort((a, b) => b.score - a.score || b.visit.lastViewedAt - a.visit.lastViewedAt);
    const relevant = (ranked.length ? ranked : scoped.map((visit) => ({ visit, score: 1 }))).slice(0, 6).map((item) => item.visit);

    if (/最多|主要|主题|兴趣/.test(question)) {
      const topics = groupTopics(scoped).slice(0, 4);
      return {
        text: `${scope.label}的注意力主要经过${topics.map((item) => `“${item.topic}”${duration(item.seconds)}`).join("、")}。这是按有效停留时间排列的结果。`,
        sources: relevant.slice(0, 4)
      };
    }

    if (/清单|计划|整理成/.test(question)) {
      const tags = Array.from(new Set(relevant.flatMap((visit) => visit.tags || []))).slice(0, 8);
      const lines = relevant.slice(0, 5).map((visit) => `• ${visit.title}`);
      const tagLine = tags.length ? `\n\n这些内容反复出现的关键词有：${tags.join("、")}。` : "";
      return {
        text: `我从${relevant.length}篇相关记录中整理出了一个材料草稿：\n\n${lines.join("\n")}${tagLine}\n\n当前是本地检索模式；安装Qwen2.5模型包后，才能进一步把材料改写成结构化清单。`,
        sources: relevant
      };
    }

    if (/总结|概括|讲了什么/.test(question)) {
      const topics = groupTopics(relevant).slice(0, 3).map((item) => item.topic).join("、");
      return {
        text: `${scope.label}找到${relevant.length}篇相关内容，主要落在${topics || "暂未识别"}。目前的本地检索模式可以帮你找回原文；完整的跨文章自然语言总结将在Qwen2.5本地模型包接入后启用。`,
        sources: relevant
      };
    }

    return {
      text: `${scope.label}找到${relevant.length}篇可能相关的内容。你可以从下面的来源回到原文。`,
      sources: relevant
    };
  }

  window.AttentionLocalAI = {
    status: "retrieval-only",
    modelName: "本地检索模式",
    answer: async (question, visits) => makeAnswer(question, visits)
  };
})();
