// Bookmark app — stores bookmarks in the browser's localStorage (no server).

const STORAGE_KEY = "bookmarks";

// Grab the elements we'll work with.
const form = document.getElementById("bookmark-form");
const nameInput = document.getElementById("name-input");
const urlInput = document.getElementById("url-input");
const errorEl = document.getElementById("form-error");
const listEl = document.getElementById("bookmark-list");
const emptyState = document.getElementById("empty-state");

// --- Data helpers ---------------------------------------------------------

// Read the saved bookmarks (returns an array).
function loadBookmarks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Write the bookmarks array back to localStorage.
function saveBookmarks(bookmarks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
}

// --- Rendering ------------------------------------------------------------

// Rebuild the on-screen list from the saved data.
function render() {
  const bookmarks = loadBookmarks();
  listEl.innerHTML = "";

  // Show the friendly empty message only when there's nothing saved.
  emptyState.style.display = bookmarks.length === 0 ? "block" : "none";

  bookmarks.forEach((bookmark) => {
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
    listEl.append(li);
  });
}

// --- Actions --------------------------------------------------------------

// Add a new bookmark from the form values.
function addBookmark(name, url) {
  const bookmarks = loadBookmarks();
  bookmarks.push({
    id: Date.now().toString(), // simple unique id
    name: name,
    url: url,
  });
  saveBookmarks(bookmarks);
  render();
}

// --- Form handling --------------------------------------------------------

form.addEventListener("submit", (event) => {
  event.preventDefault(); // stop the page from reloading
  errorEl.textContent = "";

  const name = nameInput.value.trim();
  const url = urlInput.value.trim();

  if (!name || !url) {
    errorEl.textContent = "Please fill in both a name and a link.";
    return;
  }

  addBookmark(name, url);

  // Clear the form and put the cursor back in the first field.
  form.reset();
  nameInput.focus();
});

// Show the saved bookmarks as soon as the page loads.
render();
