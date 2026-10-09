const pages = ["dashboard", "resume", "dsa", "interview", "internships"];
const pageTitles = {
  dashboard: "Overview",
  resume: "Resume studio",
  dsa: "DSA tracker",
  interview: "Mock interview",
  internships: "Applications"
};
const interviewQuestions = [
  { kind: "BEHAVIORAL", text: "Tell me about a project you're proud of. What was your role, and what did you learn?" },
  { kind: "PROBLEM SOLVING", text: "Tell me about a challenging bug or technical problem you solved. How did you approach it?" },
  { kind: "TEAMWORK", text: "Describe a time you worked with someone who had a different perspective. How did you handle it?" },
  { kind: "GOALS", text: "What kind of opportunity are you looking for, and what would you bring to the team?" }
];
const interviewHistory = [];
let activeQuestion = 0;
let toastTimer;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
};
const isHosted = !["localhost", "127.0.0.1"].includes(location.hostname);
const hostedStoreKey = "careerpilot:data:v1";
const readHostedStore = () => {
  const value = localStorage.getItem(hostedStoreKey);
  if (!value) return { problems: [], internships: [] };
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed.problems) || !Array.isArray(parsed.internships)) {
    throw new Error("CareerPilot data in this browser is invalid. Clear this site's stored data to start fresh.");
  }
  return parsed;
};
const writeHostedStore = (store) => localStorage.setItem(hostedStoreKey, JSON.stringify(store));
const hostedApi = (url, options = {}) => {
  const route = new URL(url, location.origin).pathname;
  const method = options.method || "GET";
  const store = readHostedStore();
  if (route === "/api/dashboard" && method === "GET") {
    const applied = store.internships.filter((item) => item.status !== "Wishlist");
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const dayKey = day.toDateString();
      const countOnDay = (items) => items.filter((item) => new Date(item.createdAt).toDateString() === dayKey).length;
      return {
        label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(day),
        problems: countOnDay(store.problems.filter((item) => item.status === "Solved")),
        applications: countOnDay(applied)
      };
    });
    return {
      stats: {
        problemsSolved: store.problems.filter((item) => item.status === "Solved").length,
        problemsTotal: store.problems.length,
        applications: applied.length,
        interviews: store.internships.filter((item) => item.status === "Interview").length,
        offers: store.internships.filter((item) => item.status === "Offer").length
      },
      week,
      recentProblems: store.problems.slice(-5).reverse(),
      recentInternships: store.internships.slice(-5).reverse()
    };
  }
  const collection = route.startsWith("/api/problems") ? "problems"
    : route.startsWith("/api/internships") ? "internships" : null;
  if (!collection) throw new Error("This hosted API route is not available.");
  if (route === `/api/${collection}` && method === "GET") return store[collection];
  const match = route.match(/^\/api\/(?:problems|internships)\/([0-9a-f-]+)$/i);
  if (method === "POST" && route === `/api/${collection}`) {
    const input = JSON.parse(options.body || "{}");
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const item = collection === "problems"
      ? { id, title: input.title.trim(), topic: input.topic || "Other", difficulty: input.difficulty || "Medium", status: input.status || "Solved", createdAt }
      : { id, company: input.company.trim(), role: input.role.trim(), location: input.location?.trim() || "Remote", status: input.status || "Wishlist", appliedAt: input.status && input.status !== "Wishlist" ? createdAt.slice(0, 10) : "", createdAt };
    store[collection].push(item);
    writeHostedStore(store);
    return item;
  }
  if (match && collection === "problems") {
    const index = store.problems.findIndex((item) => item.id === match[1]);
    if (index < 0) throw new Error("Problem not found.");
    if (method === "PATCH") {
      store.problems[index].status = JSON.parse(options.body || "{}").status;
      writeHostedStore(store);
      return store.problems[index];
    }
    if (method === "DELETE") {
      store.problems.splice(index, 1);
      writeHostedStore(store);
      return { ok: true };
    }
  }
  if (match && collection === "internships") {
    const index = store.internships.findIndex((item) => item.id === match[1]);
    if (index < 0) throw new Error("Application not found.");
    if (method === "PATCH") {
      const status = JSON.parse(options.body || "{}").status;
      store.internships[index].status = status;
      if (status !== "Wishlist" && !store.internships[index].appliedAt) {
        store.internships[index].appliedAt = new Date().toISOString().slice(0, 10);
      }
      writeHostedStore(store);
      return store.internships[index];
    }
    if (method === "DELETE") {
      store.internships.splice(index, 1);
      writeHostedStore(store);
      return { ok: true };
    }
  }
  throw new Error("This hosted API operation is not available.");
};
const api = async (url, options = {}) => {
  if (isHosted && ["/api/dashboard", "/api/problems", "/api/internships"].some((route) => new URL(url, location.origin).pathname.startsWith(route))) {
    return hostedApi(url, options);
  }
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
};
const showToast = (message, isError = false) => {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
};
const setBusy = (button, busy, busyText = "Working...") => {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = `<span class="button-spinner"></span>${busyText}`;
    button.disabled = true;
  } else {
    button.innerHTML = button.dataset.originalText || button.innerHTML;
    button.disabled = false;
    delete button.dataset.originalText;
  }
};
const navigate = (page) => {
  if (!pages.includes(page)) return;
  pages.forEach((name) => {
    $(`#page-${name}`).classList.toggle("active", name === page);
    $(`.nav-link[data-page="${name}"]`).classList.toggle("active", name === page);
  });
  $("#breadcrumb-page").textContent = pageTitles[page];
  $("#sidebar").classList.remove("mobile-open");
  if (location.hash !== `#${page}`) history.replaceState(null, "", `#${page}`);
  if (page === "dsa") loadProblems();
  if (page === "internships") loadInternships();
};

