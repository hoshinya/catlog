const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const STORAGE_KEYS = {
  accessToken: "catlog.accessToken",
  tokenExpiry: "catlog.tokenExpiry",
  hasAuthorized: "catlog.hasAuthorized",
  rootFolderId: "catlog.rootFolderId",
  photosFolderId: "catlog.photosFolderId",
  entriesFileId: "catlog.entriesFileId",
  periodFilter: "catlog.periodFilter",
  viewMode: "catlog.viewMode"
};
const HEALTH_QUICK_TAGS = ["元気", "食欲あり", "食欲なし", "嘔吐", "軟便", "下痢", "くしゃみ", "鼻水"];
const RECENT_FOOD_LIMIT = 8;
const VALID_PERIODS = ["7", "30", "all"];
const VALID_VIEW_MODES = ["list", "calendar"];
const MOBILE_MEDIA_QUERY = "(max-width: 900px)";
const DRIVE_APP_PROPERTY_KEY = "catlogKind";
const DRIVE_RESOURCE_KINDS = {
  rootFolder: "root-folder",
  photosFolder: "photos-folder",
  entriesFile: "entries-file"
};

const config = window.CATLOG_CONFIG || {};
const state = {
  accessToken: null,
  tokenClient: null,
  entries: [],
  previewUrl: null,
  installPrompt: null,
  editingEntryId: null,
  draftFoods: [],
  pendingPhotoFile: null,
  periodFilter: "30",
  viewMode: "list",
  calendarMonth: null, // { year, month } where month is 0-based
  draggingFoodId: null,
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
  installCard: document.getElementById("install-card"),
  installButton: document.getElementById("install-button"),
  formTitle: document.getElementById("form-title"),
  formNote: document.getElementById("form-note"),
  cancelEditButton: document.getElementById("cancel-edit-button"),
  saveButton: document.getElementById("save-button"),
  entryForm: document.getElementById("entry-form"),
  date: document.getElementById("date"),
  weight: document.getElementById("weight"),
  ownerWeight: document.getElementById("owner-weight"),
  foodInput: document.getElementById("food-input"),
  foodTime: document.getElementById("food-time"),
  addFoodButton: document.getElementById("add-food-button"),
  foodList: document.getElementById("food-list"),
  foodListEmpty: document.getElementById("food-list-empty"),
  health: document.getElementById("health"),
  poopCount: document.getElementById("poop-count"),
  photoInput: document.getElementById("photo"),
  photoPreview: document.getElementById("photo-preview"),
  previewImage: document.getElementById("preview-image"),
  removePhotoField: document.getElementById("photo-remove-field"),
  removePhotoCheckbox: document.getElementById("remove-photo"),
  entriesList: document.getElementById("entries-list"),
  entriesEmpty: document.getElementById("entries-empty"),
  graphArea: document.getElementById("graph-area"),
  graphEmpty: document.getElementById("graph-empty"),
  weightGraph: document.getElementById("weight-graph"),
  toast: document.getElementById("toast"),
  periodFilter: document.getElementById("period-filter"),
  viewToggle: document.getElementById("view-toggle"),
  listView: document.getElementById("list-view"),
  calendarView: document.getElementById("calendar-view"),
  calendarGrid: document.getElementById("calendar-grid"),
  calendarTitle: document.getElementById("cal-title"),
  calendarPrev: document.getElementById("cal-prev"),
  calendarNext: document.getElementById("cal-next"),
  healthQuickTagsList: document.getElementById("health-quick-tags-list"),
  recentFoods: document.getElementById("recent-foods"),
  recentFoodsList: document.getElementById("recent-foods-list"),
  formCard: document.getElementById("form-card"),
  formBackdrop: document.getElementById("form-backdrop"),
  openFormFab: document.getElementById("open-form-fab"),
  closeSheetButton: document.getElementById("close-sheet-button")
};

const photoBlobCache = new Map();

bootstrap();

function bootstrap() {
  resetForm();

  elements.connectButton.addEventListener("click", async () => {
    try {
      await connectGoogleDrive();
    } catch (error) {
      console.error(error);
      clearSavedSession();
      updateAuthUI(false);
      setSyncMessage("Google Drive に再接続してください。");
      showToast("Google Drive の接続に失敗しました。");
    }
  });
  elements.reloadButton.addEventListener("click", async () => {
    if (!state.accessToken) {
      showToast("先に Google Drive に接続してください。");
      return;
    }
    await loadEntriesFromDrive();
  });
  elements.installButton.addEventListener("click", installApp);
  elements.addFoodButton.addEventListener("click", addFoodItemFromInput);
  elements.foodInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addFoodItemFromInput();
    }
  });
  elements.foodList.addEventListener("click", handleFoodListClick);
  elements.photoInput.addEventListener("change", handlePhotoPreview);
  elements.removePhotoCheckbox?.addEventListener("change", handleRemovePhotoToggle);
  document.addEventListener("paste", handleClipboardPaste);
  elements.entryForm.addEventListener("submit", handleSubmit);
  elements.cancelEditButton.addEventListener("click", () => {
    resetForm();
    closeFormSheet();
    showToast("編集をキャンセルしました。");
  });
  elements.entriesList.addEventListener("click", handleEntryListClick);
  elements.entriesList.addEventListener("keydown", handleEntryListKeydown);
  elements.periodFilter?.addEventListener("click", handlePeriodFilterClick);
  elements.viewToggle?.addEventListener("click", handleViewToggleClick);
  elements.calendarPrev?.addEventListener("click", () => shiftCalendarMonth(-1));
  elements.calendarNext?.addEventListener("click", () => shiftCalendarMonth(1));
  elements.calendarGrid?.addEventListener("click", handleCalendarClick);
  elements.healthQuickTagsList?.addEventListener("click", handleHealthQuickTagClick);
  elements.recentFoodsList?.addEventListener("click", handleRecentFoodClick);
  elements.foodList.addEventListener("dragstart", handleFoodDragStart);
  elements.foodList.addEventListener("dragover", handleFoodDragOver);
  elements.foodList.addEventListener("dragleave", handleFoodDragLeave);
  elements.foodList.addEventListener("drop", handleFoodDrop);
  elements.foodList.addEventListener("dragend", handleFoodDragEnd);
  elements.openFormFab?.addEventListener("click", () => {
    if (state.editingEntryId) {
      resetForm();
    }
    openFormSheet();
    elements.weight?.focus();
  });
  elements.closeSheetButton?.addEventListener("click", () => closeFormSheet());
  elements.formBackdrop?.addEventListener("click", () => closeFormSheet());
  document.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  window.addEventListener("appinstalled", handleAppInstalled);
  window.addEventListener("online", handleConnectivityChange);
  window.addEventListener("offline", handleConnectivityChange);

  validateConfig();
  restoreUserPreferences();
  restoreDriveState();
  restoreSavedSession();
  registerServiceWorker();
  refreshInstallUI();
  handleConnectivityChange();
  renderHealthQuickTags();
  renderFoodDraft();
  renderRecentFoods();
  renderEntries();
  renderGraph();
  renderCalendar();
}

