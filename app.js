const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const config = window.CATLOG_CONFIG || {};
const state = {
  accessToken: null,
  tokenClient: null,
  entries: [],
  previewUrl: null,
  drive: {
    rootFolderId: null,
    photosFolderId: null,
    entriesFileId: null
  }
};

const elements = {
  authStatus: document.getElementById("auth-status"),
  syncStatus: document.getElementById("sync-status"),
  connectButton: document.getElementById("connect-button"),
  reloadButton: document.getElementById("reload-button"),
  entryForm: document.getElementById("entry-form"),
  date: document.getElementById("date"),
  photoInput: document.getElementById("photo"),
  photoPreview: document.getElementById("photo-preview"),
  previewImage: document.getElementById("preview-image"),
  entriesList: document.getElementById("entries-list"),
  entriesEmpty: document.getElementById("entries-empty"),
  toast: document.getElementById("toast")
};

bootstrap();

function bootstrap() {
  elements.date.value = new Date().toISOString().slice(0, 10);
  elements.connectButton.addEventListener("click", connectGoogleDrive);
  elements.reloadButton.addEventListener("click", async () => {
    if (!state.accessToken) {
      showToast("先に Google Drive に接続してください。");
      return;
    }
    await loadEntriesFromDrive();
  });
  elements.photoInput.addEventListener("change", handlePhotoPreview);
  elements.entryForm.addEventListener("submit", handleSubmit);

  validateConfig();
  renderEntries();
}

function validateConfig() {
  if (!config.googleClientId || config.googleClientId.includes("YOUR_GOOGLE")) {
    setSyncMessage("config.js に Google OAuth Client ID を設定してください。");
    elements.connectButton.disabled = true;
  }
}

function connectGoogleDrive() {
  if (!window.google?.accounts?.oauth2) {
    showToast("Google 認証ライブラリの読み込みを待ってから再度お試しください。");
    return;
  }

  if (!state.tokenClient) {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: DRIVE_SCOPE,
      callback: async (response) => {
        if (response.error) {
          console.error(response);
          setSyncMessage("Google Drive への接続に失敗しました。");
          showToast("Google Drive の接続に失敗しました。");
          return;
        }

        state.accessToken = response.access_token;
        updateAuthUI(true);
        await ensureDriveStructure();
        await loadEntriesFromDrive();
      }
    });
  }

  state.tokenClient.requestAccessToken({ prompt: state.accessToken ? "" : "consent" });
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.accessToken) {
    showToast("保存するには Google Drive に接続してください。");
    return;
  }

  const formData = new FormData(elements.entryForm);
  const entry = {
    id: crypto.randomUUID(),
    date: formData.get("date"),
    weight: Number(formData.get("weight")),
    food: String(formData.get("food")).trim(),
    health: String(formData.get("health")).trim(),
    createdAt: new Date().toISOString(),
    photo: null
  };

  const photoFile = elements.photoInput.files[0];

  try {
    elements.entryForm.querySelector('button[type="submit"]').disabled = true;
    setSyncMessage("Google Drive に保存しています...");

    if (photoFile) {
      entry.photo = await uploadPhoto(photoFile, entry.id);
    }

    state.entries = [entry, ...state.entries].sort(sortEntries);
    await saveEntriesToDrive();
    renderEntries();
    elements.entryForm.reset();
    elements.date.value = new Date().toISOString().slice(0, 10);
    clearPhotoPreview();
    setSyncMessage("Google Drive と同期済みです。");
    showToast("記録を保存しました。");
  } catch (error) {
    console.error(error);
    setSyncMessage("保存に失敗しました。設定や権限をご確認ください。");
    showToast("保存に失敗しました。");
  } finally {
    elements.entryForm.querySelector('button[type="submit"]').disabled = false;
  }
}

function handlePhotoPreview(event) {
  const file = event.target.files[0];
  if (!file) {
    clearPhotoPreview();
    return;
  }

  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  state.previewUrl = objectUrl;
  elements.previewImage.src = objectUrl;
  elements.photoPreview.hidden = false;
}

function clearPhotoPreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
  elements.previewImage.removeAttribute("src");
  elements.photoPreview.hidden = true;
}

async function ensureDriveStructure() {
  const rootFolderName = config.driveRootFolderName || "Catlog";
  const photosFolderName = config.photosFolderName || "photos";

  state.drive.rootFolderId = await findOrCreateFolder(rootFolderName);
  state.drive.photosFolderId = await findOrCreateFolder(photosFolderName, state.drive.rootFolderId);
  state.drive.entriesFileId = await findExistingFile(
    config.entriesFileName || "entries.json",
    state.drive.rootFolderId
  );
}

