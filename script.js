// Bookmark app — stores bookmarks AND categories in localStorage (no server).

const STORAGE_KEY = "bookmarks";
const CATEGORIES_KEY = "categories";
const COLLAPSED_KEY = "collapsedCategories";

// Grab the elements we'll work with.
const categoryForm = document.getElementById("category-form");
const categoryInput = document.getElementById("category-input");
const categoryError = document.getElementById("category-error");

const form = document.getElementById("bookmark-form");
const nameInput = document.getElementById("name-input");
const urlInput = document.getElementById("url-input");
const categorySelect = document.getElementById("category-select");
const errorEl = document.getElementById("form-error");

const groupsEl = document.getElementById("bookmark-groups");
const emptyState = document.getElementById("empty-state");

const toolbar = document.getElementById("toolbar");
const searchInput = document.getElementById("search-input");
const toggleAllBtn = document.getElementById("toggle-all");
const noResults = document.getElementById("no-results");

// Which bookmark is currently being edited (null = none). When this matches a
// bookmark's id, that row renders as an inline edit form instead of a link.
let editingId = null;

// The current search text (lower-cased). Empty string means "show everything".
let searchQuery = "";

// --- Data helpers ---------------------------------------------------------

function loadBookmarks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveBookmarks(bookmarks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

function loadCategories() {
  const raw = localStorage.getItem(CATEGORIES_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveCategories(categories) {
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
}

// Collapsed categories are stored as an array of category ids. We keep it as a
// Set in memory for quick has()/add()/delete(), and persist it as an array.
function loadCollapsed() {
  const raw = localStorage.getItem(COLLAPSED_KEY);
  return new Set(raw ? JSON.parse(raw) : []);
}

function saveCollapsed(set) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
}

// Flip one category between collapsed and expanded, then re-render.
function toggleCollapsed(categoryId) {
  const collapsed = loadCollapsed();
  if (collapsed.has(categoryId)) {
    collapsed.delete(categoryId);
  } else {
    collapsed.add(categoryId);
  }
  saveCollapsed(collapsed);
  render();
}

// --- Small utilities ------------------------------------------------------

// Pull the hostname out of a URL for a compact, readable label (e.g.
// "claude.ai" instead of the full "https://claude.ai/chat/..."). Falls back to
// the raw string if the URL can't be parsed.
function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A tiny favicon for a bookmark, fetched from Google's favicon service. If it
// fails to load we just hide the broken-image icon.
function buildFavicon(url) {
  const img = document.createElement("img");
  img.className = "bookmark__favicon";
  img.width = 16;
  img.height = 16;
  img.alt = "";
  img.loading = "lazy";
  img.src = `https://www.google.com/s/favicons?sz=32&domain=${hostnameOf(url)}`;
  img.addEventListener("error", () => {
    img.style.visibility = "hidden";
  });
  return img;
}

// Does a bookmark match the current search text? Matches on name or URL.
function matchesSearch(bookmark) {
  if (!searchQuery) return true;
  return (
    bookmark.name.toLowerCase().includes(searchQuery) ||
    bookmark.url.toLowerCase().includes(searchQuery)
  );
}

// --- Rendering ------------------------------------------------------------

// Fill the category <select> with the current categories, keeping the user's
// current pick selected if it still exists.
function populateCategorySelect(categories) {
  const previous = categorySelect.value;
  categorySelect.innerHTML = "";

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.append(option);
  });

  // Restore the previous selection when possible.
  if (categories.some((c) => c.id === previous)) {
    categorySelect.value = previous;
  }
}

// Build one bookmark row (a <li>). If this bookmark is being edited, the row
// shows the edit form instead of the usual name/link display.
function buildBookmarkItem(bookmark) {
  const li = document.createElement("li");
  li.className = "bookmark";

  if (bookmark.id === editingId) {
    li.append(buildEditForm(bookmark));
    return li;
  }

  const favicon = buildFavicon(bookmark.url);

  const info = document.createElement("div");
  info.className = "bookmark__info";

  // Use textContent (never innerHTML) so a name/URL can't inject HTML.
  const name = document.createElement("span");
  name.className = "bookmark__name";
  name.textContent = bookmark.name;

  // Compact rows show just the hostname; the full URL stays in href + title.
  const link = document.createElement("a");
  link.className = "bookmark__link";
  link.href = bookmark.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = bookmark.url;
  link.textContent = hostnameOf(bookmark.url);

  info.append(name, link);

  // Action buttons: Edit (inline form) and Delete (remove this bookmark).
  const actions = document.createElement("div");
  actions.className = "bookmark__actions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn--ghost";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => startEdit(bookmark.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn btn--danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => {
    // A quick confirm so a click can't wipe a bookmark by accident.
    if (confirm(`Delete "${bookmark.name}"?`)) {
      deleteBookmark(bookmark.id);
    }
  });

  actions.append(editBtn, deleteBtn);

  li.append(favicon, info, actions);
  return li;
}

