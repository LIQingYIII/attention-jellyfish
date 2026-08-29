(() => {
  const stage = document.querySelector(".jelly-stage");
  const states = {
    calm: ["平静流动", "主题相近 · 切换平缓 · 浏览舒展"],
    wander: ["轻轻游移", "主题渐多 · 偶尔切换 · 节奏适中"],
    active: ["深海活跃", "主题多元 · 切换频繁 · 浏览密集"]
  };
  function select(name) {
    stage.dataset.state = name;
    document.querySelector("#state-name").textContent = states[name][0];
    document.querySelector("#state-copy").textContent = states[name][1];
    document.querySelectorAll(".state-tabs button").forEach((button) => button.classList.toggle("is-active", button.dataset.state === name));
  }
  document.querySelector(".state-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-state]");
    if (button) select(button.dataset.state);
  });
  const order = ["calm", "wander", "active"];
  document.querySelector(".demo-jelly").addEventListener("click", () => {
    const current = order.indexOf(stage.dataset.state || "calm");
    select(order[(current + 1) % order.length]);
  });
  select("calm");
})();