function resetForm() {
  elements.entryForm.reset();
  elements.date.value = new Date().toISOString().slice(0, 10);
  elements.formTitle.textContent = "記録を追加";
  elements.formNote.textContent = "保存時に JSON と写真を Google Drive へアップロードします。";
  elements.saveButton.textContent = "記録を保存";
  elements.cancelEditButton.hidden = true;
  state.editingEntryId = null;
  state.draftFoods = [];
  if (elements.foodTime) {
    elements.foodTime.value = currentTimeLabel30Min();
  }
  state.pendingPhotoFile = null;
  if (elements.removePhotoCheckbox) {
    elements.removePhotoCheckbox.checked = false;
  }
  if (elements.removePhotoField) {
    elements.removePhotoField.hidden = true;
  }
  renderFoodDraft();
  clearPhotoPreview();
}

function validateConfig() {
  if (!config.googleClientId || config.googleClientId.includes("YOUR_GOOGLE")) {
    setSyncMessage("config.js に Google OAuth Client ID を設定してください。");
    elements.connectButton.disabled = true;
  }
}

async function connectGoogleDrive() {
  if (!navigator.onLine) {
    showToast("オフライン中は Google Drive に接続できません。");
    return;
  }

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
        persistToken(response);
        updateAuthUI(true);
        await ensureDriveStructure();
        await loadEntriesFromDrive();
      }
    });
  }

  if (hasUsableAccessToken()) {
    updateAuthUI(true);
    await ensureDriveStructure();
    await loadEntriesFromDrive();
    showToast("保存済みの接続情報を使いました。");
    return;
  }

  const canTrySilent = localStorage.getItem(STORAGE_KEYS.hasAuthorized) === "true";

  try {
    await requestAccessToken({ prompt: canTrySilent ? "" : "consent" });
  } catch (error) {
    console.warn("Silent token refresh failed, falling back to consent.", error);
    if (canTrySilent) {
      await requestAccessToken({ prompt: "consent" });
    } else {
      throw error;
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!state.accessToken) {
    showToast("保存するには Google Drive に接続してください。");
    return;
  }

  if (!navigator.onLine) {
    showToast("オフライン中は保存できません。");
    return;
  }

  if (state.draftFoods.length === 0) {
    showToast("食べ物を少なくとも 1 件追加してください。");
    return;
  }

  const formData = new FormData(elements.entryForm);
  const existing = state.entries.find((entry) => entry.id === state.editingEntryId) || null;
  const entry = {
    id: existing?.id || crypto.randomUUID(),
    date: formData.get("date"),
    weight: Number(formData.get("weight")),
    ownerWeight: parseOptionalNumber(formData.get("ownerWeight")),
    foods: state.draftFoods.map((item) => ({ ...item })),
    health: String(formData.get("health")).trim(),
    poopCount: parseOptionalInteger(formData.get("poopCount")),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    photo: existing?.photo || null
  };

  const photoFile = state.pendingPhotoFile || elements.photoInput.files[0] || null;
  const wantsRemovePhoto = Boolean(elements.removePhotoCheckbox?.checked);
  const previousPhoto = existing?.photo || null;

  try {
    elements.saveButton.disabled = true;
    setSyncMessage("Google Drive に保存しています...");
    await ensureDriveStructure();

    if (photoFile) {
      entry.photo = await uploadPhoto(photoFile, entry.id);
    } else if (wantsRemovePhoto) {
      entry.photo = null;
    }

    if (existing) {
      state.entries = state.entries.map((item) => (item.id === entry.id ? entry : item));
    } else {
      state.entries = [entry, ...state.entries];
    }

    state.entries = state.entries.map(normalizeEntry).sort(sortEntries);
    await saveEntriesToDrive();

    const previousFileId = previousPhoto?.fileId || null;
    const currentFileId = entry.photo?.fileId || null;
    if (previousFileId && previousFileId !== currentFileId) {
      deleteDriveFile(previousFileId);
      revokePhotoBlob(previousFileId);
    }

    renderEntries();
    renderGraph();
    renderRecentFoods();
    renderCalendar();
    resetForm();
    closeFormSheet();
    setSyncMessage("Google Drive と同期済みです。");
    showToast(existing ? "記録を更新しました。" : "記録を保存しました。");
  } catch (error) {
    console.error(error);
    const errorMessage = describeDriveError(error);
    setSyncMessage(errorMessage);
    showToast(errorMessage);
  } finally {
    elements.saveButton.disabled = false;
  }
}

function addFoodItemFromInput() {
  const text = elements.foodInput.value.trim();
  if (!text) {
    return;
  }

  state.draftFoods.push({
    id: crypto.randomUUID(),
    label: text,
    time: getDraftFoodTime()
  });
  elements.foodInput.value = "";
  renderFoodDraft();
}

function getDraftFoodTime() {
  const value = elements.foodTime?.value;
  if (value && /^\d{2}:\d{2}$/.test(value)) {
    return roundTimeTo30Min(value);
  }
  return currentTimeLabel30Min();
}

function renderFoodDraft() {
  elements.foodList.innerHTML = "";
  elements.foodListEmpty.hidden = state.draftFoods.length > 0;

  state.draftFoods.forEach((item) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.setAttribute("draggable", "true");
    chip.dataset.foodChipId = item.id;
    chip.innerHTML = `
      <span>${escapeHtml(item.label)}</span>
      <button class="chip__remove" type="button" data-action="remove-food" data-food-id="${item.id}" aria-label="食べ物を削除">×</button>
    `;
    elements.foodList.appendChild(chip);
  });
}

function handleFoodListClick(event) {
  const removeButton = event.target.closest('[data-action="remove-food"]');
  if (removeButton) {
    const foodId = removeButton.dataset.foodId;
    state.draftFoods = state.draftFoods.filter((item) => item.id !== foodId);
    renderFoodDraft();
  }
}

