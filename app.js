const GITHUB_OWNER = "waxew";
const PAGE_SIZE = 100;
const CACHE_KEY = "as-projects-github-repos-v1";
const CACHE_TTL_MS = 5 * 60 * 1000;

const elements = {
  grid: document.getElementById("projectGrid"),
  template: document.getElementById("projectCardTemplate"),
  loading: document.getElementById("loadingState"),
  error: document.getElementById("errorState"),
  errorMessage: document.getElementById("errorMessage"),
  empty: document.getElementById("emptyState"),
  retry: document.getElementById("retryButton"),
  search: document.getElementById("searchInput"),
  resultCount: document.getElementById("resultCount"),
  onlineCount: document.getElementById("onlineCount"),
  academyCount: document.getElementById("academyCount"),
  appCount: document.getElementById("appCount"),
  lastUpdated: document.getElementById("lastUpdated"),
  filters: Array.from(document.querySelectorAll(".filter-chip"))
};

let projects = [];
let activeFilter = "all";

function getCategory(repo) {
  const name = repo.name.toLowerCase();
  if (name.startsWith("as-academy-") || name.includes("academy")) return "academy";
  if (name.startsWith("app-") || name === "as-storagebox") return "apps";
  return "other";
}

function getCategoryLabel(category) {
  if (category === "academy") return "AS Academy";
  if (category === "apps") return "Application";
  return "Other";
}

function getIconText(category) {
  if (category === "academy") return "EDU";
  if (category === "apps") return "APP";
  return "WEB";
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    return `بروزرسانی ${new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date)}`;
  } catch {
    return "";
  }
}

function normalizeRepo(repo) {
  const category = getCategory(repo);
  return {
    name: repo.name,
    description: repo.description || "نسخه وب این پروژه از طریق GitHub Pages منتشر شده است.",
    category,
    categoryLabel: getCategoryLabel(category),
    icon: getIconText(category),
    repoUrl: repo.html_url,
    webUrl: `https://${GITHUB_OWNER}.github.io/${repo.name}/`,
    updatedAt: repo.pushed_at || repo.updated_at
  };
}

function renderStats() {
  const academies = projects.filter(project => project.category === "academy").length;
  const apps = projects.filter(project => project.category === "apps").length;
  elements.onlineCount.textContent = String(projects.length);
  elements.academyCount.textContent = String(academies);
  elements.appCount.textContent = String(apps);
}

function filteredProjects() {
  const term = elements.search.value.trim().toLowerCase();
  return projects.filter(project => {
    const categoryMatches = activeFilter === "all" || project.category === activeFilter;
    const searchMatches = !term || `${project.name} ${project.description}`.toLowerCase().includes(term);
    return categoryMatches && searchMatches;
  });
}

function renderProjects() {
  const visible = filteredProjects();
  elements.grid.innerHTML = "";
  elements.resultCount.textContent = `${visible.length} پروژه`;
  elements.empty.classList.toggle("is-hidden", visible.length !== 0);
  elements.grid.classList.toggle("is-hidden", visible.length === 0);

  visible.forEach(project => {
    const node = elements.template.content.cloneNode(true);
    node.querySelector(".category-badge").textContent = project.categoryLabel;
    node.querySelector(".project-icon").textContent = project.icon;
    node.querySelector(".project-title").textContent = project.name;
    node.querySelector(".project-description").textContent = project.description;
    node.querySelector(".updated-at").textContent = formatDate(project.updatedAt);
    node.querySelector(".web-link").href = project.webUrl;
    node.querySelector(".repo-link").href = project.repoUrl;
    elements.grid.appendChild(node);
  });
}

function useRepos(repos, sourceLabel) {
  projects = repos
    .filter(repo =>
      repo.has_pages &&
      !repo.archived &&
      !repo.fork &&
      repo.name.toLowerCase() !== `${GITHUB_OWNER}.github.io`
    )
    .map(normalizeRepo)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  elements.loading.classList.add("is-hidden");
  elements.error.classList.add("is-hidden");
  renderStats();
  renderProjects();
  elements.lastUpdated.textContent = sourceLabel;
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (!cached || !Array.isArray(cached.repos) || !cached.savedAt) return null;
    if (Date.now() - cached.savedAt > CACHE_TTL_MS) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeCache(repos) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ repos, savedAt: Date.now() }));
  } catch {
    // Local storage is optional; the dashboard works without it.
  }
}

async function fetchAllRepos() {
  const allRepos = [];
  for (let page = 1; page <= 10; page += 1) {
    const url = `https://api.github.com/users/${GITHUB_OWNER}/repos?per_page=${PAGE_SIZE}&page=${page}&sort=updated`;
    const response = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`GitHub API: ${response.status}`);
    const batch = await response.json();
    allRepos.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return allRepos;
}

async function loadProjects(forceRefresh = false) {
  elements.loading.classList.remove("is-hidden");
  elements.error.classList.add("is-hidden");
  elements.empty.classList.add("is-hidden");
  elements.grid.classList.add("is-hidden");
  elements.resultCount.textContent = "در حال دریافت…";

  if (!forceRefresh) {
    const cached = readCache();
    if (cached) {
      useRepos(cached.repos, "همگام‌شده با GitHub · Cache حداکثر ۵ دقیقه");
      return;
    }
  }

  try {
    const repos = await fetchAllRepos();
    writeCache(repos);
    const stamp = new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date());
    useRepos(repos, `همگام‌شده با GitHub · ${stamp}`);
  } catch (error) {
    elements.loading.classList.add("is-hidden");
    elements.error.classList.remove("is-hidden");
    elements.resultCount.textContent = "خطا در دریافت";
    elements.errorMessage.textContent = "GitHub API در دسترس نبود. چند لحظه بعد دوباره تلاش کنید.";
    console.error(error);
  }
}

elements.search.addEventListener("input", renderProjects);
elements.retry.addEventListener("click", () => loadProjects(true));

elements.filters.forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    elements.filters.forEach(item => item.classList.toggle("is-active", item === button));
    renderProjects();
  });
});

loadProjects();
