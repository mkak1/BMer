const state = {
  categories: [],
  bookmarks: [],
  searchTerm: "",
  editingBookmarkId: null,
  draggedCategoryId: null,
};

const board = document.querySelector("#categoryBoard");
const bookmarkModal = document.querySelector("#bookmarkModal");
const bookmarkForm = document.querySelector("#bookmarkForm");
const categorySelect = document.querySelector("#bookmarkCategory");
const searchInput = document.querySelector("#searchInput");
const errorMessage = document.querySelector("#errorMessage");
const toast = document.querySelector("#toast");
let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || "The request could not be completed.");
  }

  return response.status === 204 ? null : response.json();
}

function showError(message = "") {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 2600);
}

function filteredBookmarks(categoryId) {
  const term = state.searchTerm;
  return state.bookmarks.filter((bookmark) => {
    if (bookmark.category_id !== categoryId) return false;
    if (!term) return true;
    return `${bookmark.title} ${bookmark.url} ${bookmark.category}`.toLowerCase().includes(term);
  });
}

function render() {
  const visibleBookmarks = state.bookmarks.filter((bookmark) => {
    if (!state.searchTerm) return true;
    return `${bookmark.title} ${bookmark.url} ${bookmark.category}`.toLowerCase().includes(state.searchTerm);
  });

  document.querySelector("#bookmarkCount").textContent = String(visibleBookmarks.length);
  document.querySelector("#categoryCount").textContent = String(state.categories.length);
  document.querySelector("#resultSummary").textContent = state.searchTerm
    ? `${visibleBookmarks.length} matching ${visibleBookmarks.length === 1 ? "bookmark" : "bookmarks"}`
    : `${state.bookmarks.length} saved ${state.bookmarks.length === 1 ? "link" : "links"}`;

  categorySelect.replaceChildren(...state.categories.map((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));

  board.replaceChildren(...state.categories.map((category) => renderCategory(category)));
  board.setAttribute("aria-busy", "false");
}

function renderCategory(category) {
  const items = filteredBookmarks(category.id);
  const card = document.createElement("article");
  card.className = "category-card";
  card.dataset.categoryId = category.id;
  card.style.setProperty("--card-accent", category.color);
  card.classList.toggle("is-collapsed", Boolean(category.collapsed));

  const header = document.createElement("div");
  header.className = "category-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "header-title";
  const colorDot = document.createElement("span");
  colorDot.className = "category-color";
  colorDot.setAttribute("aria-hidden", "true");
  const title = document.createElement("h3");
  title.textContent = category.name;
  titleWrap.append(colorDot, title);

  const headerActions = document.createElement("div");
  headerActions.className = "category-header-actions";
  const count = document.createElement("span");
  count.className = "count-pill";
  count.textContent = String(items.length);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "category-toggle icon-button";
  toggle.dataset.action = "toggle";
  toggle.setAttribute("aria-expanded", String(!category.collapsed));
  toggle.setAttribute("aria-label", `${category.collapsed ? "Expand" : "Collapse"} ${category.name}`);
  toggle.title = toggle.getAttribute("aria-label");
  toggle.textContent = category.collapsed ? "+" : "−";
  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "drag-handle icon-button";
  dragHandle.draggable = true;
  dragHandle.setAttribute("aria-label", `Reorder ${category.name}`);
  dragHandle.title = "Drag to reorder";
  dragHandle.textContent = "⠿";
  headerActions.append(count, toggle, dragHandle);
  header.append(titleWrap, headerActions);

  const body = document.createElement("div");
  body.className = `category-body ${category.collapsed ? "hidden" : "visible"}`;
  if (items.length) {
    const list = document.createElement("ul");
    list.className = "bookmark-list";
    for (const bookmark of items) list.append(renderBookmark(bookmark));
    body.append(list);
  } else {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.searchTerm ? "No bookmarks match this search." : "No bookmarks in this category yet.";
    body.append(empty);
  }

  card.append(header, body);
  return card;
}

function renderBookmark(bookmark) {
  const item = document.createElement("li");
  item.className = "bookmark-item";
  const link = document.createElement("a");
  link.href = bookmark.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = bookmark.title;
  link.title = bookmark.url;

  const actions = document.createElement("div");
  actions.className = "bookmark-actions";
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "icon-button";
  edit.dataset.action = "edit";
  edit.dataset.bookmarkId = bookmark.id;
  edit.setAttribute("aria-label", `Edit ${bookmark.title}`);
  edit.title = "Edit bookmark";
  edit.textContent = "✎";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button delete-bookmark";
  remove.dataset.action = "delete";
  remove.dataset.bookmarkId = bookmark.id;
  remove.setAttribute("aria-label", `Delete ${bookmark.title}`);
  remove.title = "Delete bookmark";
  remove.textContent = "×";
  actions.append(edit, remove);
  item.append(link, actions);
  return item;
}

async function loadState() {
  try {
    showError();
    const result = await api("/api/state");
    state.categories = result.categories;
    state.bookmarks = result.bookmarks;
    await migrateLegacyState();
    render();
  } catch (error) {
    board.setAttribute("aria-busy", "false");
    showError(`${error.message} Check that the BMer server is running and reload the page.`);
  }
}

async function migrateLegacyState() {
  const migrationKey = "bmer-server-migrated-v1";
  const legacyData = localStorage.getItem("bmer-state-v1");
  if (!legacyData || localStorage.getItem(migrationKey)) return;

  let legacy;
  try {
    legacy = JSON.parse(legacyData);
  } catch {
    localStorage.setItem(migrationKey, "done");
    return;
  }

  const categoryNames = [...new Set([
    ...(Array.isArray(legacy.categoryOrder) ? legacy.categoryOrder : []),
    ...(Array.isArray(legacy.bookmarks) ? legacy.bookmarks.map((bookmark) => bookmark.category) : []),
  ])].filter((name) => typeof name === "string" && name.trim());

  for (const name of categoryNames) {
    if (!state.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      const created = await api("/api/categories", { method: "POST", body: JSON.stringify({ name }) });
      state.categories.push(created);
    }
  }

  for (const bookmark of Array.isArray(legacy.bookmarks) ? legacy.bookmarks : []) {
    if (!bookmark.title || !bookmark.url || !bookmark.category) continue;
    if (state.bookmarks.some((item) => item.url === bookmark.url && item.title === bookmark.title)) continue;
    const category = state.categories.find((item) => item.name.toLowerCase() === bookmark.category.toLowerCase());
    if (!category) continue;
    const created = await api("/api/bookmarks", {
      method: "POST",
      body: JSON.stringify({ title: bookmark.title, url: bookmark.url, categoryId: category.id }),
    });
    state.bookmarks.push(created);
  }

  if (Array.isArray(legacy.categoryOrder)) {
    const ordered = legacy.categoryOrder
      .map((name) => state.categories.find((category) => category.name === name)?.id)
      .filter(Boolean);
    const remaining = state.categories.filter((category) => !ordered.includes(category.id)).map((category) => category.id);
    if (ordered.length + remaining.length === state.categories.length) {
      await api("/api/categories/order", {
        method: "PATCH",
        body: JSON.stringify({ ids: [...ordered, ...remaining] }),
      });
      state.categories.sort((left, right) => [...ordered, ...remaining].indexOf(left.id) - [...ordered, ...remaining].indexOf(right.id));
    }
  }

  const collapseState = legacy.categoryCollapseState || {};
  for (const category of state.categories) {
    if (collapseState[category.name] === true) {
      await api(`/api/categories/${category.id}/collapsed`, {
        method: "PATCH",
        body: JSON.stringify({ collapsed: true }),
      });
      category.collapsed = 1;
    }
  }

  localStorage.setItem(migrationKey, "done");
  showToast("Your existing bookmarks were imported.");
}

function openModal(bookmark = null) {
  state.editingBookmarkId = bookmark?.id ?? null;
  document.querySelector("#modalTitle").textContent = bookmark ? "Edit bookmark" : "Add bookmark";
  document.querySelector("#submitBookmarkBtn").textContent = bookmark ? "Save changes" : "Add bookmark";
  document.querySelector("#bookmarkTitle").value = bookmark?.title ?? "";
  document.querySelector("#bookmarkUrl").value = bookmark?.url ?? "";
  document.querySelector("#newCategoryInput").value = "";
  if (bookmark) categorySelect.value = bookmark.category_id;
  bookmarkModal.hidden = false;
  bookmarkModal.setAttribute("aria-hidden", "false");
  document.querySelector("#bookmarkTitle").focus();
}

function closeModal() {
  bookmarkModal.hidden = true;
  bookmarkModal.setAttribute("aria-hidden", "true");
  bookmarkForm.reset();
  state.editingBookmarkId = null;
}

document.querySelector("#addBookmarkBtn").addEventListener("click", () => openModal());
document.querySelector("#closeModalBtn").addEventListener("click", closeModal);
document.querySelector("#cancelBtn").addEventListener("click", closeModal);
bookmarkModal.addEventListener("click", (event) => {
  if (event.target.dataset.close === "true") closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !bookmarkModal.hidden) closeModal();
});