function handleFoodDragStart(event) {
  const chip = event.target.closest("[data-food-chip-id]");
  if (!chip) {
    return;
  }
  state.draggingFoodId = chip.dataset.foodChipId;
  chip.classList.add("is-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", chip.dataset.foodChipId);
  }
}

function handleFoodDragOver(event) {
  if (!state.draggingFoodId) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  const chip = event.target.closest("[data-food-chip-id]");
  document.querySelectorAll(".chip.is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
  if (chip && chip.dataset.foodChipId !== state.draggingFoodId) {
    chip.classList.add("is-drop-target");
  }
}

function handleFoodDragLeave(event) {
  const chip = event.target.closest("[data-food-chip-id]");
  if (chip) {
    chip.classList.remove("is-drop-target");
  }
}

function handleFoodDrop(event) {
  if (!state.draggingFoodId) {
    return;
  }
  event.preventDefault();
  const targetChip = event.target.closest("[data-food-chip-id]");
  if (!targetChip || targetChip.dataset.foodChipId === state.draggingFoodId) {
    state.draggingFoodId = null;
    document.querySelectorAll(".chip.is-drop-target, .chip.is-dragging").forEach((el) => {
      el.classList.remove("is-drop-target");
      el.classList.remove("is-dragging");
    });
    return;
  }
  const fromIndex = state.draftFoods.findIndex((item) => item.id === state.draggingFoodId);
  const toIndex = state.draftFoods.findIndex((item) => item.id === targetChip.dataset.foodChipId);
  if (fromIndex === -1 || toIndex === -1) {
    return;
  }
  const [moved] = state.draftFoods.splice(fromIndex, 1);
  state.draftFoods.splice(toIndex, 0, moved);
  state.draggingFoodId = null;
  renderFoodDraft();
}

function handleFoodDragEnd() {
  state.draggingFoodId = null;
  document.querySelectorAll(".chip.is-drop-target, .chip.is-dragging").forEach((el) => {
    el.classList.remove("is-drop-target");
    el.classList.remove("is-dragging");
  });
}

function handlePhotoPreview(event) {
  const file = event.target.files[0];
  if (!file) {
    if (state.pendingPhotoFile) {
      // change event was fired from a paste handler that already
      // set the file — keep the existing pending file and preview.
      return;
    }
    clearPhotoPreview();
    if (state.editingEntryId) {
      const editingEntry = state.entries.find((entry) => entry.id === state.editingEntryId);
      if (editingEntry?.photo?.fileId && !elements.removePhotoCheckbox?.checked) {
        showEditingPhoto(editingEntry.photo);
      }
    }
    return;
  }

  state.pendingPhotoFile = file;

  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  state.previewUrl = objectUrl;
  elements.previewImage.src = objectUrl;
  elements.photoPreview.hidden = false;
}

function handleClipboardPaste(event) {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    if (target !== elements.photoInput) {
      return;
    }
  }

  const items = event.clipboardData?.items;
  if (!items || items.length === 0) {
    return;
  }

  let pastedFile = null;
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      pastedFile = item.getAsFile();
      if (pastedFile) {
        break;
      }
    }
  }

  if (!pastedFile) {
    return;
  }

  event.preventDefault();
  assignPastedImageToInput(pastedFile);
  showToast("クリップボードの画像を取り込みました。");
}

function assignPastedImageToInput(file) {
  const inferredExt = guessImageExtension(file);
  const fallbackName = `pasted-${Date.now()}${inferredExt}`;
  const namedFile = file.name
    ? file
    : new File([file], fallbackName, { type: file.type || "image/png" });

  state.pendingPhotoFile = namedFile;

  try {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(namedFile);
    elements.photoInput.files = dataTransfer.files;
  } catch (error) {
    console.warn("DataTransfer not supported, falling back to preview-only:", error);
  }

  if (elements.removePhotoCheckbox) {
    elements.removePhotoCheckbox.checked = false;
  }

  // Render preview directly so it works even when the file input
  // could not actually be populated.
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }
  const objectUrl = URL.createObjectURL(namedFile);
  state.previewUrl = objectUrl;
  elements.previewImage.src = objectUrl;
  elements.photoPreview.hidden = false;
}

function guessImageExtension(file) {
  const type = file.type || "";
  if (type === "image/png") return ".png";
  if (type === "image/jpeg") return ".jpg";
  if (type === "image/gif") return ".gif";
  if (type === "image/webp") return ".webp";
  if (type === "image/heic") return ".heic";
  return "";
}

function handleRemovePhotoToggle() {
  if (!state.editingEntryId) {
    return;
  }
  const editingEntry = state.entries.find((item) => item.id === state.editingEntryId);
  if (!editingEntry?.photo?.fileId) {
    return;
  }
  if (elements.removePhotoCheckbox?.checked) {
    elements.photoInput.value = "";
    clearPhotoPreview();
  } else if (!elements.photoInput.files[0]) {
    showEditingPhoto(editingEntry.photo);
  }
}

function clearPhotoPreview() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
  state.pendingPhotoFile = null;
  elements.previewImage.removeAttribute("src");
  elements.photoPreview.hidden = true;
}

