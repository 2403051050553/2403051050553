const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "careerpilot.json");
const STATUSES = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function readStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const initial = { problems: [], internships: [] };
    await writeStore(initial);
    return initial;
  }
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${DATA_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(temporaryFile, DATA_FILE);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.status = 400;
    throw error;
  }
}

function cleanText(value, maxLength = 300) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function makeId() {
  return crypto.randomUUID();
}

function analyzeResume(text) {
  const normalized = text.toLowerCase();
  const skillGroups = {
    "Programming languages": ["javascript", "typescript", "python", "java", "c++", "c#", "go", "rust"],
    "Frontend": ["react", "next.js", "html", "css", "tailwind", "vue", "angular"],
    "Backend & data": ["node.js", "express", "api", "sql", "postgresql", "mongodb", "redis"],
    "Cloud & tools": ["aws", "azure", "docker", "kubernetes", "git", "linux", "ci/cd"],
    "AI & data science": ["machine learning", "deep learning", "tensorflow", "pytorch", "llm", "pandas"]
  };
  const skills = Object.entries(skillGroups).flatMap(([group, terms]) =>
    terms.filter((term) => normalized.includes(term)).map((name) => ({ name, group }))
  );
  const checks = [
    { label: "Contact details", passed: /@/.test(text) && /\d{7,}/.test(text) },
    { label: "Experience or internships", passed: /experience|internship|employment/i.test(text) },
    { label: "Projects", passed: /projects?|built|developed|created/i.test(text) },
    { label: "Education", passed: /education|university|college|bachelor|degree/i.test(text) },
    { label: "Measurable impact", passed: /\b\d+%|\b\d+\+|\b\d{2,}\b/.test(text) }
  ];
  const words = text.split(/\s+/).filter(Boolean).length;
  const score = Math.min(100, Math.max(25,
    Math.round(35 + checks.filter((check) => check.passed).length * 9 + Math.min(skills.length, 8) * 3
      + (words >= 180 && words <= 750 ? 12 : words > 0 ? 4 : 0))
  ));
  const suggestions = [];
  if (!checks[0].passed) suggestions.push("Add a professional email address and phone number near the top.");
  if (!checks[1].passed) suggestions.push("Add an experience or internship section, including relevant campus work.");
  if (!checks[2].passed) suggestions.push("Showcase 2–3 projects and explain the problem, your contribution, and the result.");
  if (!checks[3].passed) suggestions.push("Include your degree, institution, and expected graduation date.");
  if (!checks[4].passed) suggestions.push("Quantify outcomes where possible (for example, users supported or load time reduced).");
  if (words < 180) suggestions.push("Add more detail about your projects and impact; your resume currently looks quite short.");
  if (words > 750) suggestions.push("Consider tightening your resume so the most relevant details are easy to scan.");
  if (!suggestions.length) suggestions.push("Strong foundation. Tailor your skills and project bullets to each role you apply for.");
  return { score, words, skills, checks, suggestions };
}

async function askOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const response = await fetch(process.env.OPENAI_API_URL || "https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      temperature: 0.7
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`AI provider returned ${response.status}: ${details.slice(0, 250)}`);
  }
  const result = await response.json();
  return result.choices?.[0]?.message?.content?.trim() || null;
}