async function loadEntriesFromDrive() {
  await ensureDriveStructure();

  if (!state.drive.entriesFileId) {
    state.entries = [];
    renderEntries();
    setSyncMessage("保存先は準備できています。最初の記録を追加してください。");
    return;
  }

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${state.drive.entriesFileId}?alt=media`
  );

  const data = await response.json();
  state.entries = Array.isArray(data.entries) ? data.entries.sort(sortEntries) : [];
  renderEntries();
  setSyncMessage(`${state.entries.length} 件の記録を Google Drive から読み込みました。`);
}

async function saveEntriesToDrive() {
  const body = {
    updatedAt: new Date().toISOString(),
    entries: state.entries
  };

  const metadata = {
    name: config.entriesFileName || "entries.json",
    mimeType: "application/json",
    parents: [state.drive.rootFolderId]
  };

  const response = await multipartUpload({
    metadata,
    contentType: "application/json",
    fileBody: JSON.stringify(body, null, 2),
    fileId: state.drive.entriesFileId
  });

  state.drive.entriesFileId = response.id;
}

async function uploadPhoto(file, entryId) {
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const safeExtension = extension.toLowerCase();
  const metadata = {
    name: `${entryId}${safeExtension}`,
    mimeType: file.type || "image/jpeg",
    parents: [state.drive.photosFolderId]
  };

  const response = await multipartUpload({
    metadata,
    contentType: file.type || "application/octet-stream",
    fileBody: file
  });

  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${response.id}?fields=webViewLink,webContentLink`,
    { method: "GET" }
  );

  return {
    fileId: response.id,
    name: file.name,
    mimeType: file.type || "image/jpeg",
    url: `https://drive.google.com/thumbnail?id=${response.id}&sz=w1200`
  };
}

async function findOrCreateFolder(name, parentId = null) {
  const existing = await findFolder(name, parentId);
  if (existing) {
    return existing.id;
  }

  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {})
  };

  const response = await driveFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata)
  });

  const created = await response.json();
  return created.id;
}

async function findFolder(name, parentId = null) {
  const queryParts = [
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false"
  ];

  if (parentId) {
    queryParts.push(`'${parentId}' in parents`);
  }

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(queryParts.join(" and "))}&fields=files(id,name)&pageSize=1`
  );

  const data = await response.json();
  return data.files?.[0] || null;
}

async function findExistingFile(name, parentId) {
  const query = [
    `name = '${escapeDriveQuery(name)}'`,
    `'${parentId}' in parents`,
    "trashed = false"
  ].join(" and ");

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1`
  );
  const data = await response.json();
  return data.files?.[0]?.id || null;
}

async function multipartUpload({ metadata, contentType, fileBody, fileId = null }) {
  const boundary = "catlog-upload-boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metadataPart = [
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata)
  ].join("");

  const fileHeader = [
    delimiter,
    `Content-Type: ${contentType}\r\n\r\n`
  ].join("");

  const body = new Blob([metadataPart, fileHeader, fileBody, closeDelimiter]);
  const method = fileId ? "PATCH" : "POST";
  const endpoint = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const response = await driveFetch(endpoint, {
    method,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });

  return response.json();
}

async function driveFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Drive request failed: ${response.status}`);
  }

  return response;
}

function renderEntries() {
  elements.entriesList.innerHTML = "";
  elements.entriesEmpty.hidden = state.entries.length > 0;

  state.entries.forEach((entry) => {
    const article = document.createElement("article");
    article.className = "entry-card";
    article.innerHTML = `
      <div>
        <p class="entry-meta">${formatDate(entry.date)} / ${entry.weight.toFixed(2)} kg</p>
        <h3>${escapeHtml(formatHealthHeadline(entry.health))}</h3>
        <p><strong>食べ物:</strong> ${escapeHtml(entry.food)}</p>
        <p><strong>健康状態:</strong> ${escapeHtml(entry.health)}</p>
      </div>
      <div>
        ${entry.photo?.url ? `<img class="entry-photo" src="${entry.photo.url}" alt="猫の記録写真">` : '<div class="empty-state">写真なし</div>'}
      </div>
    `;
    elements.entriesList.appendChild(article);
  });
}

function updateAuthUI(isConnected) {
  elements.authStatus.textContent = isConnected ? "接続済み" : "未接続";
  elements.reloadButton.disabled = !isConnected;
}

function setSyncMessage(message) {
  elements.syncStatus.textContent = message;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 2600);
}

function sortEntries(a, b) {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

function formatHealthHeadline(health) {
  return health.length > 22 ? `${health.slice(0, 22)}...` : health;
}

function escapeDriveQuery(text) {
  return String(text).replace(/'/g, "\\'");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
