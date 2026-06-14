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

// Build one bookmark row (a <li>).
function buildBookmarkItem(bookmark) {
  const li = document.createElement("li");
  li.className = "bookmark";

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
  li.append(info);
  return li;
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