searchInput.addEventListener("input", () => {
  state.searchTerm = searchInput.value.trim().toLowerCase();
  render();
});

bookmarkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    title: document.querySelector("#bookmarkTitle").value.trim(),
    url: document.querySelector("#bookmarkUrl").value.trim(),
    categoryId: Number(categorySelect.value),
  };

  try {
    const wasEditing = Boolean(state.editingBookmarkId);
    const path = state.editingBookmarkId
      ? `/api/bookmarks/${state.editingBookmarkId}`
      : "/api/bookmarks";
    const method = state.editingBookmarkId ? "PUT" : "POST";
    await api(path, { method, body: JSON.stringify(payload) });
    closeModal();
    await loadState();
    showToast(wasEditing ? "Bookmark updated." : "Bookmark saved.");
  } catch (error) {
    showError(error.message);
  }
});

// Capture edit/delete actions in one place so cards can be re-rendered freely.
board.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-action]");
  if (!action) return;
  const card = action.closest(".category-card");
  const categoryId = Number(card?.dataset.categoryId);

  try {
    if (action.dataset.action === "toggle") {
      const category = state.categories.find((item) => item.id === categoryId);
      category.collapsed = category.collapsed ? 0 : 1;
      render();
      await api(`/api/categories/${categoryId}/collapsed`, {
        method: "PATCH",
        body: JSON.stringify({ collapsed: Boolean(category.collapsed) }),
      });
    } else if (action.dataset.action === "edit") {
      const bookmark = state.bookmarks.find((item) => item.id === Number(action.dataset.bookmarkId));
      if (bookmark) openModal(bookmark);
    } else if (action.dataset.action === "delete") {
      const bookmark = state.bookmarks.find((item) => item.id === Number(action.dataset.bookmarkId));
      if (!bookmark || !window.confirm(`Delete “${bookmark.title}”?`)) return;
      await api(`/api/bookmarks/${bookmark.id}`, { method: "DELETE" });
      await loadState();
      showToast("Bookmark deleted.");
    }
  } catch (error) {
    await loadState();
    showError(error.message);
  }
});