function startEditing(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  state.editingEntryId = entry.id;
  elements.formTitle.textContent = "記録を編集";
  elements.formNote.textContent = "内容を修正して保存すると Google Drive 側も更新されます。";
  elements.saveButton.textContent = "変更を保存";
  elements.cancelEditButton.hidden = false;

  elements.date.value = entry.date;
  elements.weight.value = entry.weight ?? "";
  elements.ownerWeight.value = entry.ownerWeight ?? "";
  elements.health.value = entry.health ?? "";
  elements.poopCount.value = entry.poopCount ?? "";
  state.draftFoods = entry.foods.map((item) => ({ ...item }));
  renderFoodDraft();

  elements.photoInput.value = "";
  if (elements.removePhotoCheckbox) {
    elements.removePhotoCheckbox.checked = false;
  }

  clearPhotoPreview();
  if (entry.photo?.fileId) {
    if (elements.removePhotoField) {
      elements.removePhotoField.hidden = false;
    }
    showEditingPhoto(entry.photo);
  } else if (elements.removePhotoField) {
    elements.removePhotoField.hidden = true;
  }

  openFormSheet();
  if (!isMobileViewport()) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

async function showEditingPhoto(photo) {
  if (!photo?.fileId) {
    return;
  }
  try {
    const url = await getPhotoBlobUrl(photo.fileId);
    if (state.editingEntryId && elements.previewImage) {
      elements.previewImage.src = url;
      elements.photoPreview.hidden = false;
    }
  } catch (error) {
    console.warn("Failed to load existing photo:", error);
  }
}

async function deleteEntry(entryId) {
  const entry = state.entries.find((item) => item.id === entryId);
  if (!entry) {
    return;
  }

  const confirmed = window.confirm(`${formatDate(entry.date)} の記録を削除しますか？`);
  if (!confirmed) {
    return;
  }

  if (!state.accessToken) {
    showToast("削除するには Google Drive に接続してください。");
    return;
  }

  try {
    setSyncMessage("記録を削除しています...");
    state.entries = state.entries.filter((item) => item.id !== entryId);
    await saveEntriesToDrive();

    if (entry.photo?.fileId) {
      deleteDriveFile(entry.photo.fileId);
      revokePhotoBlob(entry.photo.fileId);
    }

    renderEntries();
    renderGraph();
    renderRecentFoods();
    renderCalendar();

    if (state.editingEntryId === entryId) {
      resetForm();
      closeFormSheet();
    }

    setSyncMessage("Google Drive と同期済みです。");
    showToast("記録を削除しました。");
  } catch (error) {
    console.error(error);
    const errorMessage = describeDriveError(error);
    setSyncMessage(errorMessage);
    showToast(errorMessage);
  }
}

function handleEntryListClick(event) {
  const button = event.target.closest("[data-action]");
  if (button?.dataset.action === "edit-entry") {
    startEditing(button.dataset.entryId);
    return;
  }

  if (button?.dataset.action === "delete-entry") {
    deleteEntry(button.dataset.entryId);
    return;
  }

  const card = event.target.closest("[data-entry-id]");
  if (!card) {
    return;
  }

  startEditing(card.dataset.entryId);
}

function handleEntryListKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const card = event.target.closest("[data-entry-id]");
  if (!card) {
    return;
  }

  event.preventDefault();
  startEditing(card.dataset.entryId);
}

async function ensureDriveStructure() {
  const rootFolderName = config.driveRootFolderName || "Catlog";
  const photosFolderName = config.photosFolderName || "photos";

  state.drive.rootFolderId = await findOrCreateFolder(
    rootFolderName,
    null,
    DRIVE_RESOURCE_KINDS.rootFolder,
    state.drive.rootFolderId
  );
  state.drive.photosFolderId = await findOrCreateFolder(
    photosFolderName,
    state.drive.rootFolderId,
    DRIVE_RESOURCE_KINDS.photosFolder,
    state.drive.photosFolderId
  );
  state.drive.entriesFileId = await findExistingFile(
    config.entriesFileName || "entries.json",
    state.drive.rootFolderId,
    DRIVE_RESOURCE_KINDS.entriesFile,
    state.drive.entriesFileId
  );
  persistDriveState();
}

async function loadEntriesFromDrive() {
  await ensureDriveStructure();
  clearPhotoBlobCache();

  if (!state.drive.entriesFileId) {
    state.entries = [];
    renderEntries();
    renderGraph();
    setSyncMessage("保存先は準備できています。最初の記録を追加してください。");
    return;
  }

  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${state.drive.entriesFileId}?alt=media`
  );

  const data = await response.json();
  state.entries = Array.isArray(data.entries) ? data.entries.map(normalizeEntry).sort(sortEntries) : [];
  renderEntries();
  renderGraph();
  renderRecentFoods();
  renderCalendar();
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
    appProperties: {
      [DRIVE_APP_PROPERTY_KEY]: DRIVE_RESOURCE_KINDS.entriesFile
    },
    ...(state.drive.entriesFileId ? {} : { parents: [state.drive.rootFolderId] })
  };

  const response = await multipartUpload({
    metadata,
    contentType: "application/json",
    fileBody: JSON.stringify(body, null, 2),
    fileId: state.drive.entriesFileId
  });

  state.drive.entriesFileId = response.id;
  persistDriveState();
}

async function uploadPhoto(file, entryId) {
  const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const safeExtension = extension.toLowerCase();
  const uniqueSuffix = Date.now().toString(36);
  const metadata = {
    name: `${entryId}-${uniqueSuffix}${safeExtension}`,
    mimeType: file.type || "image/jpeg",
    parents: [state.drive.photosFolderId]
  };

  const response = await multipartUpload({
    metadata,
    contentType: file.type || "application/octet-stream",
    fileBody: file
  });

  return {
    fileId: response.id,
    name: file.name,
    mimeType: file.type || "image/jpeg"
  };
}

async function deleteDriveFile(fileId) {
  if (!fileId) {
    return;
  }
  try {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "DELETE"
    });
  } catch (error) {
    console.warn("Failed to delete Drive file:", fileId, error);
  }
}

async function findOrCreateFolder(name, parentId = null, kind = null, cachedId = null) {
  const existing = await findFolder(name, parentId, kind, cachedId);
  if (existing) {
    return existing.id;
  }

  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    ...(parentId ? { parents: [parentId] } : {}),
    ...(kind ? { appProperties: { [DRIVE_APP_PROPERTY_KEY]: kind } } : {})
  };

  const response = await driveFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata)
  });

  const created = await response.json();
  return created.id;
}

async function findFolder(name, parentId = null, kind = null, cachedId = null) {
  const cached = await getAccessibleDriveFile(cachedId);
  if (cached?.mimeType === "application/vnd.google-apps.folder" && matchesParent(cached, parentId)) {
    if (kind && cached.appProperties?.[DRIVE_APP_PROPERTY_KEY] !== kind) {
      const tagged = await tagManagedResource(cached.id, kind);
      if (!tagged) {
        return null;
      }
    }
    return cached;
  }

  if (kind) {
    const tagged = await searchDriveFile(buildManagedQuery({
      kind,
      parentId,
      mimeType: "application/vnd.google-apps.folder"
    }));
    if (tagged) {
      return tagged;
    }
  }

  const queryParts = [
    `name = '${escapeDriveQuery(name)}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false"
  ];

  if (parentId) {
    queryParts.push(`'${parentId}' in parents`);
  }

  const fallback = await searchDriveFile(queryParts.join(" and "));
  if (fallback && kind) {
    const tagged = await tagManagedResource(fallback.id, kind);
    if (!tagged) {
      return null;
    }
  }
  return fallback;
}

