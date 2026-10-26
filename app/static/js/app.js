const state = {
  categories: [],
  bookmarks: [],
  searchTerm: "",
  editingBookmarkId: null,
  pointerDrag: null,
  suppressCategoryClick: false,
};

const board = document.querySelector("#categoryBoard");
const bookmarkModal = document.querySelector("#bookmarkModal");
const categoryModal = document.querySelector("#categoryModal");
const bookmarkForm = document.querySelector("#bookmarkForm");
const categoryForm = document.querySelector("#categoryForm");
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
  }).sort((left, right) => left.title.localeCompare(right.title, undefined, {
    sensitivity: "base",
    numeric: true,
  }));
}

function render() {
  const visibleBookmarks = state.bookmarks.filter((bookmark) => {
    if (!state.searchTerm) return true;
    return `${bookmark.title} ${bookmark.url} ${bookmark.category}`.toLowerCase().includes(state.searchTerm);
  });

  document.querySelector("#resultSummary").textContent = state.searchTerm
    ? `${visibleBookmarks.length} matching ${visibleBookmarks.length === 1 ? "bookmark" : "bookmarks"}`
    : `${state.bookmarks.length} saved ${state.bookmarks.length === 1 ? "link" : "links"}`;

  categorySelect.replaceChildren(...state.categories.map((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));

  const matchingCategories = state.categories
    .map((category, index) => ({ category, index, matchCount: filteredBookmarks(category.id).length }))
    .filter(({ matchCount }) => !state.searchTerm || matchCount > 0)
    .sort((left, right) => state.searchTerm
      ? right.matchCount - left.matchCount || left.index - right.index
      : left.index - right.index)
    .map(({ category }) => category);

  board.replaceChildren(renderAddCategoryCard(), ...matchingCategories.map((category) => renderCategory(category)));
  board.classList.toggle("is-searching", Boolean(state.searchTerm));
  board.setAttribute("aria-busy", "false");
}

function renderAddCategoryCard() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "add-category-card";
  button.dataset.action = "add-category";
  button.setAttribute("aria-label", "Add category");

  const icon = document.createElement("span");
  icon.className = "add-category-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "+";
  const label = document.createElement("span");
  label.textContent = "Add category";
  button.append(icon, label);
  return button;
}

