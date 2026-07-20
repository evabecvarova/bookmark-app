// Bookmark app — stores folders, subfolders AND bookmarks in localStorage
// (no server).
//
// Hierarchy (exactly one level of subfolders):
//     Folder  →  Subfolder  →  Bookmark
//
// Layout is two panes: a sidebar listing every folder (and, when a folder is
// open, its subfolders), and a content pane that shows the *selected*
// subfolder's bookmarks (or search matches across everything).
//
// Storage stays backward-compatible: bookmarks are a flat list keyed by
// `categoryId` (folder) and an optional `subfolderId`. A bookmark with no
// `subfolderId` is "loose" and shows under an auto-generated "Unsorted"
// subfolder — so nothing saved before subfolders existed is ever lost.

const STORAGE_KEY = "bookmarks";
const CATEGORIES_KEY = "categories";
const SUBFOLDERS_KEY = "subfolders";

// Synthetic id for the auto-generated "Unsorted" subfolder (loose bookmarks
// inside a folder that aren't in a real subfolder).
const UNSORTED_ID = "__unsorted__";

// --- Elements -------------------------------------------------------------

const categoryForm = document.getElementById("category-form");
const categoryInput = document.getElementById("category-input");
const categoryError = document.getElementById("category-error");

const subfolderForm = document.getElementById("subfolder-form");
const subfolderInput = document.getElementById("subfolder-input");
const subfolderError = document.getElementById("subfolder-error");

const form = document.getElementById("bookmark-form");
const nameInput = document.getElementById("name-input");
const urlInput = document.getElementById("url-input");
const bkFolder = document.getElementById("bk-folder");
const bkSub = document.getElementById("bk-sub");
const errorEl = document.getElementById("form-error");

const folderList = document.getElementById("folder-list");
const bookmarkList = document.getElementById("bookmark-list");
const breadcrumb = document.getElementById("breadcrumb");
const contentCount = document.getElementById("content-count");

const addHint = document.getElementById("add-hint");
const homeLink = document.getElementById("home-link");

const emptyState = document.getElementById("empty-state");
const noResults = document.getElementById("no-results");
const pickSubfolder = document.getElementById("pick-subfolder");

const searchInput = document.getElementById("search-input");
const backBtn = document.getElementById("back-btn");
const layout = document.getElementById("layout");

const subfolderActions = document.getElementById("subfolder-actions");
const renameSubfolderBtn = document.getElementById("rename-subfolder");
const deleteSubfolderBtn = document.getElementById("delete-subfolder");

// Which bookmark is currently being edited (null = none).
let editingId = null;

// The current search text (lower-cased). Empty string means "not searching".
let searchQuery = "";

// Which folder is open (a category id, or null for the GLOBAL top level).
let selectedCategoryId = null;
// Which subfolder is open (a subfolder id, UNSORTED_ID, or null when only a
// folder is selected).
let selectedSubfolderId = null;

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