function renderRecentActivity(problems, internships) {
  const items = [
    ...problems.map((item) => ({ kind: "problem", title: item.title, detail: `${item.topic} · ${item.difficulty}`, date: item.createdAt })),
    ...internships.map((item) => ({ kind: "job", title: `${item.role} at ${item.company}`, detail: item.status, date: item.createdAt }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 4);
  const container = $("#recent-activity");
  if (!items.length) {
    container.className = "activity-empty";
    container.innerHTML = '<span class="empty-icon">✧</span><strong>Your wins will show up here</strong><span>Log a problem or add an application to get going.</span>';
    return;
  }
  container.className = "activity-list";
  container.innerHTML = items.map((item) => `
    <div class="activity-row">
      <span class="activity-icon ${item.kind === "problem" ? "violet" : "blue"}">${item.kind === "problem" ? "⌘" : "↗"}</span>
      <span class="activity-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></span>
      <time>${escapeHtml(formatDate(item.date))}</time>
    </div>`).join("");
}

function renderMomentum(week) {
  const chart = $(".chart-main");
  chart.querySelectorAll(".momentum-lines, .chart-x-labels").forEach((element) => element.remove());
  const active = week.some((day) => day.problems || day.applications);
  chart.querySelector(".chart-empty").classList.toggle("hidden", active);
  if (!active) return;
  const max = Math.max(1, ...week.flatMap((day) => [day.problems, day.applications]));
  const point = (value, index) => `${index * 114 + 10},${94 - value / max * 76}`;
  const problemPoints = week.map((day, index) => point(day.problems, index)).join(" ");
  const applicationPoints = week.map((day, index) => point(day.applications, index)).join(" ");
  chart.querySelector(".chart-empty").classList.add("hidden");
  chart.insertAdjacentHTML("beforeend", `
    <svg class="momentum-lines" viewBox="0 0 704 100" preserveAspectRatio="none" role="img" aria-label="Problems solved and applications sent during the last seven days">
      <polyline points="${problemPoints}" fill="none" stroke="#8170e8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="${applicationPoints}" fill="none" stroke="#79a9e6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${week.map((day, index) => `<circle cx="${index * 114 + 10}" cy="${94 - day.problems / max * 76}" r="3" fill="#8170e8"/>`).join("")}
      ${week.map((day, index) => `<circle cx="${index * 114 + 10}" cy="${94 - day.applications / max * 76}" r="3" fill="#79a9e6"/>`).join("")}
    </svg>
    <div class="chart-x-labels">${week.map((day) => `<span>${escapeHtml(day.label)}</span>`).join("")}</div>`);
}

async function loadDashboard() {
  try {
    const data = await api("/api/dashboard");
    $("#stat-problems").textContent = data.stats.problemsSolved;
    $("#stat-applications").textContent = data.stats.applications;
    $("#stat-interviews").textContent = data.stats.interviews;
    $("#stat-offers").textContent = data.stats.offers;
    $("#problem-progress").textContent = data.stats.problemsTotal
      ? `${data.stats.problemsSolved} of ${data.stats.problemsTotal} solved`
      : "Start your first one";
    $("#problem-progress-bar").style.width = `${data.stats.problemsTotal ? Math.round(data.stats.problemsSolved / data.stats.problemsTotal * 100) : 0}%`;
    renderRecentActivity(data.recentProblems, data.recentInternships);
    renderMomentum(data.week);
  } catch (error) {
    showToast(error.message, true);
  }
}

function updateProblemStats(problems) {
  const solved = problems.filter((item) => item.status === "Solved").length;
  const active = problems.filter((item) => item.status === "Attempted" || item.status === "Todo").length;
  $("#dsa-solved").textContent = solved;
  $("#dsa-progress").textContent = active;
  $("#dsa-topics").textContent = new Set(problems.map((item) => item.topic)).size;
  $("#dsa-rate").textContent = `${problems.length ? Math.round(solved / problems.length * 100) : 0}%`;
}

function renderProblems(problems) {
  const query = $("#problem-search").value.trim().toLowerCase();
  const filtered = problems.filter((item) => `${item.title} ${item.topic} ${item.difficulty} ${item.status}`.toLowerCase().includes(query));
  const tbody = $("#problem-rows");
  tbody.innerHTML = filtered.map((item) => `
    <tr>
      <td><span class="problem-title"><span class="problem-check ${item.status === "Solved" ? "is-solved" : ""}">${item.status === "Solved" ? "✓" : "⌘"}</span>${escapeHtml(item.title)}</span></td>
      <td><span class="topic-pill">${escapeHtml(item.topic)}</span></td>
      <td><span class="difficulty difficulty-${item.difficulty.toLowerCase()}"><i></i>${escapeHtml(item.difficulty)}</span></td>
      <td><select class="status-select status-${item.status.toLowerCase()}" data-status-problem="${escapeHtml(item.id)}" aria-label="Update ${escapeHtml(item.title)} status">${["Solved", "Attempted", "Todo"].map((status) => `<option${item.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></td>
      <td class="date-cell">${escapeHtml(formatDate(item.createdAt))}</td>
      <td><button class="row-delete" data-delete-problem="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.title)}" title="Delete problem">×</button></td>
    </tr>`).join("");
  $("#problem-empty").classList.toggle("visible", filtered.length === 0);
  if (!problems.length && query) $("#problem-empty").querySelector("strong").textContent = "No problems match that search.";
  else $("#problem-empty").querySelector("strong").textContent = "Your first solve is waiting.";
}

async function loadProblems() {
  try {
    const problems = await api("/api/problems");
    updateProblemStats(problems);
    renderProblems(problems);
  } catch (error) {
    showToast(error.message, true);
  }
}

function updateInternshipStats(items) {
  $("#app-total").textContent = items.length;
  $("#app-applied").textContent = items.filter((item) => item.status !== "Wishlist").length;
  $("#app-interview").textContent = items.filter((item) => item.status === "Interview").length;
  $("#app-offers").textContent = items.filter((item) => item.status === "Offer").length;
}

function renderInternships(items) {
  const query = $("#internship-search").value.trim().toLowerCase();
  const filtered = items.filter((item) => `${item.company} ${item.role} ${item.location} ${item.status}`.toLowerCase().includes(query));
  $("#internship-rows").innerHTML = filtered.map((item) => `
    <tr>
      <td><span class="company-cell"><span class="company-logo">${escapeHtml(item.company.slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(item.company)}</strong><small>${escapeHtml(item.role)}</small></span></span></td>
      <td class="location-cell">${escapeHtml(item.location)}</td>
      <td><select class="status-select status-${item.status.toLowerCase()}" data-status-internship="${escapeHtml(item.id)}" aria-label="Update ${escapeHtml(item.company)} status">${["Wishlist", "Applied", "Interview", "Offer", "Rejected"].map((status) => `<option${item.status === status ? " selected" : ""}>${status}</option>`).join("")}</select></td>
      <td class="date-cell">${escapeHtml(formatDate(item.createdAt))}</td>
      <td><button class="row-delete" data-delete-internship="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.company)} application" title="Delete application">×</button></td>
    </tr>`).join("");
  $("#internship-empty").classList.toggle("visible", filtered.length === 0);
  if (!items.length && query) $("#internship-empty").querySelector("strong").textContent = "No applications match that search.";
  else $("#internship-empty").querySelector("strong").textContent = "A great opportunity is out there.";
}

async function loadInternships() {
  try {
    const items = await api("/api/internships");
    updateInternshipStats(items);
    renderInternships(items);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderResumeResults(result) {
  const results = $("#resume-results");
  const skills = result.skills.length
    ? result.skills.map((skill) => `<span class="skill-tag">${escapeHtml(skill.name)}</span>`).join("")
    : '<span class="no-skills">No common technical skills detected yet.</span>';
  results.innerHTML = `
    <div class="result-header"><div><div class="eyebrow">YOUR RESUME SNAPSHOT</div><h2>A strong start.<br><span>Room to shine.</span></h2></div><span class="score-ring" style="--score:${result.score}"><span><strong>${result.score}</strong><small>/100</small></span></span></div>
    <div class="score-caption"><span class="score-indicator"></span>Resume readiness <strong>${result.words} words</strong></div>
    <div class="result-block"><div class="result-block-title">QUICK CHECKS <span>${result.checks.filter((check) => check.passed).length}/${result.checks.length} looking good</span></div><div class="check-list">${result.checks.map((check) => `<div class="check-row"><span class="${check.passed ? "check-good" : "check-missing"}">${check.passed ? "✓" : "!"}</span>${escapeHtml(check.label)}</div>`).join("")}</div></div>
    <div class="result-block"><div class="result-block-title">SKILLS SPOTTED <span>${result.skills.length} found</span></div><div class="skills-list">${skills}</div></div>
    <div class="result-block suggestions-block"><div class="result-block-title">YOUR NEXT BEST MOVES <span>✦</span></div><ul>${result.suggestions.map((tip) => `<li>${escapeHtml(tip)}</li>`).join("")}</ul></div>
    ${result.aiFeedback ? `<div class="ai-feedback"><span>✦ PERSONALIZED AI COACHING</span><p>${escapeHtml(result.aiFeedback)}</p></div>` : '<div class="demo-feedback">Demo analysis uses practical resume checks. Add an AI provider key to enable personalized AI coaching.</div>'}`;
}

const renderQuestion = (index) => {
  const question = interviewQuestions[index];
  const chat = $("#chat-messages");
  const number = String(index + 1).padStart(2, "0");
  chat.insertAdjacentHTML("beforeend", `<div class="chat-message coach-message"><div class="message-avatar">✦</div><div class="message-body"><span class="message-name">CAREERPILOT COACH</span><p>Let's try another one. Take your time and think out loud.</p><div class="question-card"><span>QUESTION ${number} · ${question.kind}</span><strong>${escapeHtml(question.text)}</strong></div></div></div>`);
  chat.scrollTop = chat.scrollHeight;
};

function addChatMessage(role, content, questionIndex) {
  const chat = $("#chat-messages");
  if (role === "user") {
    chat.insertAdjacentHTML("beforeend", `<div class="chat-message user-message"><div class="message-body"><span class="message-name">YOU</span><p>${escapeHtml(content).replace(/\n/g, "<br>")}</p></div><div class="message-avatar user-message-avatar">Y</div></div>`);
  } else {
    const nextButton = questionIndex < interviewQuestions.length - 1
      ? `<button class="next-question" data-next-question="${questionIndex + 1}">Next question <span>→</span></button>`
      : '<button class="next-question" data-next-question="0">Practice again <span>↻</span></button>';
    chat.insertAdjacentHTML("beforeend", `<div class="chat-message coach-message"><div class="message-avatar">✦</div><div class="message-body"><span class="message-name">CAREERPILOT COACH</span><p>${escapeHtml(content).replace(/\n/g, "<br>")}</p>${nextButton}</div></div>`);
  }
  chat.scrollTop = chat.scrollHeight;
}

function init() {
  $("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date());
  const requestedPage = location.hash.slice(1);
  navigate(pages.includes(requestedPage) ? requestedPage : "dashboard");
  loadDashboard();

  $$(".nav-link").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(link.dataset.page);
  }));
  $$("[data-go]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.go)));
  $("#menu-toggle").addEventListener("click", () => $("#sidebar").classList.toggle("mobile-open"));

  $("#resume-text").addEventListener("input", (event) => {
    $("#resume-count").textContent = `${event.target.value.length.toLocaleString()} characters`;
  });
  $("#analyze-resume").addEventListener("click", async () => {
    const button = $("#analyze-resume");
    setBusy(button, true, "Analyzing...");
    try {
      const result = await api("/api/resume/analyze", { method: "POST", body: JSON.stringify({ resume: $("#resume-text").value }) });
      renderResumeResults(result);
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });

  $("#open-problem-form").addEventListener("click", () => $("#problem-modal").showModal());
  $("#problem-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $(".modal-submit", form);
    setBusy(button, true, "Saving...");
    try {
      await api("/api/problems", {
        method: "POST",
        body: JSON.stringify({
          title: $("#problem-title").value,
          topic: $("#problem-topic").value,
          difficulty: $("#problem-difficulty").value,
          status: $("#problem-status").value
        })
      });
      form.reset();
      $("#problem-modal").close();
      await Promise.all([loadProblems(), loadDashboard()]);
      showToast("Problem added. Keep that momentum going!");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });
  $("#problem-search").addEventListener("input", loadProblems);
  $("#problem-rows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-problem]");
    if (!button) return;
    try {
      await api(`/api/problems/${button.dataset.deleteProblem}`, { method: "DELETE" });
      await Promise.all([loadProblems(), loadDashboard()]);
      showToast("Problem removed.");
    } catch (error) {
      showToast(error.message, true);
    }
  });
  $("#problem-rows").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-status-problem]");
    if (!select) return;
    try {
      await api(`/api/problems/${select.dataset.statusProblem}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) });
      await Promise.all([loadProblems(), loadDashboard()]);
      showToast("Problem status updated.");
    } catch (error) {
      showToast(error.message, true);
      loadProblems();
    }
  });

  $("#open-internship-form").addEventListener("click", () => $("#internship-modal").showModal());
  $("#internship-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $(".modal-submit", form);
    setBusy(button, true, "Saving...");
    try {
      await api("/api/internships", {
        method: "POST",
        body: JSON.stringify({
          company: $("#company-name").value,
          role: $("#role-name").value,
          location: $("#role-location").value,
          status: $("#application-status").value
        })
      });
      form.reset();
      $("#internship-modal").close();
      await Promise.all([loadInternships(), loadDashboard()]);
      showToast("Opportunity saved. Good luck!");
    } catch (error) {
      showToast(error.message, true);
    } finally {
      setBusy(button, false);
    }
  });
  $("#internship-search").addEventListener("input", loadInternships);
  $("#internship-rows").addEventListener("change", async (event) => {
    const select = event.target.closest("[data-status-internship]");
    if (!select) return;
    try {
      await api(`/api/internships/${select.dataset.statusInternship}`, { method: "PATCH", body: JSON.stringify({ status: select.value }) });
      await Promise.all([loadInternships(), loadDashboard()]);
      showToast("Application status updated.");
    } catch (error) {
      showToast(error.message, true);
      loadInternships();
    }
  });
  $("#internship-rows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-internship]");
    if (!button) return;
    try {
      await api(`/api/internships/${button.dataset.deleteInternship}`, { method: "DELETE" });
      await Promise.all([loadInternships(), loadDashboard()]);
      showToast("Application removed.");
    } catch (error) {
      showToast(error.message, true);
    }
  });

  $("#answer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#interview-answer");
    const answer = input.value.trim();
    if (!answer) return;
    const button = $("#send-answer");
    input.value = "";
    input.disabled = true;
    setBusy(button, true, "");
    const question = interviewQuestions[activeQuestion].text;
    interviewHistory.push({ role: "assistant", content: question }, { role: "user", content: answer });
    addChatMessage("user", answer, activeQuestion);
    const loadingId = `feedback-${Date.now()}`;
    $("#chat-messages").insertAdjacentHTML("beforeend", `<div class="chat-message coach-message typing-message" id="${loadingId}"><div class="message-avatar">✦</div><div class="message-body"><span class="message-name">CAREERPILOT COACH</span><p class="typing-dots"><i></i><i></i><i></i></p></div></div>`);
    $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
    try {
      const result = await api("/api/interview", {
        method: "POST",
        body: JSON.stringify({ question, answer, history: interviewHistory.slice(-8) })
      });
      $(`#${loadingId}`)?.remove();
      addChatMessage("coach", result.feedback, activeQuestion);
      interviewHistory.push({ role: "assistant", content: result.feedback });
    } catch (error) {
      $(`#${loadingId}`)?.remove();
      addChatMessage("coach", error.message, activeQuestion);
    } finally {
      input.disabled = false;
      input.focus();
      button.innerHTML = "↑";
      button.disabled = false;
    }
  });
  $("#interview-answer").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("#answer-form").requestSubmit();
    }
  });
  $("#chat-messages").addEventListener("click", (event) => {
    const button = event.target.closest("[data-next-question]");
    if (!button) return;
    activeQuestion = Number(button.dataset.nextQuestion);
    if (activeQuestion === 0) {
      $("#chat-messages").innerHTML = "";
      interviewHistory.length = 0;
    }
    renderQuestion(activeQuestion);
  });
  $("#reset-interview").addEventListener("click", () => {
    activeQuestion = 0;
    interviewHistory.length = 0;
    $("#chat-messages").innerHTML = "";
    renderQuestion(activeQuestion);
  });
  $$(".modal").forEach((dialog) => dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  }));
}

init();