// Build the inline edit form shown in place of a bookmark while editing.
// Lets you change the name, link, and category. Save validates and writes;
// Cancel discards. Enter saves, Escape cancels.
function buildEditForm(bookmark) {
  const editForm = document.createElement("form");
  editForm.className = "bookmark__edit";
  editForm.autocomplete = "off";

  const nameField = document.createElement("input");
  nameField.type = "text";
  nameField.className = "input";
  nameField.value = bookmark.name;
  nameField.setAttribute("aria-label", "Edit name");

  const urlField = document.createElement("input");
  urlField.type = "url";
  urlField.className = "input";
  urlField.value = bookmark.url;
  urlField.setAttribute("aria-label", "Edit link");

  // Category picker, pre-selected to the bookmark's current category.
  const categoryField = document.createElement("select");
  categoryField.className = "input";
  categoryField.setAttribute("aria-label", "Edit category");
  loadCategories().forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categoryField.append(option);
  });
  categoryField.value = bookmark.categoryId;

  const error = document.createElement("p");
  error.className = "form__error";

  const actions = document.createElement("div");
  actions.className = "bookmark__edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "btn btn--primary";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", cancelEdit);

  actions.append(saveBtn, cancelBtn);
  editForm.append(nameField, urlField, categoryField, actions, error);

  // Save on submit (covers clicking Save and pressing Enter in a field).
  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const newName = nameField.value.trim();
    const newUrl = urlField.value.trim();

    if (!newName || !newUrl) {
      error.textContent = "Please fill in both a name and a link.";
      return;
    }

    updateBookmark(bookmark.id, newName, newUrl, categoryField.value);
  });

  // Escape cancels editing.
  editForm.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelEdit();
  });

  // Put the cursor in the name field once the form is on the page.
  queueMicrotask(() => nameField.focus());

  return editForm;
}

// Build one category group: a clickable heading that collapses/expands its
// bookmarks (or a faint hint when the category is still empty). The count pill
// stays visible even when collapsed, so you can see what's inside at a glance.
//
// `isCollapsed` controls the folded state. While a search is active the caller
// forces groups open so matches are always visible.
function buildGroup(id, title, bookmarks, isCollapsed) {
  const group = document.createElement("section");
  group.className = "group";
  if (isCollapsed) group.classList.add("group--collapsed");

  // The heading is a real <button> so it's keyboard-focusable and toggles on
  // Enter/Space for free.
  const heading = document.createElement("button");
  heading.type = "button";
  heading.className = "group__heading";
  heading.setAttribute("aria-expanded", String(!isCollapsed));

  const chevron = document.createElement("span");
  chevron.className = "group__chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▸";

  const titleEl = document.createElement("span");
  titleEl.className = "group__title";
  titleEl.textContent = title;

  const count = document.createElement("span");
  count.className = "group__count";
  count.textContent = bookmarks.length;

  heading.append(chevron, titleEl, count);
  heading.addEventListener("click", () => toggleCollapsed(id));
  group.append(heading);

  // The collapsible body. Skipped entirely when the group is folded.
  if (!isCollapsed) {
    if (bookmarks.length === 0) {
      const hint = document.createElement("p");
      hint.className = "group__empty";
      hint.textContent = "No bookmarks here yet.";
      group.append(hint);
    } else {
      const list = document.createElement("ul");
      list.className = "list";
      bookmarks.forEach((bookmark) => list.append(buildBookmarkItem(bookmark)));
      group.append(list);
    }
  }

  return group;
}

// Synthetic id for the catch-all "Uncategorized" group.
const UNCATEGORIZED_ID = "__uncategorized__";