function loadSubfolders() {
  const raw = localStorage.getItem(SUBFOLDERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveSubfolders(subfolders) {
  localStorage.setItem(SUBFOLDERS_KEY, JSON.stringify(subfolders));
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

// The name of a folder for a given category id. A null/unknown folder means
// the bookmark lives at the top level → "GLOBAL".
function categoryName(id) {
  if (!id) return "GLOBAL";
  const category = loadCategories().find((c) => c.id === id);
  return category ? category.name : "GLOBAL";
}

// Bookmarks that belong to no folder: added directly at GLOBAL, or orphaned
// because their folder was deleted. Both live in GLOBAL / Unsorted.
function globalUnsortedBookmarks() {
  const knownFolderIds = new Set(loadCategories().map((c) => c.id));
  return loadBookmarks().filter(
    (b) => !b.categoryId || !knownFolderIds.has(b.categoryId)
  );
}

// The name of a subfolder for a given id ("Unsorted" for loose bookmarks).
function subfolderName(id) {
  if (!id || id === UNSORTED_ID) return "Unsorted";
  const sub = loadSubfolders().find((s) => s.id === id);
  return sub ? sub.name : "Unsorted";
}

// Real subfolders that belong to a folder.
function subfoldersOf(categoryId) {
  return loadSubfolders().filter((s) => s.categoryId === categoryId);
}

// A bookmark is "loose" if it has no subfolderId, or points at a subfolder
// that no longer exists — either way it belongs in "Unsorted".
function isLoose(bookmark, knownSubIds) {
  return !bookmark.subfolderId || !knownSubIds.has(bookmark.subfolderId);
}

// The bookmarks inside one subfolder of a folder. Passing UNSORTED_ID returns
// the loose bookmarks of that folder.
function bookmarksInSubfolder(categoryId, subfolderId) {
  const knownSubIds = new Set(subfoldersOf(categoryId).map((s) => s.id));
  return loadBookmarks().filter((b) => {
    if (b.categoryId !== categoryId) return false;
    if (subfolderId === UNSORTED_ID) return isLoose(b, knownSubIds);
    return b.subfolderId === subfolderId;
  });
}

// Does a folder have any loose bookmarks (→ needs an "Unsorted" subfolder)?
function hasLooseBookmarks(categoryId) {
  const knownSubIds = new Set(subfoldersOf(categoryId).map((s) => s.id));
  return loadBookmarks().some(
    (b) => b.categoryId === categoryId && isLoose(b, knownSubIds)
  );
}

// --- Search ---------------------------------------------------------------

// Global search: a bookmark matches if the query appears in its name, its URL,
// its folder name, or its subfolder name.
function matchesSearch(bookmark) {
  if (!searchQuery) return true;
  const knownSubIds = new Set(subfoldersOf(bookmark.categoryId).map((s) => s.id));
  const sub = isLoose(bookmark, knownSubIds)
    ? "Unsorted"
    : subfolderName(bookmark.subfolderId);
  return [
    bookmark.name,
    bookmark.url,
    categoryName(bookmark.categoryId),
    sub,
  ].some((text) => text.toLowerCase().includes(searchQuery));
}

// Put `text` into `container`, wrapping any parts that match the search query
// in <mark> so they stand out. Built from text nodes (never innerHTML) so a
// name or URL still can't inject HTML. With no query, it's just the plain text.
function appendHighlighted(container, text, query) {
  if (!query) {
    container.textContent = text;
    return;
  }

  const haystack = text.toLowerCase();
  let from = 0;
  let hit = haystack.indexOf(query, from);

  while (hit !== -1) {
    if (hit > from) {
      container.append(document.createTextNode(text.slice(from, hit)));
    }
    const mark = document.createElement("mark");
    mark.className = "hl";
    mark.textContent = text.slice(hit, hit + query.length);
    container.append(mark);
    from = hit + query.length;
    hit = haystack.indexOf(query, from);
  }

  if (from < text.length) {
    container.append(document.createTextNode(text.slice(from)));
  }
}

// --- Rendering: sidebar folder list ---------------------------------------

// Build one clickable folder row for the sidebar, labelled with the icon
// summary "📁 X • 📄 Y" (subfolders • total bookmarks).
function buildFolderButton(id, name, subCount, docCount) {
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
  countEl.className = "group__count folder__summary";
  countEl.textContent = `📁 ${subCount} • 📄 ${docCount}`;

  button.append(nameEl, countEl);
  button.addEventListener("click", () => selectCategory(id));
  return button;
}

// Build one clickable subfolder row (used in the sidebar under an open folder,
// and in the content pane when a folder has no subfolder selected yet).
function buildSubfolderButton(categoryId, id, name) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "subfolder";
  if (
    categoryId === selectedCategoryId &&
    id === selectedSubfolderId &&
    !searchQuery
  ) {
    button.classList.add("subfolder--active");
  }

  const nameEl = document.createElement("span");
  nameEl.className = "folder__name";
  nameEl.textContent = name;

  const countEl = document.createElement("span");
  countEl.className = "group__count";
  countEl.textContent = bookmarksInSubfolder(categoryId, id).length;

  button.append(nameEl, countEl);
  button.addEventListener("click", () => selectSubfolder(categoryId, id));
  return button;
}

// The list of subfolder rows for a folder: every real subfolder, plus an
// "Unsorted" row when the folder has loose bookmarks.
function subfolderRows(categoryId) {
  const rows = subfoldersOf(categoryId).map((s) =>
    buildSubfolderButton(categoryId, s.id, s.name)
  );
  if (hasLooseBookmarks(categoryId)) {
    rows.push(buildSubfolderButton(categoryId, UNSORTED_ID, "Unsorted"));
  }
  return rows;
}

// How many subfolder rows a folder shows (real subfolders + Unsorted if any).
function subfolderCount(categoryId) {
  return subfoldersOf(categoryId).length + (hasLooseBookmarks(categoryId) ? 1 : 0);
}

// Draw the sidebar: one entry per folder (with its icon summary), and — under
// the open folder — its subfolders. GLOBAL is never a row here; it's simply the
// state when no folder is selected.
function renderFolders(categories) {
  const bookmarks = loadBookmarks();
  folderList.innerHTML = "";

  categories.forEach((category) => {
    const docCount = bookmarks.filter((b) => b.categoryId === category.id).length;
    folderList.append(
      buildFolderButton(
        category.id,
        category.name,
        subfolderCount(category.id),
        docCount
      )
    );

    // Expand the open folder's subfolders right below it.
    if (category.id === selectedCategoryId && !searchQuery) {
      const group = document.createElement("div");
      group.className = "subfolders";
      subfolderRows(category.id).forEach((row) => group.append(row));
      folderList.append(group);
    }
  });
}

// --- Rendering: bookmark rows ---------------------------------------------

// Build one bookmark row (a <li>). If this bookmark is being edited, the row
// shows the edit form instead of the usual name/link display.
function buildBookmarkItem(bookmark) {
  const li = document.createElement("li");
  li.className = "bookmark";
  // Search results get a flatter, neutral look (light grey borders, grey tags).
  if (searchQuery) li.classList.add("bookmark--search");

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
  appendHighlighted(name, bookmark.name, searchQuery);

  const link = document.createElement("a");
  link.className = "bookmark__link";
  link.href = bookmark.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = bookmark.url;
  appendHighlighted(link, hostnameOf(bookmark.url), searchQuery);

  info.append(name, link);

  // While searching, show the full "Folder / Subfolder" path of each match.
  if (searchQuery) {
    const knownSubIds = new Set(
      subfoldersOf(bookmark.categoryId).map((s) => s.id)
    );
    const sub = isLoose(bookmark, knownSubIds)
      ? "Unsorted"
      : subfolderName(bookmark.subfolderId);
    const tag = document.createElement("span");
    tag.className = "bookmark__folder";
    tag.textContent = `${categoryName(bookmark.categoryId)} / ${sub}`;
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
// Lets you change the name, link, folder, and subfolder. Enter saves,
// Escape cancels.
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

  // Subfolder picker, rebuilt whenever the folder changes. An empty value
  // means "Unsorted" (a loose bookmark).
  const subfolderField = document.createElement("select");
  subfolderField.className = "input";
  subfolderField.setAttribute("aria-label", "Edit subfolder");

  function fillSubfolders(categoryId, selected) {
    subfolderField.innerHTML = "";
    const unsorted = document.createElement("option");
    unsorted.value = "";
    unsorted.textContent = "Unsorted";
    subfolderField.append(unsorted);
    subfoldersOf(categoryId).forEach((s) => {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = s.name;
      subfolderField.append(option);
    });
    subfolderField.value = selected || "";
  }
  fillSubfolders(bookmark.categoryId, bookmark.subfolderId);
  categoryField.addEventListener("change", () => {
    fillSubfolders(categoryField.value, "");
  });

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
  editForm.append(nameField, urlField, categoryField, subfolderField, actions, error);

  editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const newName = nameField.value.trim();
    const newUrl = urlField.value.trim();

    if (!newName || !newUrl) {
      error.textContent = "Please fill in both a name and a link.";
      return;
    }

    updateBookmark(
      bookmark.id,
      newName,
      newUrl,
      categoryField.value,
      subfolderField.value || null
    );
  });

  editForm.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelEdit();
  });

  queueMicrotask(() => nameField.focus());

  return editForm;
}