async function handleApi(request, response, url) {
  const route = url.pathname;

  if (request.method === "POST" && route === "/api/resume/analyze") {
    const input = await readJson(request);
    const resume = cleanText(input.resume, 40_000);
    if (resume.length < 30) return sendJson(response, 400, { error: "Paste at least a few lines of resume text to get useful feedback." });
    const analysis = analyzeResume(resume);
    const aiFeedback = await askOpenAI(
      "You are a practical, encouraging resume coach for students. Give 3 concise, specific improvements based only on the supplied resume text. Do not invent experience.",
      resume
    );
    return sendJson(response, 200, { ...analysis, aiFeedback, mode: aiFeedback ? "ai" : "demo" });
  }
  if (request.method === "POST" && route === "/api/interview") {
    const input = await readJson(request);
    const question = cleanText(input.question, 500);
    const answer = cleanText(input.answer, 5_000);
    if (!question || !answer) return sendJson(response, 400, { error: "A question and your answer are both required." });
    const history = Array.isArray(input.history)
      ? input.history.slice(-8).map((entry) => `${cleanText(entry.role, 20)}: ${cleanText(entry.content, 800)}`).join("\n")
      : "";
    const aiFeedback = await askOpenAI(
      "You are a supportive technical interview coach. Evaluate the candidate answer briefly: mention one strength, one improvement, and one follow-up question. Be specific and kind. Do not claim facts absent from their answer.",
      `Interview context:\n${history}\nQuestion: ${question}\nCandidate answer: ${answer}`
    );
    const feedback = aiFeedback || (answer.split(/\s+/).length < 12
      ? "Good start. Try adding more detail: explain your reasoning, the trade-offs you considered, and a concrete example. What would you do differently next time?"
      : "Nice effort. You explained your thinking—make the answer even stronger with a specific example and a measurable result. What was the hardest trade-off you had to make?");
    return sendJson(response, 200, { feedback, mode: aiFeedback ? "ai" : "demo" });
  }

  const store = await readStore();
  if (request.method === "GET" && route === "/api/dashboard") {
    const applied = store.internships.filter((item) => item.status !== "Wishlist");
    const today = new Date();
    const week = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - (6 - index));
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const countOnDay = (items) => items.filter((item) => {
        const created = new Date(item.createdAt);
        return `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}` === key;
      }).length;
      return {
        label: new Intl.DateTimeFormat("en", { weekday: "short" }).format(day),
        problems: countOnDay(store.problems.filter((item) => item.status === "Solved")),
        applications: countOnDay(applied)
      };
    });
    return sendJson(response, 200, {
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
    });
  }
  if (request.method === "GET" && route === "/api/problems") return sendJson(response, 200, store.problems);
  if (request.method === "POST" && route === "/api/problems") {
    const input = await readJson(request);
    const title = cleanText(input.title, 120);
    if (!title) return sendJson(response, 400, { error: "Problem title is required." });
    if (input.status && !["Solved", "Attempted", "Todo"].includes(input.status)) {
      return sendJson(response, 400, { error: "Choose Solved, Attempted, or Todo." });
    }
    const problem = {
      id: makeId(),
      title,
      topic: cleanText(input.topic, 50) || "Other",
      difficulty: ["Easy", "Medium", "Hard"].includes(input.difficulty) ? input.difficulty : "Medium",
      status: input.status || "Solved",
      createdAt: new Date().toISOString()
    };
    store.problems.push(problem);
    await writeStore(store);
    return sendJson(response, 201, problem);
  }
  const problemMatch = route.match(/^\/api\/problems\/([0-9a-f-]+)$/i);
  if (request.method === "PATCH" && problemMatch) {
    const problem = store.problems.find((item) => item.id === problemMatch[1]);
    if (!problem) return sendJson(response, 404, { error: "Problem not found." });
    const input = await readJson(request);
    if (!["Solved", "Attempted", "Todo"].includes(input.status)) {
      return sendJson(response, 400, { error: "Choose Solved, Attempted, or Todo." });
    }
    problem.status = input.status;
    await writeStore(store);
    return sendJson(response, 200, problem);
  }
  if (request.method === "DELETE" && problemMatch) {
    const remaining = store.problems.filter((item) => item.id !== problemMatch[1]);
    if (remaining.length === store.problems.length) return sendJson(response, 404, { error: "Problem not found." });
    store.problems = remaining;
    await writeStore(store);
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === "GET" && route === "/api/internships") return sendJson(response, 200, store.internships);
  if (request.method === "POST" && route === "/api/internships") {
    const input = await readJson(request);
    const company = cleanText(input.company, 100);
    const role = cleanText(input.role, 120);
    if (!company || !role) return sendJson(response, 400, { error: "Company and role are required." });
    const status = STATUSES.includes(input.status) ? input.status : "Wishlist";
    const internship = {
      id: makeId(),
      company,
      role,
      location: cleanText(input.location, 100) || "Remote",
      status,
      appliedAt: status === "Wishlist" ? "" : new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString()
    };
    store.internships.push(internship);
    await writeStore(store);
    return sendJson(response, 201, internship);
  }
  const internshipMatch = route.match(/^\/api\/internships\/([0-9a-f-]+)$/i);
  if (request.method === "PATCH" && internshipMatch) {
    const internship = store.internships.find((item) => item.id === internshipMatch[1]);
    if (!internship) return sendJson(response, 404, { error: "Application not found." });
    const input = await readJson(request);
    if (!STATUSES.includes(input.status)) return sendJson(response, 400, { error: "Choose a valid application status." });
    internship.status = input.status;
    if (input.status !== "Wishlist" && !internship.appliedAt) internship.appliedAt = new Date().toISOString().slice(0, 10);
    await writeStore(store);
    return sendJson(response, 200, internship);
  }
  if (request.method === "DELETE" && internshipMatch) {
    const remaining = store.internships.filter((item) => item.id !== internshipMatch[1]);
    if (remaining.length === store.internships.length) return sendJson(response, 404, { error: "Application not found." });
    store.internships = remaining;
    await writeStore(store);
    return sendJson(response, 200, { ok: true });
  }
  return sendJson(response, 404, { error: "API route not found." });
}

async function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, "index.html")) {
    response.writeHead(403);
    return response.end("Forbidden");
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") {
      response.writeHead(404);
      return response.end("Not found");
    }
    throw error;
  }
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else if (request.method === "GET") {
      await serveStatic(response, url.pathname);
    } else {
      sendJson(response, 405, { error: "Method not allowed." });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${request.method} ${request.url}`, error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : "The server could not complete that request." });
    else response.destroy();
  }
}

if (require.main === module) {
  http.createServer(handleRequest).listen(PORT, () => {
    console.log(`CareerPilot AI is running at http://localhost:${PORT}`);
    if (!process.env.OPENAI_API_KEY) console.log("Demo AI mode is active. Set OPENAI_API_KEY to enable live AI feedback.");
  });
}

module.exports = { handleRequest };
