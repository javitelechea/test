/* ═══════════════════════════════════════════
   SimpleReplay — UI Rendering
   All DOM rendering and update functions
   ═══════════════════════════════════════════ */

const UI = (() => {

    const FLAG_EMOJI = {
        bueno: '👍',
        acorregir: '⚠️',
        duda: '❓',
        importante: '⭐'
    };

    const FLAG_LABELS = {
        bueno: 'Bueno',
        acorregir: 'A corregir',
        duda: 'Duda',
        importante: 'Importante'
    };

    // ── Helpers ──
    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    // ── Toast ──
    function toast(msg, type = '') {
        const container = $('#toast-container');
        const el = document.createElement('div');
        el.className = 'toast ' + type;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => { if (el.parentNode) el.remove(); }, 2600);
    }

    // ═══ GAME SELECTOR ═══
    function renderGameSelector() {
        const sel = $('#game-selector');
        const games = AppState.get('games');
        const currentId = AppState.get('currentGameId');
        sel.innerHTML = '<option value="">— Seleccionar partido —</option>';
        games.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g.id;
            opt.textContent = g.title;
            if (g.id === currentId) opt.selected = true;
            sel.appendChild(opt);
        });
    }

    // ═══ TAG BUTTONS (Below Video — Top & Bottom rows) ═══
    let _tagEditMode = false;
    let _editingTagId = null;

    function renderTagButtons() {
        const containerTop = $('#tag-buttons-a');
        const containerBottom = $('#tag-buttons-b');
        const tags = AppState.get('tagTypes');
        containerTop.innerHTML = '';
        containerBottom.innerHTML = '';

        const topRowKeys = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
        const bottomRowKeys = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];

        let topIdx = 0;
        let bottomIdx = 0;

        function createTagBtn(tag) {
            const btn = document.createElement('button');
            const isRival = tag.row === 'bottom';
            let hotkey = '';

            if (!_tagEditMode) {
                if (!isRival && topIdx < topRowKeys.length) {
                    hotkey = topRowKeys[topIdx++];
                } else if (isRival && bottomIdx < bottomRowKeys.length) {
                    hotkey = bottomRowKeys[bottomIdx++];
                }
            }

            btn.className = 'tag-btn' + (isRival ? ' tag-btn-rival' : '') +
                (_tagEditMode ? ' tag-edit-mode' : '') +
                (_editingTagId === tag.id ? ' tag-editing' : '');
            btn.dataset.tagId = tag.id;

            if (hotkey) {
                btn.innerHTML = `<span>${tag.label}</span><span style="font-size:0.65rem; opacity:0.6; margin-left:4px;">[${hotkey}]</span>`;
                btn.dataset.hotkey = hotkey.toLowerCase();
            } else {
                btn.textContent = tag.label;
            }

            btn.title = _tagEditMode
                ? `Click para editar "${tag.label}"`
                : `${tag.label} — Pre: ${tag.pre_sec}s | Post: ${tag.post_sec}s${hotkey ? ` | Hotkey: ${hotkey}` : ''}`;

            btn.addEventListener('click', () => {
                if (_tagEditMode) {
                    openTagInlineEditor(tag);
                    return;
                }
                // Normal mode: create clip
                if (!AppState.get('currentGameId')) {
                    toast('Primero seleccioná un partido', 'error');
                    return;
                }
                const tSec = Math.round(YTPlayer.getCurrentTime());
                const clip = AppState.addClip(tag.id, tSec);
                if (clip) {
                    btn.classList.add('tag-flash');
                    setTimeout(() => btn.classList.remove('tag-flash'), 500);
                    toast(`Clip creado: ${tag.label} @ ${formatTime(tSec)}`, 'success');
                }
            });
            return btn;
        }

        tags.filter(t => !t.isHidden).forEach(tag => {
            if (tag.row === 'bottom') {
                containerBottom.appendChild(createTagBtn(tag));
            } else {
                containerTop.appendChild(createTagBtn(tag));
            }
        });

        // In edit mode, add "+" buttons for adding new tags to each row
        if (_tagEditMode) {
            const addBtnTop = document.createElement('button');
            addBtnTop.className = 'tag-btn tag-btn-add';
            addBtnTop.textContent = '+';
            addBtnTop.title = 'Agregar tag (propio)';
            addBtnTop.addEventListener('click', () => openTagInlineEditor(null, 'top'));
            containerTop.appendChild(addBtnTop);

            const addBtnBottom = document.createElement('button');
            addBtnBottom.className = 'tag-btn tag-btn-rival tag-btn-add';
            addBtnBottom.textContent = '+';
            addBtnBottom.title = 'Agregar tag (rival)';
            addBtnBottom.addEventListener('click', () => openTagInlineEditor(null, 'bottom'));
            containerBottom.appendChild(addBtnBottom);
        }
    }

    // ═══ FLAG DROPDOWN HELPERS (per-clip flag assignment) ═══
    function buildFlagButton(clipId, activeFlags) {
        const hasFlags = activeFlags.length > 0;
        const flagsDisplay = hasFlags ? activeFlags.map(f => FLAG_EMOJI[f] || '').join('') : '';
        return `<span class="clip-flags-display">${flagsDisplay}</span><button class="clip-flag-btn${hasFlags ? ' has-flags' : ''}" data-clip-id="${clipId}" title="Flags">🚩</button>`;
    }

    function attachFlagDropdownHandlers(container, rerenderFn) {
        container.querySelectorAll('.clip-flag-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clipId = btn.dataset.clipId;
                // Close any other open popover
                container.querySelectorAll('.flag-popover').forEach(p => p.remove());
                // Create popover
                const popover = document.createElement('div');
                popover.className = 'flag-popover';
                const allFlags = ['bueno', 'acorregir', 'duda', 'importante'];
                const currentFlags = AppState.getClipUserFlags(clipId);
                popover.innerHTML = allFlags.map(flag => {
                    const isActive = currentFlags.includes(flag);
                    return `<button class="flag-popover-btn${isActive ? ' active' : ''}" data-clip-id="${clipId}" data-flag="${flag}" title="${FLAG_LABELS[flag]}">${FLAG_EMOJI[flag]}</button>`;
                }).join('');
                btn.parentElement.style.position = 'relative';
                btn.parentElement.appendChild(popover);
                // Attach flag click handlers
                popover.querySelectorAll('.flag-popover-btn').forEach(fb => {
                    fb.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        AppState.toggleFlag(fb.dataset.clipId, fb.dataset.flag);
                        rerenderFn();
                    });
                });
                // Close on outside click
                const close = (ev) => {
                    if (!popover.contains(ev.target) && ev.target !== btn) {
                        popover.remove();
                        document.removeEventListener('click', close);
                    }
                };
                setTimeout(() => document.addEventListener('click', close), 0);
            });
        });
    }

    // ═══ CHAT / COMMENTS HELPERS ═══
    const MENTION_REGEX = /@(\w[\w\s]*?)(?=\s|$|[.,;:!?])/g;

    function highlightMentions(text) {
        return text.replace(MENTION_REGEX, '<span class="chat-mention">@$1</span>');
    }

    function buildChatButton(playlistId, clipId) {
        if (!playlistId) return ''; // Chat only in playlists
        const comments = AppState.getComments(playlistId, clipId);
        const count = comments.length;
        const hasClass = count > 0 ? ' has-comments' : '';
        return `<button class="clip-chat-btn${hasClass}" data-clip-id="${clipId}" data-playlist-id="${playlistId}" title="Chat (${count})">💬${count > 0 ? count : ''}</button>`;
    }

    function buildDrawButton(playlistId, clipId) {
        if (!playlistId) return ''; // Draw only in playlists
        const comments = AppState.getComments(playlistId, clipId);
        const drawCount = comments.filter(c => c.drawing).length;
        const hasClass = drawCount > 0 ? ' has-drawings' : '';
        return `<button class="clip-draw-btn${hasClass}" data-clip-id="${clipId}" data-playlist-id="${playlistId}" title="Dibujar (${drawCount})">✏️${drawCount > 0 ? drawCount : ''}</button>`;
    }

    function buildChatPanel(playlistId, clipId) {
        const comments = AppState.getComments(playlistId, clipId);
        const savedName = localStorage.getItem('sr_chat_name') || '';
        let messagesHtml = '';
        if (comments.length === 0) {
            messagesHtml = '<p style="color:var(--text-muted);font-size:0.7rem;text-align:center;">Sin comentarios</p>';
        } else {
            messagesHtml = comments.map(c => {
                const time = c.timestamp ? new Date(c.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';
                if (c.drawing) {
                    // Drawing comment — render as thumbnail
                    const timeBadge = c.videoTimeSec !== null && c.videoTimeSec !== undefined
                        ? `<span class="drawing-time-badge">${formatTime(c.videoTimeSec)}</span>`
                        : '';
                    return `<div class="chat-message chat-drawing">
                        <span class="chat-name">${c.name}:</span>
                        <div class="drawing-thumb-wrap" data-drawing="${c.drawing}" data-video-time="${c.videoTimeSec ?? ''}">
                            <img src="${c.drawing}" class="drawing-thumbnail" alt="Dibujo" />
                            ${timeBadge}
                        </div>
                        <span class="chat-time">${time}</span>
                    </div>`;
                }
                return `<div class="chat-message"><span class="chat-name">${c.name}:</span>${highlightMentions(c.text)}<span class="chat-time">${time}</span></div>`;
            }).join('');
        }
        return `
        <div class="clip-chat-panel" data-clip-id="${clipId}" data-playlist-id="${playlistId}">
            <div class="chat-messages">${messagesHtml}</div>
            <div class="chat-input-row">
                <input type="text" class="chat-name-input" placeholder="Nombre" value="${savedName}" data-role="chat-name" />
                <input type="text" class="chat-text-input" placeholder="Mensaje... (@Arq, @Del...)" data-role="chat-text" />
                <button class="btn btn-xs btn-primary chat-send-btn" data-clip-id="${clipId}" data-playlist-id="${playlistId}">↩</button>
            </div>
        </div>`;
    }

    function attachChatHandlers(container, rerenderFn) {
        // Toggle chat panel
        container.querySelectorAll('.clip-chat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clipId = btn.dataset.clipId;
                const playlistId = btn.dataset.playlistId;
                if (!playlistId) return; // Chat only in playlists
                const parentEl = btn.closest('.clip-item');
                const existing = parentEl.querySelector('.clip-chat-panel');
                if (existing) {
                    existing.remove();
                } else {
                    // Close any other open chat
                    container.querySelectorAll('.clip-chat-panel').forEach(p => p.remove());
                    parentEl.insertAdjacentHTML('beforeend', buildChatPanel(playlistId, clipId));
                    // Focus text input
                    const textInput = parentEl.querySelector('.chat-text-input');
                    if (textInput) textInput.focus();
                    // Send handler
                    const sendBtn = parentEl.querySelector('.chat-send-btn');
                    const nameInput = parentEl.querySelector('.chat-name-input');
                    const panel = parentEl.querySelector('.clip-chat-panel');
                    const closeChat = (ev) => {
                        if (panel && !panel.contains(ev.target) && !btn.contains(ev.target)) {
                            panel.remove();
                            document.removeEventListener('click', closeChat);
                        }
                    };
                    setTimeout(() => document.addEventListener('click', closeChat), 10);

                    const sendMessage = () => {
                        const name = nameInput.value.trim();
                        const text = textInput.value.trim();
                        if (!name) { toast('Escribí tu nombre', 'error'); nameInput.focus(); return; }
                        if (!text) return;
                        localStorage.setItem('sr_chat_name', name);
                        AppState.addComment(playlistId, clipId, name, text);
                        document.removeEventListener('click', closeChat);
                        rerenderFn();
                    };
                    sendBtn.addEventListener('click', sendMessage);
                    textInput.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') { ev.preventDefault(); sendMessage(); }
                    });

                    // Drawing thumbnail click handlers
                    panel.querySelectorAll('.drawing-thumb-wrap').forEach(thumb => {
                        thumb.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const drawingData = thumb.dataset.drawing;
                            const videoTime = thumb.dataset.videoTime ? parseFloat(thumb.dataset.videoTime) : null;
                            if (drawingData && typeof DrawingTool !== 'undefined') {
                                DrawingTool.showDrawingOverlay(drawingData, videoTime);
                            }
                        });
                    });
                }
            });
        });

        // Draw button click handlers
        container.querySelectorAll('.clip-draw-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clipId = btn.dataset.clipId;
                const playlistId = btn.dataset.playlistId;
                if (!playlistId || typeof DrawingTool === 'undefined') return;
                // Set current clip and play it to frame, then open drawing
                AppState.setCurrentClip(clipId);
                DrawingTool.open(playlistId, clipId);
            });
        });
    }

    // ═══ CLIP LIST (Analyze) ═══
    function renderAnalyzeClips() {
        const container = $('#analyze-clip-list');
        const clips = AppState.get('clips');
        const currentClipId = AppState.get('currentClipId');

        container.innerHTML = '';
        $('#clip-count').textContent = clips.length;

        if (clips.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px;">Sin clips. Usá los tags para crear.</p>';
            return;
        }

        clips.forEach(clip => {
            const tag = AppState.getTagType(clip.tag_type_id);
            const clipNum = AppState.getClipNumber(clip);
            const flags = AppState.getClipUserFlags(clip.id);
            const el = document.createElement('div');
            el.className = 'clip-item' + (clip.id === currentClipId ? ' active' : '');
            el.dataset.clipId = clip.id;

            const isRival = tag && tag.row === 'bottom';
            const badgeClass = isRival ? 'clip-tag-badge rival' : 'clip-tag-badge';
            const flagBtnHtml = buildFlagButton(clip.id, flags);
            const urlParams = new URLSearchParams(window.location.search);
            const isReadOnly = urlParams.get('mode') === 'view';

            const tagLabel = tag ? `${tag.label} ${clipNum}` : '?';

            let playlistBtnHtml = '';
            if (!isReadOnly) {
                playlistBtnHtml = `<button class="clip-action-icon clip-add-playlist" data-clip-id="${clip.id}" title="Agregar a playlist">📋</button>`;
            }

            el.innerHTML = `
        <span class="${badgeClass}">${tagLabel}</span>
        <span class="clip-time">${formatTime(clip.start_sec)} → ${formatTime(clip.end_sec)}</span>
        <span class="clip-item-spacer"></span>
        ${flagBtnHtml}
        ${playlistBtnHtml}
        <button class="clip-action-icon clip-delete-btn" data-clip-id="${clip.id}" title="Eliminar clip">🗑️</button>
      `;

            el.addEventListener('click', (e) => {
                if (e.target.closest('.clip-flag-btn')) return;
                if (e.target.closest('.flag-popover')) return;
                if (e.target.closest('.clip-action-icon')) return;
                AppState.setCurrentClip(clip.id);
                YTPlayer.playClip(clip.start_sec, clip.end_sec);
            });

            container.appendChild(el);
        });

        // Flag dropdown
        attachFlagDropdownHandlers(container, () => renderAnalyzeClips());

        // Playlist add buttons
        container.querySelectorAll('.clip-add-playlist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToPlaylistModal(btn.dataset.clipId);
            });
        });

        // Delete buttons
        container.querySelectorAll('.clip-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                AppState.deleteClip(btn.dataset.clipId);
                toast('Clip eliminado', 'success');
            });
        });
    }

    // ═══ CLIP LIST (View) ═══
    let _selectedClipIds = new Set();

    function renderViewClips() {
        const container = $('#view-clip-list');
        const clips = AppState.getFilteredClips();
        const currentClipId = AppState.get('currentClipId');
        const activePlaylistId = AppState.get('activePlaylistId');

        container.innerHTML = '';
        $('#view-clip-count').textContent = clips.length;

        if (clips.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;padding:8px;">Sin clips para esta selección.</p>';
            updateSelectionBar();
            return;
        }

        clips.forEach(clip => {
            const tag = AppState.getTagType(clip.tag_type_id);
            const clipNum = AppState.getClipNumber(clip);
            const flags = AppState.getClipUserFlags(clip.id);
            const el = document.createElement('div');
            el.className = 'clip-item' + (clip.id === currentClipId ? ' active' : '');
            el.dataset.clipId = clip.id;

            const urlParams = new URLSearchParams(window.location.search);
            const isReadOnly = urlParams.get('mode') === 'view';

            const isRival = tag && tag.row === 'bottom';
            const badgeClass = isRival ? 'clip-tag-badge rival' : 'clip-tag-badge';
            const flagBtnHtml = buildFlagButton(clip.id, flags);
            const chatBtnHtml = buildChatButton(activePlaylistId, clip.id);
            const drawBtnHtml = buildDrawButton(activePlaylistId, clip.id);
            const tagLabel = tag ? `${tag.label} ${clipNum}` : '?';
            const checked = _selectedClipIds.has(clip.id) ? 'checked' : '';

            let playlistBtnHtml = '';
            if (!isReadOnly) {
                playlistBtnHtml = `<button class="clip-action-icon clip-add-playlist" data-clip-id="${clip.id}" title="Agregar a playlist">📋</button>`;
            }

            el.innerHTML = `
        <input type="checkbox" class="clip-checkbox" data-clip-id="${clip.id}" ${checked} />
        <span class="${badgeClass}">${tagLabel}</span>
        <span class="clip-time">${formatTime(clip.start_sec)} → ${formatTime(clip.end_sec)}</span>
        <span class="clip-item-spacer"></span>
        ${flagBtnHtml}
        ${chatBtnHtml}
        ${drawBtnHtml}
        ${playlistBtnHtml}
      `;

            el.addEventListener('click', (e) => {
                if (e.target.closest('.clip-flag-btn')) return;
                if (e.target.closest('.flag-popover')) return;
                if (e.target.classList.contains('clip-checkbox')) return;
                if (e.target.closest('.clip-chat-panel')) return;
                if (e.target.closest('.clip-chat-btn')) return;
                if (e.target.closest('.clip-action-icon')) return;
                AppState.setCurrentClip(clip.id);
                YTPlayer.playClip(clip.start_sec, clip.end_sec);
            });

            container.appendChild(el);
        });

        // Checkbox handlers
        container.querySelectorAll('.clip-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const cid = cb.dataset.clipId;
                if (cb.checked) _selectedClipIds.add(cid);
                else _selectedClipIds.delete(cid);
                updateSelectionBar();
            });
        });

        // Flag dropdown
        attachFlagDropdownHandlers(container, () => renderViewClips());

        // Playlist add buttons
        container.querySelectorAll('.clip-add-playlist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showAddToPlaylistModal(btn.dataset.clipId);
            });
        });

        // Chat handlers
        attachChatHandlers(container, () => renderViewClips());

        updateSelectionBar();
    }

    function updateSelectionBar() {
        const bar = $('#view-selection-bar');
        if (!bar) return;
        if (_selectedClipIds.size > 0) {
            bar.style.display = 'flex';
            const countEl = $('#view-selected-count');
            if (countEl) countEl.textContent = _selectedClipIds.size;
        } else {
            bar.style.display = 'none';
        }
    }

    function getSelectedClipIds() { return [..._selectedClipIds]; }
    function clearClipSelection() { _selectedClipIds.clear(); updateSelectionBar(); }

    // ═══ CLIP EDIT CONTROLS ═══
    function updateClipEditControls() {
        const controls = $('#clip-edit-controls');
        const clip = AppState.getCurrentClip();
        if (clip) {
            controls.style.display = 'flex';
        } else {
            controls.style.display = 'none';
        }
    }

    // ═══ PLAYLISTS (Analyze) ═══
    function renderAnalyzePlaylists() {
        const container = $('#analyze-playlists');
        const playlists = AppState.get('playlists');
        container.innerHTML = '';

        const urlParams = new URLSearchParams(window.location.search);
        const isReadOnly = urlParams.get('mode') === 'view';

        playlists.forEach(pl => {
            const items = AppState.get('playlistItems')[pl.id] || [];
            const el = document.createElement('div');
            el.className = 'playlist-item';

            let shareBtnHtml = '';
            if (!isReadOnly) {
                shareBtnHtml = `<button class="btn btn-xs btn-share pl-share-btn" data-playlist-id="${pl.id}" title="Compartir playlist">🔗</button>`;
            }

            el.innerHTML = `
        <span class="pl-icon">📁</span>
        <span class="pl-name-click" data-playlist-id="${pl.id}" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;" title="Ver Playlist">${pl.name}</span>
        <span class="pl-count">${items.length} clips</span>
        ${shareBtnHtml}
      `;
            container.appendChild(el);
        });
    }

    // ═══ SOURCE SELECTOR (View — Multi-tag) ═══
    function renderViewSources() {
        const tagsContainer = $('#source-tags');
        const playlistsContainer = $('#source-playlists');
        const tags = AppState.get('tagTypes');
        const playlists = AppState.get('playlists');
        const activeTagIds = AppState.get('activeTagFilters');
        const activePlaylistId = AppState.get('activePlaylistId');

        tagsContainer.innerHTML = '';
        playlistsContainer.innerHTML = '';

        // Update 'all' button
        const allBtn = $('#src-all');
        const hasAnyFilter = activeTagIds.length > 0 || activePlaylistId;
        allBtn.className = 'source-btn' + (!hasAnyFilter ? ' active' : '');
        allBtn.onclick = () => {
            AppState.clearTagFilters();
        };

        tags.filter(t => !t.isHidden).forEach(tag => {
            const btn = document.createElement('button');
            const isRival = tag.row === 'bottom';
            const isActive = activeTagIds.includes(tag.id);
            btn.className = 'source-btn' + (isActive ? ' active' : '') + (isRival ? ' source-btn-rival' : '');
            btn.dataset.source = tag.id;
            btn.textContent = tag.label;
            btn.addEventListener('click', () => {
                AppState.toggleTagFilter(tag.id);
                // Auto-collapse after selection
                const body = document.getElementById('source-tags-list');
                const toggle = body?.previousElementSibling;
                if (body) body.classList.add('collapsed');
                if (toggle) toggle.classList.remove('open');
            });
            tagsContainer.appendChild(btn);
        });

        const urlParams = new URLSearchParams(window.location.search);
        const isReadOnly = urlParams.get('mode') === 'view';
        const sharedPlaylistId = urlParams.get('playlist');

        playlists.forEach(pl => {
            // In read-only mode, if a specific playlist is shared, only show that one
            if (isReadOnly && sharedPlaylistId && pl.id !== sharedPlaylistId) {
                return;
            }

            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '4px';

            const btn = document.createElement('button');
            const isActive = activePlaylistId === pl.id;
            btn.className = 'source-btn' + (isActive ? ' active' : '');
            btn.dataset.source = pl.id;
            btn.style.flex = '1';
            btn.textContent = pl.name;
            btn.addEventListener('click', () => {
                if (isActive) {
                    AppState.clearPlaylistFilter();
                } else {
                    AppState.setPlaylistFilter(pl.id);
                }
                const body = document.getElementById('source-playlists-list');
                const toggle = body?.previousElementSibling;
                if (body) body.classList.add('collapsed');
                if (toggle) toggle.classList.remove('open');
            });

            wrap.appendChild(btn);

            if (!isReadOnly) {
                const shareBtn = document.createElement('button');
                shareBtn.className = 'btn btn-xs btn-share pl-share-btn';
                shareBtn.dataset.playlistId = pl.id;
                shareBtn.title = 'Compartir playlist';
                shareBtn.textContent = '🔗';
                shareBtn.style.padding = '4px 6px';
                wrap.appendChild(shareBtn);
            }

            playlistsContainer.appendChild(wrap);
        });

        // Render filter chips
        renderFilterChips(tags, playlists, activeTagIds, activePlaylistId);
    }

    function renderFilterChips(tags, playlists, activeTagIds, activePlaylistId) {
        const container = $('#active-filter-chip');
        container.innerHTML = '';

        const hasFilters = activeTagIds.length > 0 || activePlaylistId;

        if (!hasFilters) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';

        // Tag chips
        activeTagIds.forEach(tagId => {
            const tag = tags.find(t => t.id === tagId);
            if (!tag) return;
            const chip = document.createElement('span');
            const isRival = tag.row === 'bottom';
            chip.className = 'filter-chip' + (isRival ? ' rival' : '');
            chip.innerHTML = `${tag.label}<button class="filter-chip-x" data-remove-tag="${tag.id}" title="Quitar">✕</button>`;
            container.appendChild(chip);
        });

        // Playlist chip
        if (activePlaylistId) {
            const pl = playlists.find(p => p.id === activePlaylistId);
            if (pl) {
                const chip = document.createElement('span');
                chip.className = 'filter-chip playlist';
                chip.innerHTML = `📁 ${pl.name}<button class="filter-chip-x" data-remove-playlist="1" title="Quitar">✕</button>`;
                container.appendChild(chip);
            }
        }

        // Attach remove handlers
        container.querySelectorAll('[data-remove-tag]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                AppState.removeTagFilter(btn.dataset.removeTag);
            });
        });
        container.querySelectorAll('[data-remove-playlist]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                AppState.clearPlaylistFilter();
            });
        });
    }

    // ═══ NOTIFICATIONS (Novedades) ═══
    function renderNotifications() {
        const wrapper = $('#novedades-wrapper');
        const dropdown = $('#novedades-dropdown');
        const badge = $('#novedades-badge');
        if (!wrapper || !dropdown) return;

        const pid = AppState.get('currentProjectId');
        if (!pid) { wrapper.style.display = 'none'; return; }
        wrapper.style.display = 'inline-flex';

        const clips = AppState.get('clips');
        const playlists = AppState.get('playlists');
        const playlistComments = AppState.get('playlistComments') || {};
        let allItems = [];

        Object.keys(playlistComments).forEach(key => {
            const parts = key.split('::');
            if (parts.length !== 2) return;
            const [plId, clipId] = parts;
            const clip = clips.find(c => c.id === clipId);
            const playlist = playlists.find(p => p.id === plId);
            (playlistComments[key] || []).forEach(c => {
                allItems.push({
                    kind: 'comment', clipId, playlistId: plId,
                    playlistName: playlist ? playlist.name : '?',
                    start_sec: clip ? clip.start_sec : 0,
                    end_sec: clip ? clip.end_sec : 0,
                    tagTypeId: clip ? clip.tag_type_id : null,
                    clipNumber: clip ? AppState.getClipNumber(clip) : 0,
                    ...c
                });
            });
        });

        const activities = AppState.getActivityLog();
        activities.forEach(a => { allItems.push({ kind: 'activity', ...a }); });
        allItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const recentItems = allItems.slice(0, 30);

        // Update badge — only count items newer than last-seen timestamp
        if (badge) {
            const lastSeen = localStorage.getItem('novedades_seen_' + pid);
            const lastSeenDate = lastSeen ? new Date(lastSeen) : new Date(0);
            const unseenCount = recentItems.filter(item =>
                item.timestamp && new Date(item.timestamp) > lastSeenDate
            ).length;
            if (unseenCount > 0) {
                badge.textContent = unseenCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        // Build dropdown content
        let html = `<div class="novedades-header">
            <h4>\ud83d\udece\ufe0f Novedades</h4>
            <button id="btn-sync-novedades" class="btn btn-xs btn-ghost" title="Sincronizar">\u27f3 Sincronizar</button>
        </div>`;

        if (recentItems.length === 0) {
            html += '<div class="nov-empty">No hay novedades.</div>';
        } else {
            recentItems.forEach((item, idx) => {
                const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';

                if (item.kind === 'comment') {
                    const tag = AppState.getTagType(item.tagTypeId);
                    const tagLabel = tag ? `${tag.label} ${item.clipNumber}` : 'Clip';
                    html += `<div class="nov-item nov-chat" data-action="comment" data-playlist-id="${item.playlistId}" data-clip-id="${item.clipId}" data-start="${item.start_sec}" data-end="${item.end_sec}">
                        <div class="nov-meta">
                            <span class="nov-label">\ud83d\udcac en \u00ab${item.playlistName}\u00bb \u00b7 [${tagLabel}]</span>
                            <span class="nov-time">${timeStr}</span>
                        </div>
                        <div class="nov-body"><span class="chat-name">${item.name}:</span> ${highlightMentions(item.text)}</div>
                    </div>`;
                } else if (item.kind === 'activity') {
                    let icon = '\ud83d\udccb', actionText = '';
                    if (item.type === 'playlist_created') {
                        icon = '\ud83d\udcc1';
                        actionText = `cre\u00f3 playlist \u00ab${item.playlistName}\u00bb`;
                    } else if (item.type === 'playlist_updated') {
                        icon = '\ud83d\udccb';
                        actionText = `agreg\u00f3 ${item.clipCount} clip${item.clipCount > 1 ? 's' : ''} a \u00ab${item.playlistName}\u00bb`;
                    }
                    const plId = item.playlistId || '';
                    html += `<div class="nov-item nov-activity" data-action="activity" data-playlist-id="${plId}">
                        <div class="nov-meta">
                            <span class="nov-label">${icon} Playlist</span>
                            <span class="nov-time">${timeStr}</span>
                        </div>
                        <div class="nov-body"><span class="chat-name">${item.name}</span> ${actionText}</div>
                    </div>`;
                }
            });
        }

        dropdown.innerHTML = html;

        // Click handlers for comment items → navigate to playlist + clip
        dropdown.querySelectorAll('[data-action="comment"]').forEach(el => {
            el.addEventListener('click', () => {
                const plId = el.dataset.playlistId;
                const clipId = el.dataset.clipId;
                const startSec = parseFloat(el.dataset.start);
                const endSec = parseFloat(el.dataset.end);
                document.body.classList.remove('playlist-only-mode');
                AppState.setPlaylistFilter(plId);
                AppState.setMode('view');
                AppState.setCurrentClip(clipId);
                YTPlayer.playClip(startSec, endSec);
                dropdown.style.display = 'none';
            });
        });

        // Click handlers for activity items → navigate to playlist
        dropdown.querySelectorAll('[data-action="activity"]').forEach(el => {
            el.addEventListener('click', () => {
                const plId = el.dataset.playlistId;
                if (plId) {
                    document.body.classList.remove('playlist-only-mode');
                    AppState.setPlaylistFilter(plId);
                    AppState.setMode('view');
                }
                dropdown.style.display = 'none';
            });
        });

        // Sync button handler
        const syncBtn = dropdown.querySelector('#btn-sync-novedades');
        if (syncBtn) {
            syncBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                toast('Sincronizando...', 'info');
                const success = await AppState.loadFromCloud(pid);
                if (success) {
                    toast('Novedades actualizadas \u2705', 'success');
                    renderNotifications();
                } else {
                    toast('Error al sincronizar', 'error');
                }
            });
        }
    }


    // ═══ FLAG FILTER BAR ═══
    function updateFlagFilterBar() {
        const activeFilters = AppState.get('filterFlags');
        const clearBtn = $('#btn-clear-flag-filter');
        clearBtn.style.display = activeFilters.length > 0 ? 'inline-flex' : 'none';

        $$('#flag-filter-bar .flag-btn').forEach(btn => {
            const flag = btn.dataset.flag;
            btn.classList.toggle('filter-active', activeFilters.includes(flag));
        });
    }

    // ═══ FLAG BUTTONS (for current clip in View mode) ═══
    function updateFlagButtons() {
        const clip = AppState.getCurrentClip();
        if (!clip) return;
        const userFlags = AppState.getClipUserFlags(clip.id);

        $$('#flag-filter-bar .flag-btn').forEach(btn => {
            const flag = btn.dataset.flag;
            btn.classList.toggle('active', userFlags.includes(flag));
        });
    }

    // ═══ FOCUS VIEW ═══
    function updateFocusView() {
        const active = AppState.get('focusView');
        const overlay = $('#focus-overlay');
        const clip = AppState.getCurrentClip();

        overlay.classList.toggle('hidden', !active || !clip);

        if (active && clip) {
            const tag = AppState.getTagType(clip.tag_type_id);
            const flags = AppState.getClipUserFlags(clip.id);
            $('#focus-clip-name').textContent = tag ? `${tag.label} @ ${formatTime(clip.t_sec)}` : '';
            $('#focus-clip-flags').textContent = flags.map(f => FLAG_EMOJI[f] || '').join(' ');
        }

        // Toggle focus button text
        const btn = $('#btn-focus-view');
        if (btn) {
            btn.innerHTML = active ? '<span>↩️</span> Salir Foco' : '<span>🔍</span> Vista Foco';
        }
    }

    // ═══ PANEL COLLAPSE ═══
    function updatePanelState() {
        const collapsed = AppState.get('panelCollapsed');
        const panel = $('#side-panel');
        const expandBtn = $('#btn-expand-panel');

        panel.classList.toggle('collapsed', collapsed);
        expandBtn.classList.toggle('hidden', !collapsed);
        document.body.classList.toggle('panel-collapsed', collapsed);
    }

    // ═══ MODE & PANELS ═══
    function updateMode() {
        const mode = AppState.get('mode');
        const btnAnalyze = $('#btn-mode-analyze');
        const btnView = $('#btn-mode-view');
        const panelAnalyze = $('#panel-analyze');
        const panelView = $('#panel-view');
        const slider = $('#mode-slider');
        const tagBar = $('#tag-bar');

        btnAnalyze.classList.toggle('active', mode === 'analyze');
        btnView.classList.toggle('active', mode === 'view');

        if (mode === 'analyze') {
            panelAnalyze.classList.remove('hidden');
            panelView.classList.add('hidden');
            tagBar.classList.remove('hidden');
        } else { // mode === 'view'
            panelAnalyze.classList.add('hidden');
            panelView.classList.remove('hidden');
            tagBar.classList.add('hidden');
        }
        updateClipEditControls();

        // Slider animation
        if (slider) slider.classList.toggle('right', mode === 'view');
        // Exit focus when switching to analyze
        if (mode === 'analyze' && AppState.get('focusView')) {
            AppState.toggleFocusView();
        }

        // --- READ-ONLY / PLAYLIST VIEW RESTRICTIONS ---
        const urlParams = new URLSearchParams(window.location.search);
        const isReadOnly = urlParams.get('mode') === 'view';

        const btnSave = $('#btn-save-project');
        const btnShare = $('#btn-share-project');
        const btnImportXml = $('#btn-import-xml');
        const btnExportXml = $('#btn-export-xml');

        if (isReadOnly) {
            if (btnSave) btnSave.style.display = 'none';
            if (btnShare) btnShare.style.display = 'none';
            if (btnImportXml) btnImportXml.style.display = 'none';
            if (btnExportXml) btnExportXml.style.display = 'none';
        } else {
            if (btnSave) btnSave.style.display = 'inline-flex';
            if (btnShare && AppState.get('currentProjectId')) btnShare.style.display = 'inline-flex';
            if (btnImportXml) btnImportXml.style.display = 'inline-flex';
            if (btnExportXml) btnExportXml.style.display = 'inline-flex';
        }

        // Refresh appropriate list
        if (mode === 'analyze') {
            renderAnalyzeClips();
            updateClipEditControls();
        } else {
            renderViewClips();
            renderViewSources();
            updateFlagFilterBar();
        }
    }

    // ═══ OVERLAY (no game) ═══
    function updateNoGameOverlay() {
        const overlay = $('#no-game-overlay');
        const hasGame = !!AppState.get('currentGameId');
        overlay.classList.toggle('hidden', hasGame);
    }

    // ═══ ADD TO PLAYLIST MODAL ═══
    let _pendingClipsForPlaylist = [];

    function showAddToPlaylistModal(clips) {
        _pendingClipsForPlaylist = Array.isArray(clips) ? clips : [clips];
        renderPlaylistModalList();
        $('#modal-add-to-playlist').classList.remove('hidden');
    }

    function renderPlaylistModalList() {
        const list = $('#playlist-select-list');
        const playlists = AppState.get('playlists');
        list.innerHTML = '';
        if (playlists.length === 0) {
            list.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">No hay playlists. Creá una acá arriba.</p>';
        } else {
            playlists.forEach(pl => {
                const btn = document.createElement('button');
                btn.className = 'playlist-select-item';
                btn.textContent = pl.name;
                btn.addEventListener('click', () => {
                    _pendingClipsForPlaylist.forEach(clipId => {
                        AppState.addClipToPlaylist(pl.id, clipId);
                    });
                    const clipCount = _pendingClipsForPlaylist.length;
                    AppState.addActivity('playlist_updated', { playlistName: pl.name, playlistId: pl.id, clipCount });
                    const msg = clipCount > 1
                        ? `${clipCount} clips agregados a "${pl.name}"`
                        : `Clip agregado a "${pl.name}"`;
                    toast(msg, 'success');
                    if (clipCount > 1) {
                        clearClipSelection();
                        renderViewClips();
                    }
                    hideModal('modal-add-to-playlist');
                });
                list.appendChild(btn);
            });
        }
    }

    function showModal(id) {
        const modal = $('#' + id);
        modal.classList.remove('hidden');
    }

    function hideModal(id) {
        const modal = $('#' + id);
        modal.classList.add('hidden');
    }

    // ═══ FULL REFRESH ═══
    function refreshAll() {
        renderGameSelector();
        renderTagButtons();
        updateNoGameOverlay();
        updateMode();
        renderAnalyzePlaylists();
        updatePanelState();
        updateFocusView();
        renderNotifications();
    }

    // ═══ TAG EDITOR ═══
    function toggleTagEditor() {
        _tagEditMode = !_tagEditMode;
        _editingTagId = null;
        const btn = $('#btn-toggle-tag-editor');
        const inlineEditor = $('#tag-editor-inline');
        btn.classList.toggle('active', _tagEditMode);
        inlineEditor.style.display = 'none';
        renderTagButtons();
    }

    function openTagInlineEditor(tag, defaultRow) {
        const inlineEditor = $('#tag-editor-inline');
        const isNewTag = !tag;
        _editingTagId = tag ? tag.id : '__new__';

        // Populate fields
        $('#edit-tag-label').value = tag ? tag.label : '';
        $('#edit-tag-pre').value = tag ? tag.pre_sec : 3;
        $('#edit-tag-post').value = tag ? tag.post_sec : 8;
        $('#edit-tag-row').value = tag ? tag.row : (defaultRow || 'top');

        // Show/hide delete button
        $('#btn-delete-tag').style.display = isNewTag ? 'none' : 'inline-flex';
        // Change save label
        $('#btn-save-tag').textContent = isNewTag ? '+ Crear' : 'Guardar';

        inlineEditor.style.display = 'block';
        renderTagButtons(); // re-render to highlight the editing tag

        // Focus the label input
        setTimeout(() => $('#edit-tag-label').focus(), 50);
    }

    function closeTagInlineEditor() {
        _editingTagId = null;
        $('#tag-editor-inline').style.display = 'none';
        renderTagButtons();
    }

    function saveTagFromEditor() {
        const label = $('#edit-tag-label').value.trim();
        if (!label) { toast('Ingresá un nombre', 'error'); return; }
        const pre_sec = parseInt($('#edit-tag-pre').value, 10) || 3;
        const post_sec = parseInt($('#edit-tag-post').value, 10) || 8;
        const row = $('#edit-tag-row').value;

        if (_editingTagId === '__new__') {
            const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
            AppState.addTagType({ key, label, row, pre_sec, post_sec });
            toast(`Tag creado: ${label}`, 'success');
        } else {
            AppState.updateTagType(_editingTagId, { label, pre_sec, post_sec, row });
            toast(`Tag actualizado: ${label}`, 'success');
        }
        closeTagInlineEditor();
    }

    function deleteTagFromEditor() {
        if (_editingTagId && _editingTagId !== '__new__') {
            AppState.deleteTagType(_editingTagId);
            toast('Tag eliminado', 'success');
        }
        closeTagInlineEditor();
    }

    return {
        $, $$, toast, formatTime,
        FLAG_EMOJI, FLAG_LABELS,
        renderGameSelector, renderTagButtons,
        renderAnalyzeClips, renderViewClips,
        updateClipEditControls,
        renderAnalyzePlaylists,
        renderViewSources, updateFlagFilterBar, updateFlagButtons,
        updateFocusView, updatePanelState, updateMode,
        updateNoGameOverlay,
        showAddToPlaylistModal, renderPlaylistModalList, showModal, hideModal,
        toggleTagEditor, saveTagFromEditor, deleteTagFromEditor, closeTagInlineEditor,
        getSelectedClipIds, clearClipSelection, renderNotifications,
        refreshAll
    };
})();