// --- Rendering: content pane ----------------------------------------------

// Build one breadcrumb segment. When `onClick` is given the segment is a
// clickable link (used to step "up" a level); otherwise it's plain text.
function buildCrumb(text, className, onClick) {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  if (onClick) {
    el.classList.add("crumb--link");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    });
  }
  return el;
}

function appendSeparator() {
  const sep = document.createElement("span");
  sep.className = "crumb__sep";
  sep.textContent = " / ";
  breadcrumb.append(sep);
}

// Breadcrumb formats (always visible, neutral styling):
//   Search results
//   GLOBAL / Unsorted
//   FolderName / Unsorted
//   FolderName / SubfolderName
function renderBreadcrumb() {
  breadcrumb.innerHTML = "";

  if (searchQuery) {
    breadcrumb.append(buildCrumb("Search results", "crumb"));
    return;
  }

  // GLOBAL context (no folder selected).
  if (selectedCategoryId === null) {
    breadcrumb.append(buildCrumb("GLOBAL", "crumb"));
    appendSeparator();
    breadcrumb.append(buildCrumb("Unsorted", "crumb crumb--sub"));
    return;
  }

  const inRealSubfolder =
    selectedSubfolderId !== null && selectedSubfolderId !== UNSORTED_ID;

  // Folder name — clickable to step up to the folder's Unsorted when we're
  // currently deeper (inside a real subfolder).
  breadcrumb.append(
    buildCrumb(
      categoryName(selectedCategoryId),
      "crumb",
      inRealSubfolder ? () => selectCategory(selectedCategoryId) : null
    )
  );
  appendSeparator();
  breadcrumb.append(
    buildCrumb(
      inRealSubfolder ? subfolderName(selectedSubfolderId) : "Unsorted",
      "crumb crumb--sub"
    )
  );
}

