// Bookmark app — stores bookmarks AND folders in localStorage (no server).
//
// Layout is two panes: a sidebar listing every folder, and a content pane that
// shows the *selected* folder's bookmarks (or search matches across folders).

const STORAGE_KEY = "bookmarks";
const CATEGORIES_KEY = "categories";

// Synthetic id for the catch-all "Uncategorized" folder (orphaned bookmarks).
const UNCATEGORIZED_ID = "__uncategorized__";

// --- Elements -------------------------------------------------------------

const categoryForm = document.getElementById("category-form");
const categoryInput = document.getElementById("category-input");
const categoryError = document.getElementById("category-error");

const form = document.getElementById("bookmark-form");
const nameInput = document.getElementById("name-input");
const urlInput = document.getElementById("url-input");
const errorEl = document.getElementById("form-error");

const folderList = document.getElementById("folder-list");
const bookmarkList = document.getElementById("bookmark-list");
const contentTitle = document.getElementById("content-title");
const contentCount = document.getElementById("content-count");

const emptyState = document.getElementById("empty-state");
const noResults = document.getElementById("no-results");

const searchInput = document.getElementById("search-input");
const backBtn = document.getElementById("back-btn");
const layout = document.getElementById("layout");

// Which bookmark is currently being edited (null = none).
let editingId = null;

// The current search text (lower-cased). Empty string means "not searching".
let searchQuery = "";

// Which folder is open in the content pane (a category id, UNCATEGORIZED_ID,
// or null when nothing is selected yet).
let selectedCategoryId = null;

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

// --- Small utilities ------------------------------------------------------

// Pull the hostname out of a URL for a compact, readable label (e.g.
// "claude.ai" instead of "https://claude.ai/chat/..."). Falls back to the raw
// string if the URL can't be parsed.
function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A tiny favicon for a bookmark, from Google's favicon service. If it fails to
// load we just hide the broken-image icon.
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

// The name of a folder for a given category id (or "Uncategorized").
function categoryName(id) {
  if (id === UNCATEGORIZED_ID) return "Uncategorized";
  const category = loadCategories().find((c) => c.id === id);
  return category ? category.name : "Uncategorized";
}

// --- Rendering: sidebar folder list ---------------------------------------

// Build one clickable folder row for the sidebar.
function buildFolderButton(id, name, count) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "folder";
  if (id === selectedCategoryId && !searchQuery) {
    button.classList.add("folder--active");
  }

  const nameEl = document.createElement("span");
  nameEl.className = "folder__name";
  nameEl.textContent = name;

  const countEl = document.createElement("span");
  countEl.className = "group__count";
  countEl.textContent = count;

  button.append(nameEl, countEl);
  button.addEventListener("click", () => selectCategory(id));
  return button;
}

// Draw the sidebar: one entry per folder, plus a catch-all "Uncategorized"
// entry when orphaned bookmarks exist.
function renderFolders(categories) {
  const bookmarks = loadBookmarks();
  folderList.innerHTML = "";

  categories.forEach((category) => {
    const count = bookmarks.filter((b) => b.categoryId === category.id).length;
    folderList.append(buildFolderButton(category.id, category.name, count));
  });

  const knownIds = new Set(categories.map((c) => c.id));
  const orphanCount = bookmarks.filter((b) => !knownIds.has(b.categoryId)).length;
  if (orphanCount > 0) {
    folderList.append(
      buildFolderButton(UNCATEGORIZED_ID, "Uncategorized", orphanCount)
    );
  }
}

// --- Rendering: bookmark rows ---------------------------------------------

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

  const link = document.createElement("a");
  link.className = "bookmark__link";
  link.href = bookmark.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = bookmark.url;
  link.textContent = hostnameOf(bookmark.url);

  info.append(name, link);

  // While searching, show which folder each match lives in.
  if (searchQuery) {
    const tag = document.createElement("span");
    tag.className = "bookmark__folder";
    tag.textContent = categoryName(bookmark.categoryId);
    info.append(tag);
  }

  // Action buttons: Edit (inline form) and Delete.
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
    if (confirm(`Delete "${bookmark.name}"?`)) {
      deleteBookmark(bookmark.id);
    }
  });

  actions.append(editBtn, deleteBtn);

  li.append(favicon, info, actions);
  return li;
}