document.querySelector("#addCategoryBtn").addEventListener("click", async () => {
  const input = document.querySelector("#newCategoryInput");
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }

  try {
    const category = await api("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    state.categories.push(category);
    input.value = "";
    render();
    categorySelect.value = category.id;
    showToast("Category created.");
  } catch (error) {
    showError(error.message);
  }
});

document.querySelector("#newCategoryInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#addCategoryBtn").click();
  }
});

board.addEventListener("dragstart", (event) => {
  const handle = event.target.closest(".drag-handle");
  if (!handle) {
    event.preventDefault();
    return;
  }
  const card = handle.closest(".category-card");
  state.draggedCategoryId = Number(card.dataset.categoryId);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", String(state.draggedCategoryId));
  card.classList.add("dragging");
});

board.addEventListener("dragover", (event) => {
  const card = event.target.closest(".category-card");
  if (!card || Number(card.dataset.categoryId) === state.draggedCategoryId) return;
  event.preventDefault();
  card.classList.add("drag-target");
});

board.addEventListener("dragleave", (event) => {
  const card = event.target.closest(".category-card");
  if (card && !card.contains(event.relatedTarget)) card.classList.remove("drag-target");
});

board.addEventListener("drop", async (event) => {
  const target = event.target.closest(".category-card");
  if (!target || !state.draggedCategoryId) return;
  event.preventDefault();
  const targetId = Number(target.dataset.categoryId);
  const fromIndex = state.categories.findIndex((item) => item.id === state.draggedCategoryId);
  const toIndex = state.categories.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

  const [moved] = state.categories.splice(fromIndex, 1);
  state.categories.splice(toIndex, 0, moved);
  render();
  try {
    await api("/api/categories/order", {
      method: "PATCH",
      body: JSON.stringify({ ids: state.categories.map((category) => category.id) }),
    });
  } catch (error) {
    await loadState();
    showError(error.message);
  }
});

board.addEventListener("dragend", () => {
  state.draggedCategoryId = null;
  document.querySelectorAll(".category-card").forEach((card) => {
    card.classList.remove("dragging", "drag-target");
  });
});

loadState();
