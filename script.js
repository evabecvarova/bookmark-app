// Bookmark app — stores bookmarks AND categories in localStorage (no server).

const STORAGE_KEY = "bookmarks";
const CATEGORIES_KEY = "categories";

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

// Which bookmark is currently being edited (null = none). When this matches a
// bookmark's id, that row renders as an inline edit form instead of a link.
let editingId = null;

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
  link.textContent = bookmark.url;

  info.append(name, link);

  const editBtn = document.createElement("button");
  editBtn.className = "btn btn--ghost";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => startEdit(bookmark.id));

  li.append(info, editBtn);
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

// Build one category group: a heading plus its bookmarks (or a faint hint
// when the category is still empty).
function buildGroup(title, bookmarks) {
  const group = document.createElement("section");
  group.className = "group";

  const heading = document.createElement("h2");
  heading.className = "group__heading";
  heading.textContent = title;

  const count = document.createElement("span");
  count.className = "group__count";
  count.textContent = bookmarks.length;
  heading.append(count);

  group.append(heading);

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

  return group;
}

// Rebuild everything on screen from the saved data.
function render() {
  const categories = loadCategories();
  const bookmarks = loadBookmarks();

  populateCategorySelect(categories);
  groupsEl.innerHTML = "";

  // Nothing to group under until at least one category exists.
  if (categories.length === 0) {
    emptyState.style.display = "block";
    return;
  }
  emptyState.style.display = "none";

  // One group per category, in the order they were created.
  categories.forEach((category) => {
    const items = bookmarks.filter((b) => b.categoryId === category.id);
    groupsEl.append(buildGroup(category.name, items));
  });

  // Safety net: bookmarks whose category no longer exists (or never had one)
  // are shown under "Uncategorized" so they're never lost.
  const knownIds = new Set(categories.map((c) => c.id));
  const orphans = bookmarks.filter((b) => !knownIds.has(b.categoryId));
  if (orphans.length > 0) {
    groupsEl.append(buildGroup("Uncategorized", orphans));
  }
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

// Show everything as soon as the page loads.
render();