async function findExistingFile(name, parentId, kind = null, cachedId = null) {
  const cached = await getAccessibleDriveFile(cachedId);
  if (cached && matchesParent(cached, parentId)) {
    if (kind && cached.appProperties?.[DRIVE_APP_PROPERTY_KEY] !== kind) {
      const tagged = await tagManagedResource(cached.id, kind);
      if (!tagged) {
        return null;
      }
    }
    return cached.id;
  }

  if (kind) {
    const tagged = await searchDriveFile(buildManagedQuery({ kind, parentId }));
    if (tagged) {
      return tagged.id;
    }
  }

  const query = [
    `name = '${escapeDriveQuery(name)}'`,
    `'${parentId}' in parents`,
    "trashed = false"
  ].join(" and ");

  const fallback = await searchDriveFile(query);
  if (fallback && kind) {
    const tagged = await tagManagedResource(fallback.id, kind);
    if (!tagged) {
      return null;
    }
  }
  return fallback?.id || null;
}

async function multipartUpload({ metadata, contentType, fileBody, fileId = null }) {
  const safeMetadata = fileId
    ? Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "parents"))
    : metadata;
  const boundary = "catlog-upload-boundary";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metadataPart = [
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(safeMetadata)
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

async function driveFetch(url, options = {}, { retried = false } = {}) {
  if (!state.accessToken) {
    const error = new Error("Google Drive に接続されていません。");
    error.status = 401;
    throw error;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      ...(options.headers || {})
    }
  });

  if (response.status === 401 && !retried) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return driveFetch(url, options, { retried: true });
    }
  }

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(detail || `Drive request failed: ${response.status}`);
    error.status = response.status;
    error.detail = detail || "";
    throw error;
  }

  return response;
}

async function tryRefreshAccessToken() {
  if (!state.tokenClient || !navigator.onLine) {
    return false;
  }
  try {
    await new Promise((resolve, reject) => {
      state.tokenClient.callback = (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        state.accessToken = response.access_token;
        persistToken(response);
        resolve(response);
      };
      state.tokenClient.requestAccessToken({ prompt: "" });
    });
    return true;
  } catch (error) {
    console.warn("Silent token refresh failed:", error);
    return false;
  }
}

function describeDriveError(error) {
  const message = String(error?.message || "");
  const rawDetail = String(error?.detail || message || "").replace(/\s+/g, " ").trim();
  const apiMessage = extractApiMessage(rawDetail);
  const status = error?.status ? ` (HTTP ${error.status})` : "";

  if (apiMessage) {
    return `保存に失敗しました${status}: ${apiMessage}`;
  }

  if (rawDetail) {
    return `保存に失敗しました${status}: ${rawDetail.slice(0, 160)}`;
  }

  return `保存に失敗しました${status}。設定や権限をご確認ください。`;
}

function extractApiMessage(message) {
  try {
    const parsed = JSON.parse(message);
    return parsed?.error?.message || "";
  } catch {
    return "";
  }
}

/* -------- Health quick tags (#3) -------- */

function renderHealthQuickTags() {
  if (!elements.healthQuickTagsList) {
    return;
  }
  elements.healthQuickTagsList.innerHTML = "";
  HEALTH_QUICK_TAGS.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-tag";
    button.dataset.tag = tag;
    button.textContent = tag;
    elements.healthQuickTagsList.appendChild(button);
  });
}

function handleHealthQuickTagClick(event) {
  const button = event.target.closest("[data-tag]");
  if (!button) {
    return;
  }
  appendHealthTag(button.dataset.tag);
}

function appendHealthTag(tag) {
  const current = elements.health.value.trim();
  if (current.includes(tag)) {
    return;
  }
  elements.health.value = current ? `${current}、${tag}` : tag;
  elements.health.dispatchEvent(new Event("input", { bubbles: true }));
  elements.health.focus();
}

/* -------- Recent foods (#2) -------- */