// Fill the add-bookmark form's Subfolder picker for a given folder. "" is the
// folder's Unsorted (and the only option when the folder is Global).
function fillBookmarkSubfolders(folderId, selected) {
  bkSub.innerHTML = "";
  const unsorted = document.createElement("option");
  unsorted.value = "";
  unsorted.textContent = "Unsorted";
  bkSub.append(unsorted);
  if (folderId) {
    subfoldersOf(folderId).forEach((s) => {
      const option = document.createElement("option");
      option.value = s.id;
      option.textContent = s.name;
      bkSub.append(option);
    });
  }
  bkSub.value = selected || "";
  // Global has no subfolders, so there's nothing to choose.
  bkSub.disabled = !folderId;
}

// Populate the add-bookmark form's Folder + Subfolder pickers, defaulting to
// the current context so "just add it here" needs no extra clicks.
function populateAddForm() {
  bkFolder.innerHTML = "";
  const globalOpt = document.createElement("option");
  globalOpt.value = "";
  globalOpt.textContent = "Global (no folder)";
  bkFolder.append(globalOpt);
  loadCategories().forEach((c) => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name;
    bkFolder.append(option);
  });

  const defaultFolder = selectedCategoryId || "";
  bkFolder.value = defaultFolder;

  const inRealSubfolder =
    selectedSubfolderId !== null && selectedSubfolderId !== UNSORTED_ID;
  fillBookmarkSubfolders(defaultFolder, inRealSubfolder ? selectedSubfolderId : "");

  updateAddHint();
}