function renderCategory(category) {
  const items = filteredBookmarks(category.id);
  const card = document.createElement("article");
  card.className = "category-card";
  card.dataset.categoryId = category.id;
  card.style.setProperty("--card-accent", category.color);
  const collapsed = Boolean(category.collapsed);

  const header = document.createElement("div");
  header.className = "category-header";
  header.setAttribute("role", "button");
  header.tabIndex = 0;
  header.setAttribute("aria-expanded", String(!collapsed));
  header.setAttribute("aria-controls", `category-body-${category.id}`);

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
  headerActions.append(count);
  header.append(titleWrap, headerActions);

  const body = document.createElement("div");
  body.id = `category-body-${category.id}`;
  body.className = `category-body ${collapsed ? "hidden" : "visible"}`;
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

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "category-add-button";
  addButton.dataset.action = "add-bookmark";
  addButton.setAttribute("aria-label", `Add bookmark to ${category.name}`);
  addButton.title = `Add bookmark to ${category.name}`;
  addButton.textContent = "+";
  body.append(addButton);

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

function openModal(bookmark = null, categoryId = null) {
  state.editingBookmarkId = bookmark?.id ?? null;
  document.querySelector("#modalTitle").textContent = bookmark ? "Edit bookmark" : "Add bookmark";
  document.querySelector("#submitBookmarkBtn").textContent = bookmark ? "Save changes" : "Add bookmark";
  document.querySelector("#bookmarkTitle").value = bookmark?.title ?? "";
  document.querySelector("#bookmarkUrl").value = bookmark?.url ?? "";
  document.querySelector("#newCategoryInput").value = "";
  if (bookmark) categorySelect.value = bookmark.category_id;
  else if (categoryId !== null) categorySelect.value = categoryId;
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

function openCategoryModal() {
  categoryForm.reset();
  categoryModal.hidden = false;
  categoryModal.setAttribute("aria-hidden", "false");
  document.querySelector("#categoryNameInput").focus();
}

function closeCategoryModal() {
  categoryModal.hidden = true;
  categoryModal.setAttribute("aria-hidden", "true");
  categoryForm.reset();
}

document.querySelector("#closeModalBtn").addEventListener("click", closeModal);
document.querySelector("#cancelBtn").addEventListener("click", closeModal);
document.querySelector("#closeCategoryModalBtn").addEventListener("click", closeCategoryModal);
document.querySelector("#cancelCategoryBtn").addEventListener("click", closeCategoryModal);
bookmarkModal.addEventListener("click", (event) => {
  if (event.target.dataset.close === "true") closeModal();
});
categoryModal.addEventListener("click", (event) => {
  if (event.target.dataset.close === "true") closeCategoryModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !bookmarkModal.hidden) closeModal();
  if (event.key === "Escape" && !categoryModal.hidden) closeCategoryModal();
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

categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#categoryNameInput").value.trim();
  if (!name) return;

  try {
    await createCategory(name);
    closeCategoryModal();
  } catch (error) {
    showError(error.message);
  }
});

// Capture edit/delete actions in one place so cards can be re-rendered freely.
board.addEventListener("click", async (event) => {
  const header = event.target.closest(".category-header");
  if (header) {
    if (state.suppressCategoryClick) {
      state.suppressCategoryClick = false;
      return;
    }
    const category = state.categories.find((item) => item.id === Number(header.closest(".category-card").dataset.categoryId));
    if (!category) return;
    category.collapsed = category.collapsed ? 0 : 1;
    render();
    try {
      await api(`/api/categories/${category.id}/collapsed`, {
        method: "PATCH",
        body: JSON.stringify({ collapsed: Boolean(category.collapsed) }),
      });
    } catch (error) {
      await loadState();
      showError(error.message);
    }
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;
  const card = action.closest(".category-card");
  const categoryId = Number(card?.dataset.categoryId);

  try {
    if (action.dataset.action === "add-bookmark") {
      openModal(null, categoryId);
    } else if (action.dataset.action === "add-category") {
      openCategoryModal();
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
    const category = await createCategory(name);
    input.value = "";
    categorySelect.value = category.id;
  } catch (error) {
    showError(error.message);
  }
});

async function createCategory(name) {
  const category = await api("/api/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  state.categories.push(category);
  render();
  showToast("Category created.");
  return category;
}

document.querySelector("#newCategoryInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#addCategoryBtn").click();
  }
});

board.addEventListener("pointerdown", (event) => {
  if (state.searchTerm) return;
  const header = event.target.closest(".category-header");
  const handle = event.target.closest(".drag-handle");
  if (!header || (event.target.closest("button") && !handle) || event.button !== 0) return;
  const card = header.closest(".category-card");
  state.pointerDrag = {
    pointerId: event.pointerId,
    categoryId: Number(card.dataset.categoryId),
    card,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - card.getBoundingClientRect().left,
    offsetY: event.clientY - card.getBoundingClientRect().top,
    latestX: event.clientX,
    latestY: event.clientY,
    frameId: null,
    active: false,
  };
});

board.addEventListener("keydown", (event) => {
  const header = event.target.closest(".category-header[role='button']");
  if (!header || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  header.click();
});

document.addEventListener("pointermove", (event) => {
  const drag = state.pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  event.preventDefault();
  drag.latestX = event.clientX;
  drag.latestY = event.clientY;
  if (drag.frameId === null) {
    drag.frameId = requestAnimationFrame(() => updateCategoryDrag(drag));
  }
});

document.addEventListener("pointerup", async (event) => {
  const drag = state.pointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.latestX = event.clientX;
  drag.latestY = event.clientY;
  if (drag.frameId !== null) cancelAnimationFrame(drag.frameId);
  drag.frameId = null;
  updateCategoryDrag(drag);
  state.pointerDrag = null;
  board.classList.remove("is-reordering");
  if (!drag.active) return;
  state.suppressCategoryClick = true;
  window.setTimeout(() => {
    state.suppressCategoryClick = false;
  }, 0);

  drag.preview.remove();
  drag.placeholder.replaceWith(drag.card);
  drag.card.hidden = false;
  const order = [...board.children]
    .filter((element) => element.classList.contains("category-card"))
    .map((card) => Number(card.dataset.categoryId));
  await persistCategoryOrder(order);
});

document.addEventListener("pointercancel", async () => {
  const drag = state.pointerDrag;
  state.pointerDrag = null;
  board.classList.remove("is-reordering");
  if (drag && drag.frameId !== null) cancelAnimationFrame(drag.frameId);
  if (drag?.active) {
    drag.preview.remove();
    await loadState();
  }
});

function beginCategoryDrag(drag) {
  board.classList.add("is-reordering");
  window.getSelection()?.removeAllRanges();
  const rect = drag.card.getBoundingClientRect();
  const placeholder = document.createElement("article");
  placeholder.className = "category-drop-placeholder is-nearest";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.style.width = `${rect.width}px`;
  placeholder.style.height = `${rect.height}px`;
  drag.card.before(placeholder);
  drag.card.hidden = true;

  const preview = drag.card.cloneNode(true);
  preview.hidden = false;
  preview.classList.remove("dragging", "drag-target");
  preview.classList.add("category-drag-preview");
  preview.removeAttribute("data-category-id");
  preview.setAttribute("aria-hidden", "true");
  preview.style.width = `${rect.width}px`;
  preview.style.left = `${drag.startX - drag.offsetX}px`;
  preview.style.top = `${drag.startY - drag.offsetY}px`;
  document.body.append(preview);

  drag.placeholder = placeholder;
  drag.preview = preview;
  drag.active = true;
  drag.card.remove();
}

function updateCategoryDrag(drag) {
  drag.frameId = null;
  if (!drag.active && Math.hypot(drag.latestX - drag.startX, drag.latestY - drag.startY) < 8) return;
  if (!drag.active) beginCategoryDrag(drag);
  drag.preview.style.setProperty("--drag-x", `${drag.latestX - drag.startX}px`);
  drag.preview.style.setProperty("--drag-y", `${drag.latestY - drag.startY}px`);
  positionCategoryPlaceholder(drag, drag.latestX, drag.latestY);
}

function positionCategoryPlaceholder(drag, pointerX, pointerY) {
  const cards = [...board.querySelectorAll(".category-card:not([hidden])")]
    .filter((card) => Number(card.dataset.categoryId) !== drag.categoryId);
  if (!cards.length) return;

  const measurements = cards.map((card) => {
    card.getAnimations().forEach((animation) => animation.cancel());
    return { card, rect: card.getBoundingClientRect() };
  });
  const nearest = measurements.reduce((best, item) => {
    const { card, rect } = item;
    const distance = Math.hypot(pointerX - (rect.left + rect.width / 2), pointerY - (rect.top + rect.height / 2));
    return !best || distance < best.distance ? { ...item, distance } : best;
  }, null);
  const deltaX = pointerX - (nearest.rect.left + nearest.rect.width / 2);
  const deltaY = pointerY - (nearest.rect.top + nearest.rect.height / 2);
  const insertBefore = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX < 0 : deltaY < 0;
  const isAlreadyPositioned = insertBefore
    ? drag.placeholder.nextElementSibling === nearest.card
    : drag.placeholder.previousElementSibling === nearest.card;
  if (isAlreadyPositioned) return;

  const positions = new Map(measurements.map(({ card, rect }) => [card, rect]));
  drag.placeholder.getAnimations().forEach((animation) => animation.cancel());
  positions.set(drag.placeholder, drag.placeholder.getBoundingClientRect());
  if (insertBefore) nearest.card.before(drag.placeholder);
  else nearest.card.after(drag.placeholder);
  animateCategoryShift(positions);
}

function animateCategoryShift(previousPositions) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (const [card, previous] of previousPositions) {
    const next = card.getBoundingClientRect();
    const deltaX = previous.left - next.left;
    const deltaY = previous.top - next.top;
    if (!deltaX && !deltaY) continue;
    card.getAnimations().forEach((animation) => animation.cancel());
    card.animate(
      [{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }],
      { duration: 210, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)" },
    );
  }
}

async function persistCategoryOrder(order) {
  const orderIndex = new Map(order.map((id, index) => [id, index]));
  state.categories.sort((left, right) => orderIndex.get(left.id) - orderIndex.get(right.id));
  render();

  try {
    await api("/api/categories/order", {
      method: "PATCH", body: JSON.stringify({ ids: order }),
    });
  } catch (error) {
    await loadState();
    showError(error.message);
  }
}

loadState();