function renderRecentFoods() {
  if (!elements.recentFoodsList || !elements.recentFoods) {
    return;
  }

  const counts = new Map();
  state.entries.forEach((entry) => {
    (entry.foods || []).forEach((food) => {
      const label = (food.label || "").trim();
      if (!label) return;
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, RECENT_FOOD_LIMIT)
    .map(([label]) => label);

  elements.recentFoodsList.innerHTML = "";
  if (ranked.length === 0) {
    elements.recentFoods.hidden = true;
    return;
  }

  elements.recentFoods.hidden = false;
  ranked.forEach((label) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-tag";
    button.dataset.foodLabel = label;
    button.textContent = label;
    elements.recentFoodsList.appendChild(button);
  });
}

function handleRecentFoodClick(event) {
  const button = event.target.closest("[data-food-label]");
  if (!button) {
    return;
  }
  state.draftFoods.push({
    id: crypto.randomUUID(),
    label: button.dataset.foodLabel,
    time: getDraftFoodTime()
  });
  renderFoodDraft();
}

/* -------- Period filter (#8) -------- */

function handlePeriodFilterClick(event) {
  const button = event.target.closest("[data-period]");
  if (!button) return;
  const period = button.dataset.period;
  if (!VALID_PERIODS.includes(period) || period === state.periodFilter) {
    return;
  }
  state.periodFilter = period;
  setStoredValue(STORAGE_KEYS.periodFilter, period);
  applyPeriodFilterUI();
  renderEntries();
  renderGraph();
}

function applyPeriodFilterUI() {
  if (!elements.periodFilter) return;
  elements.periodFilter.querySelectorAll("[data-period]").forEach((btn) => {
    const isActive = btn.dataset.period === state.periodFilter;
    btn.classList.toggle("is-active", isActive);
    if (isActive) {
      btn.setAttribute("aria-selected", "true");
    } else {
      btn.removeAttribute("aria-selected");
    }
  });
}

function getFilteredEntries() {
  if (state.periodFilter === "all") {
    return state.entries;
  }
  const days = Number(state.periodFilter);
  if (!Number.isFinite(days) || days <= 0) {
    return state.entries;
  }
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  return state.entries.filter((entry) => {
    const date = new Date(entry.date);
    return Number.isFinite(date.getTime()) && date >= cutoff;
  });
}

/* -------- View toggle + calendar (#10) -------- */

function handleViewToggleClick(event) {
  const button = event.target.closest("[data-view]");
  if (!button) return;
  const view = button.dataset.view;
  if (!VALID_VIEW_MODES.includes(view) || view === state.viewMode) {
    return;
  }
  state.viewMode = view;
  setStoredValue(STORAGE_KEYS.viewMode, view);
  applyViewModeUI();
  if (view === "calendar") {
    renderCalendar();
  }
}

function applyViewModeUI() {
  if (elements.viewToggle) {
    elements.viewToggle.querySelectorAll("[data-view]").forEach((btn) => {
      const isActive = btn.dataset.view === state.viewMode;
      btn.classList.toggle("is-active", isActive);
      if (isActive) {
        btn.setAttribute("aria-selected", "true");
      } else {
        btn.removeAttribute("aria-selected");
      }
    });
  }
  if (elements.listView) {
    elements.listView.hidden = state.viewMode !== "list";
  }
  if (elements.calendarView) {
    elements.calendarView.hidden = state.viewMode !== "calendar";
  }
}

function shiftCalendarMonth(delta) {
  if (!state.calendarMonth) return;
  let { year, month } = state.calendarMonth;
  month += delta;
  while (month < 0) { month += 12; year -= 1; }
  while (month > 11) { month -= 12; year += 1; }
  state.calendarMonth = { year, month };
  renderCalendar();
}

function renderCalendar() {
  if (!elements.calendarGrid || !state.calendarMonth) return;

  const { year, month } = state.calendarMonth;
  elements.calendarTitle.textContent = `${year}年 ${month + 1}月`;

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;

  const entriesByDate = new Map();
  state.entries.forEach((entry) => {
    if (!entriesByDate.has(entry.date)) {
      entriesByDate.set(entry.date, entry);
    }
  });

  const todayKey = new Date().toISOString().slice(0, 10);

  elements.calendarGrid.innerHTML = "";
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - startDay;
    const date = new Date(year, month, 1 + dayOffset);
    const dateKey = formatDateKey(date);
    const isOutside = date.getMonth() !== month;
    const entry = entriesByDate.get(dateKey);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "calendar__cell";
    cell.dataset.date = dateKey;
    if (entry) cell.dataset.entryId = entry.id;
    if (isOutside) cell.classList.add("calendar__cell--outside");
    if (dateKey === todayKey) cell.classList.add("calendar__cell--today");
    if (entry) cell.classList.add("calendar__cell--has-entry");

    cell.innerHTML = `
      <span class="calendar__day-number">${date.getDate()}</span>
      ${entry ? `<span class="calendar__weight">${formatNumber(entry.weight, 2)}kg</span>` : ""}
    `;
    elements.calendarGrid.appendChild(cell);
  }
}

function handleCalendarClick(event) {
  const cell = event.target.closest(".calendar__cell");
  if (!cell) return;
  const entryId = cell.dataset.entryId;
  if (entryId) {
    startEditing(entryId);
    return;
  }
  // No entry — open form prefilled with that date
  const date = cell.dataset.date;
  if (!date) return;
  resetForm();
  elements.date.value = date;
  openFormSheet();
  elements.weight?.focus();
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* -------- Mobile bottom sheet (#13) -------- */

function isMobileViewport() {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function openFormSheet() {
  if (!elements.formCard) return;
  elements.formCard.classList.add("is-open");
  if (elements.formBackdrop) {
    elements.formBackdrop.hidden = false;
    requestAnimationFrame(() => {
      elements.formBackdrop.classList.add("is-open");
    });
  }
  if (isMobileViewport()) {
    document.body.classList.add("is-sheet-open");
  }
}

function closeFormSheet() {
  if (!elements.formCard) return;
  elements.formCard.classList.remove("is-open");
  if (elements.formBackdrop) {
    elements.formBackdrop.classList.remove("is-open");
    setTimeout(() => {
      if (!elements.formBackdrop.classList.contains("is-open")) {
        elements.formBackdrop.hidden = true;
      }
    }, 220);
  }
  document.body.classList.remove("is-sheet-open");
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") return;
  if (state.editingEntryId) {
    resetForm();
    showToast("編集をキャンセルしました。");
    closeFormSheet();
    return;
  }
  if (elements.formCard?.classList.contains("is-open")) {
    closeFormSheet();
  }
}

async function getAccessibleDriveFile(fileId) {
  if (!fileId) {
    return null;
  }

  try {
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,parents,appProperties`
    );
    return response.json();
  } catch {
    return null;
  }
}

async function searchDriveFile(query) {
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,parents,appProperties)&pageSize=10`
  );
  const data = await response.json();
  return data.files?.[0] || null;
}

function buildManagedQuery({ kind, parentId = null, mimeType = null }) {
  const queryParts = [
    "trashed = false",
    `appProperties has { key='${DRIVE_APP_PROPERTY_KEY}' and value='${escapeDriveQuery(kind)}' }`
  ];

  if (mimeType) {
    queryParts.push(`mimeType = '${escapeDriveQuery(mimeType)}'`);
  }

  if (parentId) {
    queryParts.push(`'${parentId}' in parents`);
  }

  return queryParts.join(" and ");
}

async function tagManagedResource(fileId, kind) {
  try {
    await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        appProperties: {
          [DRIVE_APP_PROPERTY_KEY]: kind
        }
      })
    });
    return true;
  } catch (error) {
    console.warn("Unable to tag Drive resource for Catlog:", error);
    return false;
  }
}

function matchesParent(file, parentId) {
  if (!parentId) {
    return true;
  }
  return Array.isArray(file.parents) && file.parents.includes(parentId);
}

function renderEntries() {
  elements.entriesList.innerHTML = "";
  const visible = getFilteredEntries();
  elements.entriesEmpty.hidden = visible.length > 0;
  if (visible.length === 0 && state.entries.length > 0) {
    elements.entriesEmpty.textContent = "選択した期間内の記録はありません。";
  } else {
    elements.entriesEmpty.textContent = "まだ記録がありません。最初の 1 件を追加してみましょう。";
  }

  visible.forEach((entry) => {
    const article = document.createElement("article");
    article.className = "entry-card";
    article.dataset.entryId = entry.id;
    article.tabIndex = 0;
    article.setAttribute("role", "button");
    article.setAttribute("aria-label", `${formatDate(entry.date)} の記録を編集`);
    const hasPhoto = Boolean(entry.photo?.fileId);
    article.innerHTML = `
      <div>
        <p class="entry-meta">${formatDate(entry.date)} / 猫 ${formatNumber(entry.weight, 2)} kg / 飼い主 ${formatOptional(entry.ownerWeight, "kg", 1)}</p>
        <h3>${escapeHtml(formatHealthHeadline(entry.health))}</h3>
        <div class="entry-stats">
          <div class="stat-tile">
            <span>うんち回数</span>
            <strong>${formatCount(entry.poopCount)}</strong>
          </div>
        </div>
        <p><strong>健康状態:</strong> ${escapeHtml(entry.health)}</p>
        <div>
          <strong>食べ物:</strong>
          <ul class="entry-food-list">
            ${entry.foods.map((food) => `<li>${escapeHtml(food.label)}</li>`).join("")}
          </ul>
        </div>
        <div class="entry-actions">
          <button class="button button--ghost" type="button" data-action="edit-entry" data-entry-id="${entry.id}">編集</button>
          <button class="button button--danger" type="button" data-action="delete-entry" data-entry-id="${entry.id}">削除</button>
        </div>
      </div>
      <div>
        ${hasPhoto
          ? `<img class="entry-photo" data-photo-id="${escapeHtml(entry.photo.fileId)}" alt="猫の記録写真">`
          : '<div class="empty-state">写真なし</div>'}
      </div>
    `;
    elements.entriesList.appendChild(article);

    if (hasPhoto) {
      const img = article.querySelector(".entry-photo");
      if (img) {
        loadPhotoInto(img, entry.photo.fileId);
      }
    }
  });
}