// Keep the grey helper text in step with the form's chosen destination.
function updateAddHint() {
  const folder = bkFolder.value;
  const sub = bkSub.value;
  let text;
  if (!folder) {
    text = "Bookmark will be added to Global Unsorted.";
  } else if (!sub) {
    text = `Bookmark will be added to ${categoryName(folder)} / Unsorted.`;
  } else {
    text = `Bookmark will be added to ${categoryName(folder)} / ${subfolderName(sub)}.`;
  }
  addHint.textContent = text;
  addHint.hidden = false;
}

// Show the count pill with a value.
function showCount(n) {
  contentCount.textContent = n;
  contentCount.hidden = false;
}

// Render a list of bookmarks, or a calm hint when there are none.
function renderBookmarkItems(items, emptyText) {
  if (items.length === 0) {
    const hint = document.createElement("li");
    hint.className = "group__empty";
    hint.textContent = emptyText;
    bookmarkList.append(hint);
  } else {
    items.forEach((b) => bookmarkList.append(buildBookmarkItem(b)));
  }
}

// Fill the content pane. Contexts (right-panel order is always:
// breadcrumb → helper text → new subfolder → add bookmark → subfolders →
// bookmarks):
//   Search  -> global matches; no forms.
//   GLOBAL  -> Global Unsorted bookmarks + add bookmark (no subfolders).
//   Folder  -> folder's Unsorted: add subfolder + add bookmark + subfolder
//              list + the folder's loose bookmarks.
//   Subfolder -> that subfolder's bookmarks + add bookmark.
function renderContent(categories) {
  const searching = searchQuery !== "";

  bookmarkList.innerHTML = "";
  noResults.hidden = true;
  emptyState.hidden = true;
  pickSubfolder.hidden = true;
  subfolderForm.hidden = true;
  form.hidden = true;
  contentCount.hidden = true;
  addHint.hidden = true;

  const inRealSubfolder =
    !searching &&
    selectedCategoryId !== null &&
    selectedSubfolderId !== null &&
    selectedSubfolderId !== UNSORTED_ID;
  // Rename/Delete only make sense for a real (non-Unsorted) open subfolder.
  subfolderActions.hidden = !inRealSubfolder;

  renderBreadcrumb();

  // CASE D — Search results. Global, read-only (no adding from here).
  if (searching) {
    addHint.textContent =
      "No new bookmarks can be added here. Select a folder or GLOBAL.";
    addHint.hidden = false;
    const matches = loadBookmarks().filter(matchesSearch);
    showCount(matches.length);
    matches.forEach((b) => bookmarkList.append(buildBookmarkItem(b)));
    noResults.hidden = matches.length > 0;
    return;
  }

  // CASE C — GLOBAL (no folder selected). Add goes to Global Unsorted; GLOBAL
  // has no subfolders.
  if (selectedCategoryId === null) {
    form.hidden = false;
    populateAddForm();
    const items = globalUnsortedBookmarks();
    showCount(items.length);
    renderBookmarkItems(
      items,
      "No global bookmarks yet — add one above, or open a folder."
    );
    return;
  }

  // CASE B — A folder is open (this is its Unsorted view).
  if (!inRealSubfolder) {
    form.hidden = false;
    subfolderForm.hidden = false;
    populateAddForm();

    // Section 5 — list of (real) subfolders to open.
    const subs = subfoldersOf(selectedCategoryId);
    if (subs.length > 0) {
      const group = document.createElement("li");
      group.className = "subfolder-picker";
      subs.forEach((s) =>
        group.append(buildSubfolderButton(selectedCategoryId, s.id, s.name))
      );
      bookmarkList.append(group);
    }

    // Section 6 — the folder's Unsorted (loose) bookmarks.
    const items = bookmarksInSubfolder(selectedCategoryId, UNSORTED_ID);
    showCount(items.length);
    if (items.length === 0 && subs.length === 0) {
      renderBookmarkItems([], "No subfolders or bookmarks yet — add one above.");
    } else {
      items.forEach((b) => bookmarkList.append(buildBookmarkItem(b)));
    }
    return;
  }

  // CASE A — A real subfolder is open.
  form.hidden = false;
  populateAddForm();
  const items = bookmarksInSubfolder(selectedCategoryId, selectedSubfolderId);
  showCount(items.length);
  renderBookmarkItems(items, "No bookmarks here yet — add one above.");
}

