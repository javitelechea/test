/* ═══════════════════════════════════════════
   SimpleReplay — Main Application
   Event wiring, keyboard shortcuts, init
   ═══════════════════════════════════════════ */

(function () {
    'use strict';

    const $ = UI.$;

    // Extract YouTube video ID from any input (full URL or raw ID)
    function extractYouTubeId(input) {
        if (!input) return '';
        input = input.trim();
        // Full URL patterns
        const patterns = [
            /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
            /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
            /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
            /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        ];
        for (const pat of patterns) {
            const match = input.match(pat);
            if (match) return match[1];
        }
        // If it looks like a raw ID (11 chars, alphanumeric + _ -)
        if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
        // Return as-is as fallback
        return input;
    }

    // ═══════════════════════════════════════
    // STATE → UI BINDINGS
    // ═══════════════════════════════════════

    let hasUnsavedChanges = false;

    // Reset unsaved changes on load/save
    AppState.on('projectLoaded', () => hasUnsavedChanges = false);
    AppState.on('projectSaved', () => hasUnsavedChanges = false);

    // Mark as unsaved when anything editable changes
    const markUnsaved = () => hasUnsavedChanges = true;
    AppState.on('clipChanged', markUnsaved);
    AppState.on('clipsUpdated', markUnsaved);
    AppState.on('playlistsUpdated', markUnsaved);
    AppState.on('flagsUpdated', markUnsaved);
    AppState.on('clipCommentsUpdated', markUnsaved);
    AppState.on('tagTypesUpdated', markUnsaved);

    AppState.on('commentAdded', async () => {
        markUnsaved();
        if (AppState.get('currentProjectId')) {
            try {
                await AppState.saveToCloud();
            } catch (e) { console.error('Error auto-saving comment', e); }
        }
    });

    // Auto-save flags silently (for viewers)
    AppState.on('flagsUpdated', async () => {
        markUnsaved();
        if (AppState.get('currentProjectId')) {
            try {
                await AppState.saveToCloud();
            } catch (e) { console.error('Error auto-saving flags', e); }
        }
    });

    // Auto-save playlists silently (for viewers)
    AppState.on('playlistsUpdated', async () => {
        markUnsaved();
        if (AppState.get('currentProjectId')) {
            try {
                await AppState.saveToCloud();
            } catch (e) { console.error('Error auto-saving playlists', e); }
        }
    });

    // Auto-save activity log
    AppState.on('activityLogUpdated', async () => {
        if (AppState.get('currentProjectId')) {
            try {
                await AppState.saveToCloud();
            } catch (e) { console.error('Error auto-saving activity', e); }
        }
    });

    // Re-render notifications after save (picks up new currentProjectId)
    AppState.on('projectSaved', () => {
        UI.renderNotifications();
    });

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    AppState.on('modeChanged', () => {
        UI.updateMode();
    });

    AppState.on('gameChanged', (game) => {
        UI.updateNoGameOverlay();
        UI.updateProjectTitle();
        UI.renderAnalyzeClips();
        UI.renderAnalyzePlaylists();
        UI.renderViewClips();
        UI.renderViewSources();
        UI.updateClipEditControls();
        if (game) {
            VideoPlayer.loadVideo(game.youtube_video_id);
        }
    });

    AppState.on('clipChanged', (clip) => {
        UI.renderAnalyzeClips();
        UI.renderViewClips();
        UI.updateClipEditControls();
        UI.updateFlagButtons();
        UI.updateFocusView();
    });

    AppState.on('clipsUpdated', () => {
        UI.renderAnalyzeClips();
        UI.renderViewClips();
    });

    AppState.on('playlistsUpdated', () => {
        UI.renderAnalyzePlaylists();
        UI.renderViewSources();
    });

    AppState.on('flagsUpdated', () => {
        UI.renderAnalyzeClips();
        UI.renderViewClips();
        UI.updateFlagButtons();
        UI.updateFocusView();
    });

    AppState.on('viewFiltersChanged', () => {
        UI.renderViewSources();
        UI.updateFlagFilterBar();
        UI.renderViewClips();
        // Show/hide reset button
        const hasFilters = AppState.get('activeTagFilters').length > 0 ||
            AppState.get('activePlaylistId') ||
            AppState.get('filterFlags').length > 0;

        const urlParams = new URLSearchParams(window.location.search);
        const isReadOnly = urlParams.get('mode') === 'view';
        const sharedPlaylistId = urlParams.get('playlist');

        // If the ONLY filter applied is the locked playlist, hide the reset button
        const isOnlyLockedPlaylist = isReadOnly && sharedPlaylistId &&
            AppState.get('activePlaylistId') === sharedPlaylistId &&
            AppState.get('activeTagFilters').length === 0 &&
            AppState.get('filterFlags').length === 0;

        const resetBtn = UI.$('#btn-reset-all-filters');
        if (resetBtn) resetBtn.style.display = (hasFilters && !isOnlyLockedPlaylist) ? 'inline-flex' : 'none';
    });

    AppState.on('panelToggled', () => {
        UI.updatePanelState();
    });

    AppState.on('focusViewToggled', () => {
        UI.updateFocusView();
        UI.updatePanelState();
    });

    AppState.on('tagTypesUpdated', () => {
        UI.renderTagButtons();
        UI.renderViewSources();
    });

    AppState.on('clipCommentsUpdated', () => {
        UI.renderNotifications();
    });

    // ═══════════════════════════════════════
    // DOM EVENT LISTENERS
    // ═══════════════════════════════════════

    // Mode toggle
    $('#btn-mode-analyze').addEventListener('click', () => AppState.setMode('analyze'));
    $('#btn-mode-view').addEventListener('click', () => AppState.setMode('view'));

    // Novedades dropdown toggle
    const btnNovedades = $('#btn-novedades');
    const novedadesDropdown = $('#novedades-dropdown');
    if (btnNovedades && novedadesDropdown) {
        btnNovedades.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = novedadesDropdown.style.display === 'block';
            if (isOpen) {
                novedadesDropdown.style.display = 'none';
            } else {
                // Mark as seen — persist timestamp in localStorage
                const pid = AppState.get('currentProjectId');
                if (pid) {
                    localStorage.setItem('novedades_seen_' + pid, new Date().toISOString());
                }
                // Hide badge
                const badge = document.getElementById('novedades-badge');
                if (badge) badge.style.display = 'none';
                // Just render from current state — no reload (avoids video reset)
                UI.renderNotifications();
                // Keep badge hidden since user is looking
                if (badge) badge.style.display = 'none';
                novedadesDropdown.style.display = 'block';
            }
        });
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!novedadesDropdown.contains(e.target) && !btnNovedades.contains(e.target)) {
                novedadesDropdown.style.display = 'none';
            }
        });
    }

    // New project modal
    $('#btn-new-game').addEventListener('click', () => {
        $('#modal-new-game').classList.remove('hidden');
        $('#input-game-title').focus();
        // Force reset toggle visibility
        document.querySelector('input[name="video-type"][value="youtube"]').checked = true;
        $('#group-yt-id').classList.remove('hidden');
        $('#group-local-file').classList.add('hidden');
    });

    $('#btn-cancel-game').addEventListener('click', () => {
        UI.hideModal('modal-new-game');
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            backdrop.closest('.modal').classList.add('hidden');
        });
    });

    // Modal Video Type Toggle
    document.querySelectorAll('input[name="video-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isLocal = e.target.value === 'local';
            $('#group-yt-id').classList.toggle('hidden', isLocal);
            $('#group-local-file').classList.toggle('hidden', !isLocal);
        });
    });

    // Edit project modal
    let _editingProjectId = null;

    document.querySelectorAll('input[name="edit-video-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isLocal = e.target.value === 'local';
            $('#group-edit-yt').classList.toggle('hidden', isLocal);
            $('#group-edit-local').classList.toggle('hidden', !isLocal);
        });
    });

    $('#btn-cancel-edit-video').addEventListener('click', () => {
        UI.hideModal('modal-edit-video');
        _editingProjectId = null;
    });

    $('#btn-save-edit-video').addEventListener('click', async () => {
        if (!_editingProjectId) return;
        const title = $('#input-edit-title').value.trim();
        const videoType = document.querySelector('input[name="edit-video-type"]:checked').value;
        let source = '';

        if (!title) { UI.toast('Ingresá un título', 'error'); return; }

        if (videoType === 'youtube') {
            const rawYtInput = $('#input-edit-yt').value.trim();
            if (!rawYtInput) { UI.toast('Ingresá un link o ID de YouTube', 'error'); return; }
            source = extractYouTubeId(rawYtInput);
        } else {
            const fileInput = $('#input-edit-local');
            if (fileInput.files && fileInput.files.length > 0) {
                source = URL.createObjectURL(fileInput.files[0]);
            } else {
                // Keep old source if no new file selected and was already local?
                // Actually, if they switch to local they MUST select a file.
                // If they were already local, they might want to just change title.
                const game = AppState.get('games').find(g => g.id === _editingProjectId);
                if (game && game.videoType === 'local') {
                    source = game.youtube_video_id;
                } else {
                    UI.toast('Seleccioná un archivo de video', 'error');
                    return;
                }
            }
        }

        AppState.renameGame(_editingProjectId, title);
        AppState.updateGameVideo(_editingProjectId, source, videoType);

        UI.hideModal('modal-edit-video');
        UI.toast('Proyecto actualizado', 'success');

        // If current game was edited, refresh player
        if (AppState.get('currentGameId') === _editingProjectId) {
            VideoPlayer.loadVideo(source, videoType);
            UI.updateProjectTitle();
        }

        $('#btn-my-projects').click(); // Refresh projects list
        _editingProjectId = null;
    });

    $('#btn-save-game').addEventListener('click', async () => {
        const title = $('#input-game-title').value.trim();
        const videoType = document.querySelector('input[name="video-type"]:checked').value;
        let source = '';

        if (!title) { UI.toast('Ingresá un título', 'error'); return; }

        if (videoType === 'youtube') {
            const rawYtInput = $('#input-youtube-id').value.trim();
            if (!rawYtInput) { UI.toast('Ingresá un link o ID de YouTube', 'error'); return; }
            source = extractYouTubeId(rawYtInput);
            if (!source) { UI.toast('No se pudo extraer el Video ID', 'error'); return; }
        } else {
            const fileInput = $('#input-local-file');
            if (!fileInput.files || fileInput.files.length === 0) {
                UI.toast('Seleccioná un archivo de video', 'error');
                return;
            }
            const file = fileInput.files[0];
            source = URL.createObjectURL(file);
        }

        // Start a fresh project
        AppState.clearProject();
        DemoData.clear();

        const game = AppState.addGame(title, source);
        // Add a flag to distinguish source type (optional but helpful)
        game.videoType = videoType;

        AppState.setCurrentGame(game.id);
        UI.hideModal('modal-new-game');

        // Reset form
        $('#input-game-title').value = '';
        $('#input-youtube-id').value = '';
        $('#input-local-file').value = '';

        $('#btn-share-project').style.display = 'none';

        UI.toast(`Proyecto creado: ${title}`, 'success');
        UI.refreshAll();
    });

    // Panel collapse
    $('#btn-collapse-panel').addEventListener('click', () => AppState.togglePanel());
    $('#btn-expand-panel').addEventListener('click', () => AppState.togglePanel());

    // Clip edit buttons
    $('#clip-edit-controls').addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (!action) return;
        const clipId = AppState.get('currentClipId');
        if (!clipId) return;

        switch (action) {
            case 'in-minus': AppState.updateClipBounds(clipId, 'start_sec', -1); break;
            case 'in-plus': AppState.updateClipBounds(clipId, 'start_sec', 1); break;
            case 'out-minus': AppState.updateClipBounds(clipId, 'end_sec', -1); break;
            case 'out-plus': AppState.updateClipBounds(clipId, 'end_sec', 1); break;
            case 'delete-clip':
                AppState.deleteClip(clipId);
                UI.toast('Clip eliminado', 'success');
                break;
        }
    });

    // Source group toggles (collapsible Tags/Playlists in View mode)
    document.querySelectorAll('.source-group-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.dataset.toggle;
            const body = document.getElementById(targetId);
            if (!body) return;
            const isCollapsed = body.classList.contains('collapsed');
            body.classList.toggle('collapsed', !isCollapsed);
            toggle.classList.toggle('open', isCollapsed);
        });
    });

    // Create playlist
    $('#btn-create-playlist').addEventListener('click', () => {
        const nameInput = $('#new-playlist-name');
        const name = nameInput.value.trim();
        if (!name) { UI.toast('Ingresá un nombre', 'error'); return; }
        if (!AppState.get('currentGameId')) { UI.toast('Primero seleccioná un partido', 'error'); return; }
        const newPl = AppState.addPlaylist(name);
        AppState.addActivity('playlist_created', { playlistName: name, playlistId: newPl.id });
        nameInput.value = '';
        UI.toast(`Playlist creada: ${name}`, 'success');
    });

    // View mode playlist creation
    const btnViewCreatePl = $('#btn-view-create-playlist');
    if (btnViewCreatePl) {
        btnViewCreatePl.addEventListener('click', () => {
            const nameInput = $('#view-new-playlist-name');
            const name = nameInput.value.trim();
            if (!name) { UI.toast('Ingresá un nombre', 'error'); return; }
            if (!AppState.get('currentGameId')) { UI.toast('Primero seleccioná un partido', 'error'); return; }
            const newPl = AppState.addPlaylist(name);
            AppState.addActivity('playlist_created', { playlistName: name, playlistId: newPl.id });
            nameInput.value = '';
            UI.toast(`Playlist creada: ${name}`, 'success');
        });
    }

    // Add selected clips to playlist (View mode multi-select)
    $('#btn-add-selected-to-playlist').addEventListener('click', () => {
        const selected = UI.getSelectedClipIds();
        if (selected.length === 0) { UI.toast('Seleccioná al menos un clip', 'error'); return; }

        const playlists = AppState.get('playlists');
        if (playlists.length === 0) { UI.toast('Creá una playlist primero (o creala en el modal)', 'error'); }

        UI.showAddToPlaylistModal(selected);
    });

    // Create playlist from modal
    $('#btn-create-playlist-modal').addEventListener('click', () => {
        const nameInput = $('#new-playlist-name-modal');
        const name = nameInput.value.trim();
        if (!name) { UI.toast('Ingresá un nombre', 'error'); return; }
        if (!AppState.get('currentGameId')) { UI.toast('Primero seleccioná un partido', 'error'); return; }

        const newPl = AppState.addPlaylist(name);
        AppState.addActivity('playlist_created', { playlistName: name, playlistId: newPl.id });
        nameInput.value = '';
        UI.toast(`Playlist creada: ${name}`, 'success');
        if (UI.renderPlaylistModalList) {
            UI.renderPlaylistModalList();
        }
    });

    $('#new-playlist-name-modal').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('#btn-create-playlist-modal').click();
    });

    // Enter key on playlist name
    $('#new-playlist-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') $('#btn-create-playlist').click();
    });

    // ═══ PROJECTS LIST ═══
    $('#btn-my-projects').addEventListener('click', async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const isReadOnly = urlParams.get('mode') === 'view';
        if (isReadOnly) {
            UI.toast('El explorador de proyectos no está disponible en modo lectura', 'info');
            return;
        }

        UI.showModal('modal-projects');
        const listOwned = $('#project-list');
        const listShared = $('#shared-project-list');
        listOwned.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px;">Cargando...</p>';
        listShared.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px;">Cargando...</p>';

        const renderList = (container, arr) => {
            container.innerHTML = '';
            if (arr.length === 0) {
                container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:16px;">No hay proyectos</p>';
                return;
            }

            arr.forEach(p => {
                const el = document.createElement('div');
                el.className = 'project-item';
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.justifyContent = 'space-between';
                el.style.padding = '10px';
                el.style.borderBottom = '1px solid var(--border)';
                el.style.gap = '8px';

                const dateStr = p.updatedAt ? p.updatedAt.toLocaleDateString() : '';
                const info = document.createElement('div');
                info.className = 'project-info';
                info.style.flex = '1';
                info.style.cursor = 'pointer';
                info.innerHTML = `
                    <div class="project-title" style="font-weight:500;font-size:0.9rem;">${p.title}</div>
                    <div class="project-date" style="font-size:0.75rem;color:var(--text-muted);">${dateStr}</div>
                `;

                const actions = document.createElement('div');
                actions.className = 'project-actions';
                actions.style.display = 'flex';
                actions.style.gap = '4px';

                if (!p.isShared) {
                    // Rename btn
                    const renameBtn = document.createElement('button');
                    renameBtn.className = 'btn btn-xs btn-ghost';
                    renameBtn.innerHTML = '✏️';
                    renameBtn.title = 'Renombrar';
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const newTitle = prompt('Nuevo nombre:', p.title);
                        if (newTitle && newTitle.trim()) {
                            AppState.renameGame(p.id, newTitle.trim());
                            UI.toast('Proyecto renombrado', 'success');
                            $('#btn-my-projects').click(); // Refresh list
                        }
                    });
                    actions.appendChild(renameBtn);

                    // Duplicate btn
                    const duplicateBtn = document.createElement('button');
                    duplicateBtn.className = 'btn btn-xs btn-ghost';
                    duplicateBtn.innerHTML = '👯';
                    duplicateBtn.title = 'Duplicar';
                    duplicateBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        AppState.duplicateGame(p.id);
                        UI.toast('Proyecto duplicado', 'success');
                        $('#btn-my-projects').click(); // Refresh list
                    });
                    actions.appendChild(duplicateBtn);

                    // Edit Video btn
                    const editVideoBtn = document.createElement('button');
                    editVideoBtn.className = 'btn btn-xs btn-ghost';
                    editVideoBtn.innerHTML = '🎞️';
                    editVideoBtn.title = 'Cambiar Video';
                    editVideoBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        _editingProjectId = p.id;
                        $('#modal-edit-video').classList.remove('hidden');
                        $('#input-edit-title').value = p.title;
                        const isYT = !p.youtube_video_id.startsWith('blob:');
                        if (isYT) {
                            $('#edit-video-yt').checked = true;
                            $('#input-edit-yt').value = p.youtube_video_id;
                        } else {
                            $('#edit-video-local').checked = true;
                        }
                        // Trigger toggle visibility
                        $('#edit-video-yt').dispatchEvent(new Event('change'));
                    });
                    actions.appendChild(editVideoBtn);
                }

                // Share btn
                const shareBtn = document.createElement('button');
                shareBtn.className = 'btn btn-xs btn-share project-share-btn';
                shareBtn.innerHTML = '🔗';
                shareBtn.title = 'Compartir link';
                shareBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _pendingShareUrlBase = FirebaseData.getShareUrl(p.id);
                    UI.showModal('modal-share-options');
                });
                actions.appendChild(shareBtn);

                // Load btn
                const loadBtn = document.createElement('button');
                loadBtn.className = 'btn btn-xs btn-primary project-load-btn';
                loadBtn.textContent = 'Abrir';
                loadBtn.addEventListener('click', async () => {
                    UI.hideModal('modal-projects');

                    if (p.isShared) {
                        // For shared projects, redirect completely to enforce read-only URL state
                        window.location.href = FirebaseData.getShareUrl(p.id) + '&mode=view';
                        return;
                    }

                    UI.toast('Cargando proyecto...', '');
                    const loaded = await AppState.loadFromCloud(p.id);
                    if (loaded) {
                        FirebaseData.addProjectLocally(p.id, false);
                        UI.toast('Proyecto cargado ✅', 'success');
                        UI.refreshAll();
                        const game = AppState.getCurrentGame();
                        if (game && game.youtube_video_id) {
                            VideoPlayer.loadVideo(game.youtube_video_id);
                        }
                        const url = FirebaseData.getShareUrl(p.id);
                        window.history.replaceState({}, '', url);
                    } else {
                        UI.toast('Error al cargar', 'error');
                    }
                });

                // Delete btn
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-xs btn-danger project-delete-btn';
                delBtn.textContent = '🗑️';
                delBtn.title = p.isShared ? 'Remover de la lista' : 'Eliminar localmente';
                delBtn.addEventListener('click', () => {
                    if (confirm(`¿Quitar "${p.title}" de tu lista local?`)) {
                        FirebaseData.removeProjectLocally(p.id);
                        el.remove();
                    }
                });

                actions.appendChild(shareBtn);
                actions.appendChild(loadBtn);
                actions.appendChild(delBtn);

                el.appendChild(info);
                el.appendChild(actions);
                container.appendChild(el);
            });
        };

        try {
            const projects = await FirebaseData.listProjects();
            const ownedProjects = projects.filter(p => !p.isShared);
            const sharedProjects = projects.filter(p => p.isShared);
            renderList(listOwned, ownedProjects);
            renderList(listShared, sharedProjects);
        } catch (err) {
            listOwned.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px;">Error al conectar.</p>';
            listShared.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:16px;">Error al conectar.</p>';
        }
    });

    $('#btn-close-projects').addEventListener('click', () => {
        UI.hideModal('modal-projects');
    });

    // Focus view toggle
    $('#btn-focus-view').addEventListener('click', () => {
        AppState.toggleFocusView();
    });

    // Nav arrows
    $('#btn-prev-clip').addEventListener('click', () => {
        AppState.navigateClip('prev');
        const clip = AppState.getCurrentClip();
        if (clip) VideoPlayer.playClip(clip.start_sec, clip.end_sec);
    });

    $('#btn-next-clip').addEventListener('click', () => {
        AppState.navigateClip('next');
        const clip = AppState.getCurrentClip();
        if (clip) VideoPlayer.playClip(clip.start_sec, clip.end_sec);
    });

    // ═══════════════════════════════════════
    // KEYBOARD SHORTCUTS
    // ═══════════════════════════════════════

    document.addEventListener('keydown', (e) => {
        // Don't handle shortcuts when typing in inputs
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        // Spacebar: exclusively toggle play/pause to avoid accidental button clicks
        if (e.key === ' ') {
            e.preventDefault();
            const playerState = VideoPlayer.getPlayerState();
            if (playerState === 1) { // playing
                VideoPlayer.pause();
            } else {
                VideoPlayer.play();
            }
            return;
        }

        const mode = AppState.get('mode');

        // Arrow keys: seek video (Analyze mode)
        if (mode === 'analyze') {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const t = VideoPlayer.getCurrentTime();
                VideoPlayer.seekTo(Math.max(0, t - 5));
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const t = VideoPlayer.getCurrentTime();
                VideoPlayer.seekTo(t + 5);
                return;
            }

            // Check for tag hotkeys
            const activeKey = e.key.toLowerCase();
            const tagBtn = document.querySelector(`.tag-btn[data-hotkey="${activeKey}"]`);
            if (tagBtn) {
                e.preventDefault();
                tagBtn.click();
                return;
            }
        }

        // Arrow keys: navigate clips (View mode)
        if (mode === 'view') {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                AppState.navigateClip('prev');
                const clip = AppState.getCurrentClip();
                if (clip) VideoPlayer.playClip(clip.start_sec, clip.end_sec);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                AppState.navigateClip('next');
                const clip = AppState.getCurrentClip();
                if (clip) VideoPlayer.playClip(clip.start_sec, clip.end_sec);
                return;
            }

            // Number keys 1-4: toggle flags
            const clip = AppState.getCurrentClip();
            if (clip) {
                const flagMap = { '1': 'bueno', '2': 'acorregir', '3': 'duda', '4': 'importante' };
                if (flagMap[e.key]) {
                    e.preventDefault();
                    const flag = flagMap[e.key];
                    AppState.toggleFlag(clip.id, flag);
                    const flags = AppState.getClipUserFlags(clip.id);
                    const emoji = UI.FLAG_EMOJI[flag];
                    const has = flags.includes(flag);
                    UI.toast(`${emoji} ${has ? 'agregado' : 'quitado'}`, has ? 'success' : '');
                    return;
                }
            }
        }

        // Escape: close modals or exit focus
        if (e.key === 'Escape') {
            // Close any open modal
            document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
            // Exit focus view
            if (AppState.get('focusView')) {
                AppState.toggleFocusView();
            }
        }

        // F key: toggle focus view (View mode)
        if (e.key === 'f' && mode === 'view') {
            e.preventDefault();
            AppState.toggleFocusView();
        }

        // Space: play/pause handled by YouTube player naturally
    });

    // ═══ FLAG FILTER BAR ═══
    document.querySelectorAll('#flag-filter-bar .flag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.toggleFilterFlag(btn.dataset.flag);
        });
    });

    // Clear flag filter
    const btnClearFlagFilter = $('#btn-clear-flag-filter');
    if (btnClearFlagFilter) {
        btnClearFlagFilter.addEventListener('click', () => {
            AppState.clearFilterFlags();
        });
    }

    // Reset all filters
    const btnResetAll = $('#btn-reset-all-filters');
    if (btnResetAll) {
        btnResetAll.addEventListener('click', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const isReadOnly = urlParams.get('mode') === 'view';
            const sharedPlaylistId = urlParams.get('playlist');
            const isLockedPlaylist = isReadOnly && sharedPlaylistId && AppState.get('activePlaylistId') === sharedPlaylistId;

            if (isLockedPlaylist) {
                AppState.clearTagFilters();
                AppState.clearFilterFlags();
                UI.toast('Se limpiaron los tags. La playlist compartida se mantiene.', 'info');
            } else {
                AppState.clearAllFilters();
            }
        });
    }

    // ═══ TAG EDITOR ═══
    $('#btn-toggle-tag-editor').addEventListener('click', () => {
        UI.toggleTagEditor();
    });

    $('#btn-save-tag').addEventListener('click', () => {
        UI.saveTagFromEditor();
    });

    $('#btn-delete-tag').addEventListener('click', () => {
        UI.deleteTagFromEditor();
    });

    $('#btn-cancel-tag-edit').addEventListener('click', () => {
        UI.closeTagInlineEditor();
    });

    // Cancel add-to-playlist modal
    $('#btn-cancel-add-playlist').addEventListener('click', () => {
        UI.hideModal('modal-add-to-playlist');
    });



    // ═══════════════════════════════════════
    // XML IMPORT / EXPORT
    // ═══════════════════════════════════════

    const btnExportXml = $('#btn-export-xml');
    if (btnExportXml) {
        btnExportXml.addEventListener('click', () => {
            const xml = AppState.exportXML();
            if (!xml) {
                UI.toast('No hay datos para exportar o no seleccionaste un partido', 'error');
                return;
            }

            const game = AppState.getCurrentGame();
            const title = game && game.title ? game.title : 'proyecto';
            const filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.xml`;

            // Maximum compatibility download logic
            const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;

            // Append to body, click, and remove
            document.body.appendChild(link);
            link.click();

            // Small delay before cleanup to ensure download triggers on all browsers
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
        });
    }

    const btnImportXml = $('#btn-import-xml');
    const inputImportXml = $('#input-import-xml');
    if (btnImportXml && inputImportXml) {
        btnImportXml.addEventListener('click', () => {
            // Must have a game selected to import clips into it
            if (!AppState.get('currentGameId')) {
                UI.toast('Primero creá o seleccioná un partido vacío adonde importar', 'error');
                return;
            }
            inputImportXml.click();
        });

        inputImportXml.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const xmlString = ev.target.result;
                const res = AppState.importXML(xmlString);
                if (res !== false) {
                    UI.toast(`¡Importado! ${res} clips agregados`, 'success');
                } else {
                    UI.toast('Error al leer el XML', 'error');
                }
            };
            reader.readAsText(file);
            inputImportXml.value = ''; // reset so we can upload same file again
        });
    }

    // ═══════════════════════════════════════
    // SAVE / SHARE
    // ═══════════════════════════════════════

    $('#btn-save-project').addEventListener('click', async () => {
        const btn = $('#btn-save-project');

        // Before saving the first time, if we have custom games + the demo game, let's remove the demo game
        const hasCustomGames = AppState.get('games').some(g => g.id !== 'game-demo-1');
        if (hasCustomGames) {
            const demoIdx = AppState.get('games').findIndex(g => g.id === 'game-demo-1');
            if (demoIdx >= 0) {
                // If demo game exists, we remove it from the state
                AppState.get('games').splice(demoIdx, 1);
            }
        }

        btn.disabled = true;
        btn.textContent = '⏳';
        try {
            const projectId = await AppState.saveToCloud();
            FirebaseData.addProjectLocally(projectId);
            UI.toast('Proyecto guardado ✅', 'success');
            // Show share button
            $('#btn-share-project').style.display = 'inline-flex';
        } catch (err) {
            console.error('Save error:', err);
            UI.toast('Error al guardar: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '💾';
        }
    });

    // Share Project Modal logic
    let _pendingShareUrlBase = '';

    $('#btn-share-project').addEventListener('click', () => {
        const projectId = AppState.get('currentProjectId');
        const gameId = AppState.get('currentGameId');
        if (!projectId) {
            UI.toast('Primero guardá el proyecto', 'error');
            return;
        }

        _pendingShareUrlBase = FirebaseData.getShareUrl(projectId, gameId);

        // Populate playlists dropdown
        const playlists = AppState.get('playlists');
        const sel = $('#share-playlist-select');
        const btnSharePl = $('#btn-share-playlist-modal');
        if (sel && btnSharePl) {
            sel.innerHTML = '';
            if (playlists.length === 0) {
                sel.innerHTML = '<option value="">(No hay playlists)</option>';
                sel.disabled = true;
                btnSharePl.disabled = true;
            } else {
                playlists.forEach(pl => {
                    const opt = document.createElement('option');
                    opt.value = pl.id;
                    opt.textContent = pl.name;
                    sel.appendChild(opt);
                });
                sel.disabled = false;
                btnSharePl.disabled = false;
            }
        }

        UI.showModal('modal-share-options');
    });

    $('#btn-share-edit').addEventListener('click', () => {
        UI.hideModal('modal-share-options');
        const url = _pendingShareUrlBase;
        navigator.clipboard.writeText(url).then(() => {
            UI.toast('🔗 Link (Edición) copiado', 'success');
        }).catch(() => {
            prompt('Copiá este link:', url);
        });
    });

    $('#btn-share-view').addEventListener('click', () => {
        UI.hideModal('modal-share-options');
        const url = _pendingShareUrlBase + '&mode=view';
        navigator.clipboard.writeText(url).then(() => {
            UI.toast('🔗 Link (Solo Ver) copiado', 'success');
        }).catch(() => {
            prompt('Copiá este link:', url);
        });
    });

    const btnSharePlaylistModal = $('#btn-share-playlist-modal');
    if (btnSharePlaylistModal) {
        btnSharePlaylistModal.addEventListener('click', () => {
            const plId = $('#share-playlist-select').value;
            if (!plId) return;
            UI.hideModal('modal-share-options');
            const url = _pendingShareUrlBase + '&playlist=' + plId + '&mode=view';
            navigator.clipboard.writeText(url).then(() => {
                UI.toast('🔗 Link de Playlist copiado', 'success');
            }).catch(() => {
                prompt('Copiá este link:', url);
            });
        });
    }

    $('#btn-cancel-share').addEventListener('click', () => {
        UI.hideModal('modal-share-options');
    });

    // Show share button if project is already saved
    AppState.on('projectSaved', () => {
        $('#btn-share-project').style.display = 'inline-flex';
    });

    AppState.on('projectLoaded', () => {
        $('#btn-share-project').style.display = 'inline-flex';
    });

    // ═══════════════════════════════════════
    // PLAYLIST SHARE
    // ═══════════════════════════════════════

    const handlePlaylistShare = async (e) => {
        const shareBtn = e.target.closest('.pl-share-btn');
        if (shareBtn) {
            const playlistId = shareBtn.dataset.playlistId;
            let projectId = AppState.get('currentProjectId');

            // Auto-guardar primero si estamos en modo editar y tocamos el link
            if (AppState.get('mode') === 'analyze') {
                const saveBtn = $('#btn-save-project');
                if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳'; }
                UI.toast('Guardando cambios antes de compartir...', 'info');
                try {
                    projectId = await AppState.saveToCloud();
                    FirebaseData.addProjectLocally(projectId);
                    $('#btn-share-project').style.display = 'inline-flex';
                } catch (err) {
                    UI.toast('Error al guardar: ' + err.message, 'error');
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾'; }
                    return;
                }
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾'; }
            }

            if (!projectId) {
                UI.toast('Primero guardá el proyecto para compartir', 'error');
                return;
            }

            const url = FirebaseData.getShareUrl(projectId, null, playlistId) + '&mode=view';
            navigator.clipboard.writeText(url).then(() => {
                UI.toast('🔗 Link de Playlist copiado', 'success');
            }).catch(() => {
                prompt('Copiá este link:', url);
            });
            return;
        }

        // Navegar automáticamente a la vista de la playlist si hacen clic en el nombre
        const nameBtn = e.target.closest('.pl-name-click');
        if (nameBtn) {
            const playlistId = nameBtn.dataset.playlistId;
            AppState.setMode('view');
            AppState.setPlaylistFilter(playlistId);
        }
    };

    $('#analyze-playlists').addEventListener('click', handlePlaylistShare);
    // También escuchamos los clicks de compartir playlist en la vista "Ver"
    const sourcePlaylistsCont = $('#source-playlists');
    if (sourcePlaylistsCont) {
        sourcePlaylistsCont.addEventListener('click', handlePlaylistShare);
    }

    // ═══════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════

    async function init() {
        // Check if loading a shared project from URL
        const projectIdFromUrl = FirebaseData.getProjectIdFromUrl();
        const playlistIdFromUrl = FirebaseData.getPlaylistIdFromUrl();
        const gameIdFromUrl = FirebaseData.getGameIdFromUrl();
        const params = new URLSearchParams(window.location.search);
        const modeFromUrl = params.get('mode');

        if (projectIdFromUrl) {
            // No cargamos los clips demo si venimos de un link
            DemoData.clear();
        }

        // Init state (loads whatever is in DemoData)
        AppState.init();

        // Init drawing tool
        if (typeof DrawingTool !== 'undefined') {
            DrawingTool.init();
        }

        // Init YouTube Player safely (handles file:// origin errors cleanly)
        try {
            await VideoPlayer.init();
        } catch (e) {
            console.warn('YouTube Player no se pudo iniciar inmediatamente (común en file://).', e);
        }

        if (projectIdFromUrl) {
            UI.toast('Cargando proyecto...', '');
            const loaded = await AppState.loadFromCloud(projectIdFromUrl);

            if (loaded) {
                // Determine if this project was already in our local 'owned' list
                const localProjects = JSON.parse(localStorage.getItem('sr_my_projects') || '[]');
                const isOwned = localProjects.some(p => {
                    if (typeof p === 'string') return p === projectIdFromUrl;
                    return p.id === projectIdFromUrl && p.shared === false;
                });

                FirebaseData.addProjectLocally(projectIdFromUrl, !isOwned); // Save as shared if we don't own it
                UI.toast('Proyecto cargado ✅', 'success');

                if (gameIdFromUrl) {
                    AppState.setCurrentGame(gameIdFromUrl);
                } else {
                    const games = AppState.get('games');
                    if (games.length > 0) {
                        // For backward compatibility with older multi-game projects, 
                        // try to auto-select the game with the most clips rather than just [0]
                        const allClips = AppState.get('clips');
                        let bestGameId = games[0].id;
                        let maxClips = -1;
                        games.forEach(g => {
                            const count = allClips.filter(c => c.game_id === g.id).length;
                            if (count > maxClips) {
                                maxClips = count;
                                bestGameId = g.id;
                            }
                        });
                        AppState.setCurrentGame(bestGameId);
                    }
                }

                const game = AppState.getCurrentGame();
                if (game && game.youtube_video_id) {
                    // Detect if source is a local blob or a potential YouTube ID
                    const isYT = !game.youtube_video_id.startsWith('blob:') &&
                        !game.youtube_video_id.startsWith('data:') &&
                        game.youtube_video_id.length < 30; // 30 is a safe margin for YT IDs/links
                    VideoPlayer.loadVideo(game.youtube_video_id, isYT ? 'youtube' : 'local');
                }

                if (modeFromUrl === 'view') {
                    document.body.classList.add('read-only-mode');
                    AppState.setMode('view');
                    if (!playlistIdFromUrl) {
                        setTimeout(() => {
                            const plList = document.getElementById('source-playlists-list');
                            const plToggle = document.querySelector('[data-toggle="source-playlists-list"]');
                            if (plList) plList.classList.remove('collapsed');
                            if (plToggle) plToggle.classList.add('open');
                        }, 50);
                    }
                }
            } else {
                UI.toast('No se pudo cargar el proyecto', 'error');
            }
        } else {
            // Auto-select first game for demo
            const games = AppState.get('games');
            if (games.length > 0) {
                AppState.setCurrentGame(games[0].id);
            }
        }

        // Apply playlist-only mode if requested
        if (playlistIdFromUrl) {
            document.body.classList.add('playlist-only-mode');
            AppState.setMode('view');
            AppState.setPlaylistFilter(playlistIdFromUrl);
        }

        // Render initial UI
        UI.refreshAll();
    }

    init();

})();