async function loadPhotoInto(imgElement, fileId) {
  try {
    const url = await getPhotoBlobUrl(fileId);
    if (imgElement.isConnected) {
      imgElement.src = url;
    }
  } catch (error) {
    console.warn("Failed to load photo:", error);
    if (imgElement.isConnected) {
      const placeholder = document.createElement("div");
      placeholder.className = "entry-photo--broken";
      placeholder.textContent = "写真を読み込めません";
      imgElement.replaceWith(placeholder);
    }
  }
}

async function getPhotoBlobUrl(fileId) {
  if (!fileId) {
    throw new Error("Missing fileId");
  }
  if (photoBlobCache.has(fileId)) {
    return photoBlobCache.get(fileId);
  }
  if (!state.accessToken) {
    throw new Error("No access token");
  }
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  );
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  photoBlobCache.set(fileId, url);
  return url;
}

function revokePhotoBlob(fileId) {
  if (!fileId) {
    return;
  }
  const url = photoBlobCache.get(fileId);
  if (url) {
    URL.revokeObjectURL(url);
    photoBlobCache.delete(fileId);
  }
}

function clearPhotoBlobCache() {
  for (const url of photoBlobCache.values()) {
    URL.revokeObjectURL(url);
  }
  photoBlobCache.clear();
}