// Rebuild everything on screen from the saved data.
function render() {
  const categories = loadCategories();
  renderFolders(categories);
  renderContent(categories);
}

// --- Actions --------------------------------------------------------------

// Open a folder: clears any search and shows its subfolders. On mobile, swaps
// the sidebar out for the content view.
function selectCategory(id) {
  selectedCategoryId = id;
  selectedSubfolderId = null;
  searchQuery = "";
  searchInput.value = "";
  layout.classList.add("layout--show-content");
  render();
}

// Return to the GLOBAL top level (no folder selected). This is the app's
// default state and the home for Global Unsorted bookmarks.
function goGlobal() {
  selectedCategoryId = null;
  selectedSubfolderId = null;
  searchQuery = "";
  searchInput.value = "";
  layout.classList.add("layout--show-content");
  render();
}

// Open a subfolder: its bookmarks (and the add-bookmark form) appear.
function selectSubfolder(categoryId, subfolderId) {
  selectedCategoryId = categoryId;
  selectedSubfolderId = subfolderId;
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
  // Open the folder we just made so the next step is adding a subfolder.
  selectCategory(newCategory.id);
}

function addSubfolder(categoryId, name) {
  const subfolders = loadSubfolders();
  const newSub = { id: Date.now().toString(), name: name, categoryId: categoryId };
  subfolders.push(newSub);
  saveSubfolders(subfolders);
  // Open the subfolder we just made so the next bookmark lands in it.
  selectSubfolder(categoryId, newSub.id);
}

function renameSubfolder(id, name) {
  const subfolders = loadSubfolders().map((s) =>
    s.id === id ? { ...s, name: name } : s
  );
  saveSubfolders(subfolders);
  render();
}

// Delete a subfolder but KEEP its bookmarks — they become loose and show up
// under "Unsorted", so nothing is ever lost.
function deleteSubfolder(id) {
  const target = loadSubfolders().find((s) => s.id === id);
  saveSubfolders(loadSubfolders().filter((s) => s.id !== id));
  const bookmarks = loadBookmarks().map((b) =>
    b.subfolderId === id ? { ...b, subfolderId: null } : b
  );
  saveBookmarks(bookmarks);
  // Fall back to just the folder view.
  if (target) selectedCategoryId = target.categoryId;
  selectedSubfolderId = null;
  render();
}