// Build the inline edit form shown in place of a bookmark while editing.
// Lets you change the name, link, and folder. Enter saves, Escape cancels.
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

  // Folder picker, pre-selected to the bookmark's current folder.
  const categoryField = document.createElement("select");
  categoryField.className = "input";
  categoryField.setAttribute("aria-label", "Edit folder");
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

  editForm.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelEdit();
  });

  queueMicrotask(() => nameField.focus());

  return editForm;
}

// --- Rendering: content pane ----------------------------------------------

// Fill the content pane. Three modes:
//   1. No folders yet  -> show the empty state, hide the add-bookmark form.
//   2. Searching       -> show matches from every folder.
//   3. A folder is open -> show that folder's bookmarks + the add form.
function renderContent(categories) {
  const bookmarks = loadBookmarks();
  const searching = searchQuery !== "";

  bookmarkList.innerHTML = "";
  noResults.hidden = true;
  emptyState.hidden = true;

  // 1. Nothing to show until at least one folder exists.
  if (categories.length === 0) {
    form.hidden = true;
    contentCount.hidden = true;
    contentTitle.textContent = "Bookmarks";
    emptyState.hidden = false;
    return;
  }

  // 2. Search mode: matches across every folder, add form hidden.
  if (searching) {
    form.hidden = true;
    contentTitle.textContent = "Search results";
    const matches = bookmarks.filter(matchesSearch);
    contentCount.textContent = matches.length;
    contentCount.hidden = false;
    matches.forEach((b) => bookmarkList.append(buildBookmarkItem(b)));
    noResults.hidden = matches.length > 0;
    return;
  }

  // 3. Folder mode: make sure a valid folder is selected, then show it.
  const validIds = categories.map((c) => c.id);
  if (!validIds.includes(selectedCategoryId)) {
    selectedCategoryId = validIds[0];
  }

  form.hidden = false;
  contentTitle.textContent = categoryName(selectedCategoryId);

  const items = bookmarks.filter((b) => b.categoryId === selectedCategoryId);
  contentCount.textContent = items.length;
  contentCount.hidden = false;

  if (items.length === 0) {
    const hint = document.createElement("li");
    hint.className = "group__empty";
    hint.textContent = "No bookmarks here yet — add one above.";
    bookmarkList.append(hint);
  } else {
    items.forEach((b) => bookmarkList.append(buildBookmarkItem(b)));
  }
}

// Rebuild everything on screen from the saved data.
function render() {
  const categories = loadCategories();
  renderFolders(categories);
  renderContent(categories);
}

// --- Actions --------------------------------------------------------------

// Open a folder in the content pane. Clears any active search and, on mobile,
// swaps the sidebar out for the content view.
function selectCategory(id) {
  selectedCategoryId = id;
  searchQuery = "";
  searchInput.value = "";
  layout.classList.add("layout--show-content");
  render();
}

function addCategory(name) {
  const categories = loadCategories();
  const newCategory = { id: Date.now().toString(), name: name };
  categories.push(newCategory);
  saveCategories(categories);
  // Open the folder we just made so the next bookmark lands in it.
  selectCategory(newCategory.id);
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

function deleteBookmark(id) {
  const bookmarks = loadBookmarks().filter((b) => b.id !== id);
  saveBookmarks(bookmarks);
  render();
}

function startEdit(id) {
  editingId = id;
  render();
}

function cancelEdit() {
  editingId = null;
  render();
}

// Save edited values back to the matching bookmark, keeping its id. A new
// categoryId moves the bookmark to another folder.
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
    categoryError.textContent = "Please enter a folder name.";
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

  if (!selectedCategoryId || selectedCategoryId === UNCATEGORIZED_ID) {
    errorEl.textContent = "Open a folder first, then add to it.";
    return;
  }
  if (!name || !url) {
    errorEl.textContent = "Please fill in both a name and a link.";
    return;
  }

  addBookmark(name, url, selectedCategoryId);

  // Clear the fields but keep the folder open, so adding several bookmarks in
  // a row stays quick.
  nameInput.value = "";
  urlInput.value = "";
  nameInput.focus();
});

// Filter as the user types. A non-empty query switches the content pane into
// search mode; clearing it returns to the open folder.
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  if (searchQuery) layout.classList.add("layout--show-content");
  render();
});

// Mobile only: go back from a folder's contents to the folder list.
backBtn.addEventListener("click", () => {
  layout.classList.remove("layout--show-content");
});

// Show everything as soon as the page loads.
render();