function renderGraph() {
  const graphEntries = getFilteredEntries()
    .filter((entry) => Number.isFinite(entry.weight))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (graphEntries.length < 2) {
    elements.graphArea.hidden = true;
    elements.graphEmpty.hidden = false;
    elements.weightGraph.innerHTML = "";
    return;
  }

  const catValues = graphEntries.map((entry) => entry.weight);
  const ownerValues = graphEntries.map((entry) => entry.ownerWeight).filter((value) => Number.isFinite(value));
  const catMin = Math.min(...catValues);
  const catMax = Math.max(...catValues);
  const ownerMin = ownerValues.length ? Math.min(...ownerValues) : null;
  const ownerMax = ownerValues.length ? Math.max(...ownerValues) : null;
  const width = 720;
  const height = 260;
  const left = 56;
  const right = 56;
  const top = 20;
  const bottom = 44;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const catRange = Math.max(catMax - catMin, 0.5);
  const ownerRange = Math.max((ownerMax ?? 0) - (ownerMin ?? 0), 0.5);
  const yForCat = (value) => top + ((catMax - value) / catRange) * plotHeight;
  const yForOwner = (value) => top + (((ownerMax ?? value) - value) / ownerRange) * plotHeight;
  const xFor = (index) => left + (graphEntries.length === 1 ? 0 : (index / (graphEntries.length - 1)) * plotWidth);

  const catPoints = graphEntries.map((entry, index) => `${xFor(index)},${yForCat(entry.weight)}`).join(" ");
  const ownerPoints = graphEntries
    .map((entry, index) => (Number.isFinite(entry.ownerWeight) ? `${xFor(index)},${yForOwner(entry.ownerWeight)}` : null))
    .filter(Boolean)
    .join(" ");

  const gridLines = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const y = top + plotHeight * ratio;
    const catValue = catMax - catRange * ratio;
    const ownerValue = ownerValues.length ? (ownerMax - ownerRange * ratio) : null;
    return `
      <line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="rgba(112,89,70,0.15)" stroke-width="1" />
      <text x="${left - 10}" y="${y + 4}" text-anchor="end" fill="#b85c38" font-size="12">${catValue.toFixed(1)}</text>
      ${ownerValue !== null ? `<text x="${width - right + 10}" y="${y + 4}" text-anchor="start" fill="#2f6f83" font-size="12">${ownerValue.toFixed(1)}</text>` : ""}
    `;
  }).join("");

  const xLabels = graphEntries.map((entry, index) => {
    const x = xFor(index);
    return `<text x="${x}" y="${height - 16}" text-anchor="middle" fill="#705946" font-size="11">${formatGraphDate(entry.date)}</text>`;
  }).join("");

  const catDots = graphEntries.map((entry, index) => {
    const x = xFor(index);
    const y = yForCat(entry.weight);
    return `<circle cx="${x}" cy="${y}" r="4.5" fill="#b85c38" />`;
  }).join("");

  const ownerDots = graphEntries.map((entry, index) => {
    if (!Number.isFinite(entry.ownerWeight)) {
      return "";
    }
    const x = xFor(index);
    const y = yForOwner(entry.ownerWeight);
    return `<circle cx="${x}" cy="${y}" r="4.5" fill="#2f6f83" />`;
  }).join("");

  elements.weightGraph.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="transparent" />
    ${gridLines}
    <polyline fill="none" stroke="#b85c38" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="${catPoints}" />
    ${ownerPoints ? `<polyline fill="none" stroke="#2f6f83" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" points="${ownerPoints}" />` : ""}
    ${catDots}
    ${ownerDots}
    ${xLabels}
  `;

  elements.graphArea.hidden = false;
  elements.graphEmpty.hidden = true;
}

function normalizeEntry(entry) {
  const foods = normalizeFoods(entry);
  return {
    id: entry.id || crypto.randomUUID(),
    date: entry.date || new Date().toISOString().slice(0, 10),
    weight: Number(entry.weight || 0),
    ownerWeight: parseOptionalNumber(entry.ownerWeight),
    foods,
    health: String(entry.health || "").trim(),
    poopCount: parseOptionalInteger(entry.poopCount),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: entry.updatedAt || entry.createdAt || new Date().toISOString(),
    photo: entry.photo || null
  };
}

function normalizeFoods(entry) {
  if (Array.isArray(entry.foods)) {
    return entry.foods.map((item) => ({
      id: item.id || crypto.randomUUID(),
      label: String(item.label || "").trim(),
      time: item.time || "--:--"
    })).filter((item) => item.label);
  }

  if (typeof entry.food === "string" && entry.food.trim()) {
    return [{
      id: crypto.randomUUID(),
      label: entry.food.trim(),
      time: "--:--"
    }];
  }

  return [];
}

function updateAuthUI(isConnected) {
  elements.authStatus.textContent = isConnected ? "接続済み" : "未接続";
  elements.reloadButton.disabled = !isConnected;
  elements.connectButton.textContent = isConnected ? "Google Drive を開く" : "Google Drive に接続";
}

function restoreSavedSession() {
  const storedToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  const storedExpiry = Number(localStorage.getItem(STORAGE_KEYS.tokenExpiry) || 0);

  if (!storedToken || !storedExpiry) {
    return;
  }

  if (storedExpiry <= Date.now()) {
    clearSavedSession();
    return;
  }

  state.accessToken = storedToken;
  updateAuthUI(true);
  setSyncMessage("前回の接続情報を復元しました。");

  if (navigator.onLine) {
    ensureDriveStructure()
      .then(loadEntriesFromDrive)
      .catch((error) => {
        console.warn("Failed to restore Drive session:", error);
        clearSavedSession();
        updateAuthUI(false);
        setSyncMessage("Google Drive に再接続してください。");
      });
  }
}

function restoreDriveState() {
  state.drive.rootFolderId = localStorage.getItem(STORAGE_KEYS.rootFolderId) || null;
  state.drive.photosFolderId = localStorage.getItem(STORAGE_KEYS.photosFolderId) || null;
  state.drive.entriesFileId = localStorage.getItem(STORAGE_KEYS.entriesFileId) || null;
}

function persistDriveState() {
  setStoredValue(STORAGE_KEYS.rootFolderId, state.drive.rootFolderId);
  setStoredValue(STORAGE_KEYS.photosFolderId, state.drive.photosFolderId);
  setStoredValue(STORAGE_KEYS.entriesFileId, state.drive.entriesFileId);
}

function restoreUserPreferences() {
  const period = localStorage.getItem(STORAGE_KEYS.periodFilter);
  if (VALID_PERIODS.includes(period)) {
    state.periodFilter = period;
  }
  const view = localStorage.getItem(STORAGE_KEYS.viewMode);
  if (VALID_VIEW_MODES.includes(view)) {
    state.viewMode = view;
  }
  applyPeriodFilterUI();
  applyViewModeUI();

  const today = new Date();
  state.calendarMonth = { year: today.getFullYear(), month: today.getMonth() };
}

function clearDriveState() {
  state.drive.rootFolderId = null;
  state.drive.photosFolderId = null;
  state.drive.entriesFileId = null;
  localStorage.removeItem(STORAGE_KEYS.rootFolderId);
  localStorage.removeItem(STORAGE_KEYS.photosFolderId);
  localStorage.removeItem(STORAGE_KEYS.entriesFileId);
}

function setStoredValue(key, value) {
  if (value) {
    localStorage.setItem(key, value);
    return;
  }
  localStorage.removeItem(key);
}

function persistToken(response) {
  if (!response?.access_token || !response?.expires_in) {
    return;
  }

  const expiresAt = Date.now() + (Number(response.expires_in) - 60) * 1000;
  localStorage.setItem(STORAGE_KEYS.accessToken, response.access_token);
  localStorage.setItem(STORAGE_KEYS.tokenExpiry, String(expiresAt));
  localStorage.setItem(STORAGE_KEYS.hasAuthorized, "true");
}

function clearSavedSession() {
  state.accessToken = null;
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.tokenExpiry);
  clearDriveState();
}

function hasUsableAccessToken() {
  const expiry = Number(localStorage.getItem(STORAGE_KEYS.tokenExpiry) || 0);
  return Boolean(state.accessToken) && expiry > Date.now();
}

function requestAccessToken(overrides) {
  return new Promise((resolve, reject) => {
    state.tokenClient.callback = async (response) => {
      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      try {
        state.accessToken = response.access_token;
        persistToken(response);
        updateAuthUI(true);
        await ensureDriveStructure();
        await loadEntriesFromDrive();
        resolve(response);
      } catch (error) {
        reject(error);
      }
    };

    state.tokenClient.requestAccessToken(overrides);
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js?v=13", { updateViaCache: "none" });
  } catch (error) {
    console.error("Service worker registration failed:", error);
  }
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  state.installPrompt = event;
  refreshInstallUI();
}

function handleAppInstalled() {
  state.installPrompt = null;
  refreshInstallUI();
  showToast("猫log をホーム画面に追加しました。");
}

async function installApp() {
  if (!state.installPrompt) {
    showToast("ブラウザの共有メニューからホーム画面に追加できる場合があります。");
    return;
  }

  state.installPrompt.prompt();
  await state.installPrompt.userChoice;
  state.installPrompt = null;
  refreshInstallUI();
}

function refreshInstallUI() {
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  elements.installCard.hidden = isStandalone || !state.installPrompt;
}

function handleConnectivityChange() {
  document.body.classList.toggle("is-offline", !navigator.onLine);
  if (!navigator.onLine) {
    setSyncMessage("オフライン中です。閲覧はできますが、Google Drive との同期はネット接続後に行ってください。");
  }
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

function formatGraphDate(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatHealthHeadline(health) {
  return health.length > 22 ? `${health.slice(0, 22)}...` : health;
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

function formatOptional(value, unit, digits) {
  return Number.isFinite(value) ? `${Number(value).toFixed(digits)} ${unit}` : "--";
}

function formatCount(value) {
  return Number.isFinite(value) ? `${value}回` : "--";
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function currentTimeLabel30Min() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes() < 30 ? 0 : 30;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function roundTimeTo30Min(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const rounded = minutes < 15 ? 0 : minutes < 45 ? 30 : 0;
  const carryHour = minutes >= 45 ? (hours + 1) % 24 : hours;
  return `${String(carryHour).padStart(2, "0")}:${String(rounded).padStart(2, "0")}`;
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