function addBookmark(name, url, categoryId, subfolderId) {
  const bookmarks = loadBookmarks();
  bookmarks.push({
    id: Date.now().toString(),
    name: name,
    url: url,
    categoryId: categoryId,
    subfolderId: subfolderId,
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

// Save edited values back to the matching bookmark, keeping its id. Changing
// the folder or subfolder moves the bookmark; a null subfolderId makes it a
// loose ("Unsorted") bookmark.
function updateBookmark(id, name, url, categoryId, subfolderId) {
  const bookmarks = loadBookmarks().map((b) =>
    b.id === id
      ? { ...b, name: name, url: url, categoryId: categoryId, subfolderId: subfolderId }
      : b
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

subfolderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  subfolderError.textContent = "";

  if (!selectedCategoryId) {
    subfolderError.textContent = "Open a folder first.";
    return;
  }

  const name = subfolderInput.value.trim();
  if (!name) {
    subfolderError.textContent = "Please enter a subfolder name.";
    return;
  }
  if (name.toLowerCase() === "unsorted") {
    subfolderError.textContent = "“Unsorted” is reserved for loose links.";
    return;
  }

  // Reject duplicates within the same folder.
  const exists = subfoldersOf(selectedCategoryId).some(
    (s) => s.name.toLowerCase() === name.toLowerCase()
  );
  if (exists) {
    subfolderError.textContent = `"${name}" already exists here.`;
    return;
  }

  addSubfolder(selectedCategoryId, name);
  subfolderForm.reset();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  errorEl.textContent = "";

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!name || !url) {
    errorEl.textContent = "Please fill in both a name and a link.";
    return;
  }

  // Destination comes from the form's optional pickers (which default to the
  // current context). Blank folder → Global; blank subfolder → that folder's
  // Unsorted. So leaving them alone keeps the bookmark where you are.
  const categoryId = bkFolder.value || null;
  const subfolderId = categoryId ? bkSub.value || null : null;

  // Jump to where the bookmark will land so you can see it (and adding several
  // to the same place in a row stays quick). addBookmark() re-renders.
  selectedCategoryId = categoryId;
  selectedSubfolderId = subfolderId;
  addBookmark(name, url, categoryId, subfolderId);

  // Clear the text fields; keep the chosen destination.
  nameInput.value = "";
  urlInput.value = "";
  nameInput.focus();
});

// Changing the folder picker rebuilds the subfolder options and refreshes the
// helper text; changing the subfolder just refreshes the helper text.
bkFolder.addEventListener("change", () => {
  fillBookmarkSubfolders(bkFolder.value, "");
  updateAddHint();
});
bkSub.addEventListener("change", updateAddHint);

// Filter as the user types. A non-empty query switches the content pane into
// global search mode; clearing it returns to the open folder/subfolder.
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  if (searchQuery) layout.classList.add("layout--show-content");
  render();
});

renameSubfolderBtn.addEventListener("click", () => {
  if (selectedSubfolderId === null || selectedSubfolderId === UNSORTED_ID) return;
  const current = subfolderName(selectedSubfolderId);
  const next = prompt("Rename subfolder:", current);
  if (next === null) return; // cancelled
  const name = next.trim();
  if (!name) return;
  if (name.toLowerCase() === "unsorted") {
    alert("“Unsorted” is reserved for loose links.");
    return;
  }
  // Reject a duplicate name within the same folder (ignoring itself).
  const clash = subfoldersOf(selectedCategoryId).some(
    (s) => s.id !== selectedSubfolderId && s.name.toLowerCase() === name.toLowerCase()
  );
  if (clash) {
    alert(`"${name}" already exists here.`);
    return;
  }
  renameSubfolder(selectedSubfolderId, name);
});

deleteSubfolderBtn.addEventListener("click", () => {
  if (selectedSubfolderId === null || selectedSubfolderId === UNSORTED_ID) return;
  const name = subfolderName(selectedSubfolderId);
  const count = bookmarksInSubfolder(selectedCategoryId, selectedSubfolderId).length;
  const note = count
    ? `\n\nIts ${count} bookmark(s) will move to "Unsorted" — nothing is deleted.`
    : "";
  if (confirm(`Delete subfolder "${name}"?${note}`)) {
    deleteSubfolder(selectedSubfolderId);
  }
});

// Clicking the app title returns to GLOBAL (its own "home"), which is where
// Global Unsorted lives.
homeLink.addEventListener("click", goGlobal);
homeLink.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    goGlobal();
  }
});

// Mobile only: go back from a folder's contents to the folder list.
backBtn.addEventListener("click", () => {
  layout.classList.remove("layout--show-content");
});

// The app opens in GLOBAL (nothing selected) — the natural top-level context.
render();