// Rebuild everything on screen from the saved data.
function render() {
  const categories = loadCategories();
  const bookmarks = loadBookmarks();
  const collapsed = loadCollapsed();
  const searching = searchQuery !== "";

  populateCategorySelect(categories);
  groupsEl.innerHTML = "";

  // Nothing to group under until at least one category exists.
  if (categories.length === 0) {
    emptyState.style.display = "block";
    toolbar.hidden = true;
    noResults.hidden = true;
    return;
  }
  emptyState.style.display = "none";
  toolbar.hidden = false;

  // Build the list of groups to show: one per category, plus a catch-all for
  // orphaned bookmarks. While searching, only matching bookmarks are kept and
  // empty groups are dropped so results stand out.
  const knownIds = new Set(categories.map((c) => c.id));
  const groups = categories.map((category) => ({
    id: category.id,
    title: category.name,
    items: bookmarks.filter((b) => b.categoryId === category.id && matchesSearch(b)),
  }));

  const orphans = bookmarks.filter(
    (b) => !knownIds.has(b.categoryId) && matchesSearch(b)
  );
  if (orphans.length > 0) {
    groups.push({ id: UNCATEGORIZED_ID, title: "Uncategorized", items: orphans });
  }

  let shown = 0;
  groups.forEach((g) => {
    // While searching, hide groups with no matches and force the rest open.
    if (searching && g.items.length === 0) return;
    const isCollapsed = !searching && collapsed.has(g.id);
    groupsEl.append(buildGroup(g.id, g.title, g.items, isCollapsed));
    shown += 1;
  });

  // "No results" only applies while searching.
  noResults.hidden = !(searching && shown === 0);

  updateToggleAllLabel();
}

// The bulk button reads "Expand all" when everything is already collapsed,
// otherwise "Collapse all".
function updateToggleAllLabel() {
  const categories = loadCategories();
  const collapsed = loadCollapsed();
  const allCollapsed =
    categories.length > 0 && categories.every((c) => collapsed.has(c.id));
  toggleAllBtn.textContent = allCollapsed ? "Expand all" : "Collapse all";
}

// --- Actions --------------------------------------------------------------

function addCategory(name) {
  const categories = loadCategories();
  const newCategory = { id: Date.now().toString(), name: name };
  categories.push(newCategory);
  saveCategories(categories);
  render();
  // Select the just-created category so the next bookmark lands in it.
  categorySelect.value = newCategory.id;
}

function addBookmark(name, url, categoryId) {
  const bookmarks = loadBookmarks();
  bookmarks.push({
    id: Date.now().toString(),
    name: name,
    url: url,
    categoryId: categoryId,
  });
  saveBookmarks(bookmarks);
  render();
}

// Remove a bookmark by its id.
function deleteBookmark(id) {
  const bookmarks = loadBookmarks().filter((b) => b.id !== id);
  saveBookmarks(bookmarks);
  render();
}

// Switch a bookmark's row into edit mode.
function startEdit(id) {
  editingId = id;
  render();
}

// Leave edit mode without saving.
function cancelEdit() {
  editingId = null;
  render();
}

// Save edited values back to the matching bookmark, keeping its id. The new
// categoryId may differ, which moves the bookmark to another group.
function updateBookmark(id, name, url, categoryId) {
  const bookmarks = loadBookmarks().map((b) =>
    b.id === id ? { ...b, name: name, url: url, categoryId: categoryId } : b
  );
  saveBookmarks(bookmarks);
  editingId = null;
  render();
}

// --- Form handling --------------------------------------------------------

categoryForm.addEventListener("submit", (event) => {
  event.preventDefault();
  categoryError.textContent = "";

  const name = categoryInput.value.trim();
  if (!name) {
    categoryError.textContent = "Please enter a category name.";
    return;
  }

  // Reject duplicates (case-insensitive) so the list stays tidy.
  const exists = loadCategories().some(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) {
    categoryError.textContent = `"${name}" already exists.`;
    return;
  }

  addCategory(name);
  categoryForm.reset();
  categoryInput.focus();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  const categoryId = categorySelect.value;

  if (!categoryId) {
    errorEl.textContent = "Create a category first, then pick it here.";
    return;
  }
  if (!name || !url) {
    errorEl.textContent = "Please fill in both a name and a link.";
    return;
  }

  addBookmark(name, url, categoryId);

  // Clear name + link but keep the chosen category, so adding several
  // bookmarks to the same category stays quick.
  nameInput.value = "";
  urlInput.value = "";
  nameInput.focus();
});

// Filter as the user types. Empty input shows everything again.
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
});

// Collapse every category at once, or expand them all if they're already
// collapsed. (Mirrors the label set by updateToggleAllLabel.)
toggleAllBtn.addEventListener("click", () => {
  const categories = loadCategories();
  const collapsed = loadCollapsed();
  const allCollapsed = categories.every((c) => collapsed.has(c.id));

  if (allCollapsed) {
    saveCollapsed(new Set());
  } else {
    saveCollapsed(new Set(categories.map((c) => c.id)));
  }
  render();
});

// Show everything as soon as the page loads.
render();
