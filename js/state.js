/* ═══════════════════════════════════════════
   SimpleReplay — State Management
   Simple event-driven store
   ═══════════════════════════════════════════ */

const AppState = (() => {
  // Internal state
  const state = {
    mode: 'analyze',           // 'analyze' | 'view'
    currentGameId: null,
    currentClipId: null,
    currentClipIndex: -1,
    panelCollapsed: false,
    focusView: false,

    // Data
    games: [],
    tagTypes: [],
    clips: [],                 // clips for current game
    playlists: [],             // playlists for current game
    playlistItems: {},         // { playlistId: [clipId, ...] }
    clipFlags: {},             // { clipId: [{ flag, userId }] }
    playlistComments: {},       // { "playlistId::clipId": [{ name, text, timestamp }] }
    activityLog: [],            // [{ type, name, playlistName, clipCount, timestamp }]

    // View mode filters
    activeTagFilters: [],      // array of tag type IDs
    activePlaylistId: null,    // single playlist ID or null
    filterFlags: [],           // active flag filters

    // Simulated user
    userId: 'demo-user-001',

    // Cloud project
    currentProjectId: null,
  };

  // Listeners
  const listeners = {};

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function off(event, cb) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(fn => fn !== cb);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(cb => cb(data));
  }

  // Getters
  function get(key) { return state[key]; }

  function getCurrentGame() {
    return state.games.find(g => g.id === state.currentGameId) || null;
  }

  function getCurrentClip() {
    return state.clips.find(c => c.id === state.currentClipId) || null;
  }

  function getTagType(id) {
    return state.tagTypes.find(t => t.id === id);
  }

  function getFilteredClips() {
    let clips = [...state.clips];

    // Filter by playlist (exclusive)
    if (state.activePlaylistId) {
      const itemClipIds = state.playlistItems[state.activePlaylistId] || [];
      clips = clips.filter(c => itemClipIds.includes(c.id));
    }

    // Filter by tags (any of selected, additive)
    if (state.activeTagFilters.length > 0) {
      clips = clips.filter(c => state.activeTagFilters.includes(c.tag_type_id));
    }

    // Filter by flags and/or chat (cross-filter)
    if (state.filterFlags.length > 0) {
      const realFlags = state.filterFlags.filter(f => f !== 'has_chat');
      const wantChat = state.filterFlags.includes('has_chat');
      clips = clips.filter(c => {
        let match = false;
        if (realFlags.length > 0) {
          const flags = (state.clipFlags[c.id] || [])
            .filter(f => f.userId === state.userId)
            .map(f => f.flag);
          match = realFlags.some(ff => flags.includes(ff));
        }
        if (wantChat) {
          // Check if clip has comments in any playlist
          match = match || Object.keys(state.playlistComments).some(key => {
            return key.endsWith('::' + c.id) && state.playlistComments[key].length > 0;
          });
        }
        return match;
      });
    }

    // Sort by t_sec
    clips.sort((a, b) => a.t_sec - b.t_sec);
    return clips;
  }

  function getClipUserFlags(clipId) {
    return (state.clipFlags[clipId] || [])
      .filter(f => f.userId === state.userId)
      .map(f => f.flag);
  }

  // Setters / mutations
  function setMode(mode) {
    state.mode = mode;
    emit('modeChanged', mode);
  }

  function setCurrentGame(gameId) {
    state.currentGameId = gameId;
    state.currentClipId = null;
    state.currentClipIndex = -1;
    // Load clips/playlists for this game
    const game = getCurrentGame();
    if (game) {
      state.clips = DemoData.getClipsForGame(gameId);
      state.playlists = DemoData.getPlaylistsForGame(gameId);
      state.playlistItems = {};
      state.playlists.forEach(pl => {
        state.playlistItems[pl.id] = DemoData.getPlaylistItems(pl.id);
      });
      // Load flags for all clips
      state.clipFlags = {};
      state.clips.forEach(c => {
        state.clipFlags[c.id] = DemoData.getClipFlags(c.id);
      });
    } else {
      state.clips = [];
      state.playlists = [];
      state.playlistItems = {};
      state.clipFlags = {};
    }
    state.activeTagFilters = [];
    state.activePlaylistId = null;
    state.filterFlags = [];
    emit('gameChanged', game);
  }

  function setCurrentClip(clipId) {
    state.currentClipId = clipId;
    const filtered = getFilteredClips();
    state.currentClipIndex = filtered.findIndex(c => c.id === clipId);
    emit('clipChanged', getCurrentClip());
  }

  function addGame(title, youtubeVideoId, videoType = 'youtube') {
    const game = DemoData.createGame(title, youtubeVideoId, videoType);
    state.games = DemoData.getGames();
    emit('gamesUpdated', state.games);
    return game;
  }

  function renameGame(gameId, newTitle) {
    const success = DemoData.renameGame(gameId, newTitle);
    if (success) {
      state.games = DemoData.getGames();
      emit('gamesUpdated', state.games);
      const g = getCurrentGame();
      if (g && g.id === gameId) emit('gameChanged', g);
    }
    return success;
  }

  function duplicateGame(gameId) {
    const newGame = DemoData.duplicateGame(gameId);
    if (newGame) {
      state.games = DemoData.getGames();
      emit('gamesUpdated', state.games);
    }
    return newGame;
  }

  function updateGameVideo(gameId, source, type) {
    const success = DemoData.updateGameVideo(gameId, source, type);
    if (success) {
      state.games = DemoData.getGames();
      emit('gamesUpdated', state.games);
      const g = getCurrentGame();
      if (g && g.id === gameId) emit('gameChanged', g);
    }
    return success;
  }

  function addClip(tagTypeId, tSec) {
    const tag = getTagType(tagTypeId);
    if (!tag) return null;
    const startSec = Math.max(0, tSec - tag.pre_sec);
    const endSec = tSec + tag.post_sec;
    if (endSec <= startSec) return null;

    const clip = DemoData.createClip(state.currentGameId, tagTypeId, tSec, startSec, endSec);
    state.clips = DemoData.getClipsForGame(state.currentGameId);
    state.clipFlags[clip.id] = [];
    emit('clipsUpdated', state.clips);
    return clip;
  }

  function updateClip(clipId, data) {
    const clip = state.clips.find(c => c.id === clipId);
    if (!clip) return;
    Object.assign(clip, data);
    DemoData.updateClip(clipId, data);
    emit('clipsUpdated', state.clips);
    emit('clipChanged', clip);
  }

  function updateClipBounds(clipId, field, delta) {
    const clip = state.clips.find(c => c.id === clipId);
    if (!clip) return;

    if (field === 'start_sec') {
      clip.start_sec = Math.max(0, clip.start_sec + delta);
      if (clip.start_sec >= clip.end_sec) clip.start_sec = clip.end_sec - 1;
    } else if (field === 'end_sec') {
      clip.end_sec = clip.end_sec + delta;
      if (clip.end_sec <= clip.start_sec) clip.end_sec = clip.start_sec + 1;
    }
    DemoData.updateClip(clipId, { start_sec: clip.start_sec, end_sec: clip.end_sec });
    emit('clipsUpdated', state.clips);
    emit('clipChanged', clip);
  }

  function deleteClip(clipId) {
    DemoData.deleteClip(clipId);
    state.clips = DemoData.getClipsForGame(state.currentGameId);
    if (state.currentClipId === clipId) {
      state.currentClipId = null;
      state.currentClipIndex = -1;
    }
    delete state.clipFlags[clipId];
    emit('clipsUpdated', state.clips);
    emit('clipChanged', null);
  }

  function addPlaylist(name) {
    const pl = DemoData.createPlaylist(state.currentGameId, name);
    state.playlists = DemoData.getPlaylistsForGame(state.currentGameId);
    state.playlistItems[pl.id] = [];
    emit('playlistsUpdated', state.playlists);
    return pl;
  }

  function addClipToPlaylist(playlistId, clipId) {
    DemoData.addClipToPlaylist(playlistId, clipId);
    state.playlistItems[playlistId] = DemoData.getPlaylistItems(playlistId);
    emit('playlistsUpdated', state.playlists);
  }

  function toggleFlag(clipId, flag) {
    const flags = getClipUserFlags(clipId);
    if (flags.includes(flag)) {
      DemoData.removeFlag(clipId, state.userId, flag);
    } else {
      DemoData.addFlag(clipId, state.userId, flag);
    }
    state.clipFlags[clipId] = DemoData.getClipFlags(clipId);
    emit('flagsUpdated', { clipId, flags: getClipUserFlags(clipId) });
  }

  function toggleTagFilter(tagId) {
    if (state.activeTagFilters.length === 1 && state.activeTagFilters[0] === tagId) {
      // Same tag clicked again → deselect
      state.activeTagFilters = [];
    } else {
      // Replace with this single tag
      state.activeTagFilters = [tagId];
    }
    // Clear playlist when using tags (UNLESS locked)
    const urlParams = new URLSearchParams(window.location.search);
    if (!(urlParams.get('mode') === 'view' && urlParams.get('playlist'))) {
      state.activePlaylistId = null;
    }

    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function removeTagFilter(tagId) {
    const idx = state.activeTagFilters.indexOf(tagId);
    if (idx >= 0) state.activeTagFilters.splice(idx, 1);
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function clearTagFilters() {
    state.activeTagFilters = [];

    // Do not clear playlist if locked
    const urlParams = new URLSearchParams(window.location.search);
    if (!(urlParams.get('mode') === 'view' && urlParams.get('playlist'))) {
      state.activePlaylistId = null;
    }

    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function clearAllFilters() {
    state.activeTagFilters = [];

    // Do not clear playlist if locked
    const urlParams = new URLSearchParams(window.location.search);
    if (!(urlParams.get('mode') === 'view' && urlParams.get('playlist'))) {
      state.activePlaylistId = null;
    }

    state.filterFlags = [];
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function setPlaylistFilter(playlistId) {
    state.activePlaylistId = playlistId;
    state.activeTagFilters = []; // playlists are exclusive
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function clearPlaylistFilter() {
    // Hard-lock: cannot clear if viewing a specifically shared playlist
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'view' && urlParams.get('playlist')) {
      console.warn('Blocked attempt to clear locked shared playlist');
      return;
    }

    state.activePlaylistId = null;
    state.currentClipId = null;
    state.currentClipIndex = -1;
    emit('viewFiltersChanged');
  }

  function toggleFilterFlag(flag) {
    const idx = state.filterFlags.indexOf(flag);
    if (idx >= 0) {
      state.filterFlags.splice(idx, 1);
    } else {
      state.filterFlags.push(flag);
    }
    emit('viewFiltersChanged');
  }

  function clearFilterFlags() {
    state.filterFlags = [];
    emit('viewFiltersChanged');
  }

  // Tag CRUD
  function addTagType(data) {
    const tag = DemoData.createTagType(data);
    state.tagTypes = DemoData.getTagTypes();
    emit('tagTypesUpdated', state.tagTypes);
    return tag;
  }

  function updateTagType(id, changes) {
    DemoData.updateTagType(id, changes);
    state.tagTypes = DemoData.getTagTypes();
    emit('tagTypesUpdated', state.tagTypes);
  }

  function deleteTagType(id) {
    DemoData.deleteTagType(id);
    state.tagTypes = DemoData.getTagTypes();
    emit('tagTypesUpdated', state.tagTypes);
  }

  function togglePanel() {
    state.panelCollapsed = !state.panelCollapsed;
    emit('panelToggled', state.panelCollapsed);
  }

  function toggleFocusView() {
    state.focusView = !state.focusView;
    if (state.focusView && !state.panelCollapsed) {
      state.panelCollapsed = true;
      emit('panelToggled', true);
    } else if (!state.focusView && state.panelCollapsed) {
      state.panelCollapsed = false;
      emit('panelToggled', false);
    }
    emit('focusViewToggled', state.focusView);
  }

  function navigateClip(direction) {
    const filtered = getFilteredClips();
    if (filtered.length === 0) return;
    let idx = state.currentClipIndex;
    if (direction === 'next') {
      idx = Math.min(filtered.length - 1, idx + 1);
    } else {
      idx = Math.max(0, idx - 1);
    }
    if (idx >= 0 && idx < filtered.length) {
      setCurrentClip(filtered[idx].id);
    }
  }

  function init() {
    state.tagTypes = DemoData.getTagTypes();
    state.games = DemoData.getGames();
    emit('initialized', state);
  }

  function clearProject() {
    state.currentGameId = null;
    state.currentClipId = null;
    state.currentClipIndex = -1;
    state.games = [];
    state.clips = [];
    state.playlists = [];
    state.playlistItems = {};
    state.clipFlags = {};
    state.playlistComments = {};
    state.activityLog = [];
    state.activeTagFilters = [];
    state.activePlaylistId = null;
    state.filterFlags = [];
    state.currentProjectId = null;
    emit('gameChanged', null);
  }

  // ── Chat / Comments (per playlist) ──
  function addComment(playlistId, clipId, name, text, drawing, videoTimeSec) {
    const key = playlistId + '::' + clipId;
    if (!state.playlistComments[key]) state.playlistComments[key] = [];
    const comment = {
      name,
      text,
      timestamp: new Date().toISOString()
    };
    // Optional drawing data (PNG data URL)
    if (drawing) {
      comment.drawing = drawing;
      comment.videoTimeSec = videoTimeSec !== undefined ? videoTimeSec : null;
    }
    state.playlistComments[key].push(comment);
    emit('commentAdded', { playlistId, clipId, comment });
    if (drawing) emit('clipCommentsUpdated');
    return comment;
  }

  function getComments(playlistId, clipId) {
    const key = playlistId + '::' + clipId;
    return state.playlistComments[key] || [];
  }

  // Helper: get sequential clip number per tag type
  function getClipNumber(clip) {
    const allClips = state.clips.filter(c => c.tag_type_id === clip.tag_type_id);
    allClips.sort((a, b) => a.t_sec - b.t_sec);
    const idx = allClips.findIndex(c => c.id === clip.id);
    return idx + 1;
  }

  // ── Activity Log ──
  function addActivity(type, details) {
    const name = (typeof localStorage !== 'undefined' && localStorage.getItem('sr_chat_name')) || 'Anónimo';
    const entry = {
      type,
      name,
      ...details,
      timestamp: new Date().toISOString()
    };
    state.activityLog.push(entry);
    emit('activityLogUpdated', entry);
    return entry;
  }

  function getActivityLog() {
    return state.activityLog;
  }

  // ── Cloud save/load ──
  async function saveToCloud() {
    const game = getCurrentGame();
    const data = {
      title: game ? game.title : 'Sin título',
      youtubeVideoId: game ? game.youtube_video_id : '',
      videoType: game ? (game.videoType || 'youtube') : 'youtube',
      tagTypes: state.tagTypes,
      games: state.games,
      clips: state.clips,
      playlists: state.playlists,
      playlistItems: state.playlistItems,
      clipFlags: state.clipFlags,
      playlistComments: state.playlistComments,
      activityLog: state.activityLog,
    };
    const projectId = await FirebaseData.saveProject(state.currentProjectId, data);
    state.currentProjectId = projectId;

    // Update URL only if we are the owner creating/editing the project
    // If the viewer is auto-saving a comment, don't destroy their playlist/view URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') !== 'view') {
      const url = FirebaseData.getShareUrl(projectId);
      window.history.replaceState({}, '', url);
    }

    emit('projectSaved', projectId);
    return projectId;
  }

  async function loadFromCloud(projectId) {
    const data = await FirebaseData.loadProject(projectId);
    if (!data) return false;

    state.currentProjectId = projectId;
    state.tagTypes = data.tagTypes || [];
    state.games = data.games || [];
    state.clips = data.clips || [];
    state.playlists = data.playlists || [];
    state.playlistItems = data.playlistItems || {};
    state.clipFlags = data.clipFlags || {};
    state.playlistComments = data.playlistComments || {};
    state.activityLog = data.activityLog || [];

    // Sync DemoData so local mutations work with cloud data
    // This maintains the single source of truth for clips/playlists
    DemoData.restore(data);

    // Select the first game if any
    if (state.games.length > 0) {
      state.currentGameId = state.games[0].id;
    }

    state.activeTagFilters = [];
    state.activePlaylistId = null;
    state.filterFlags = [];
    state.currentClipId = null;
    state.currentClipIndex = -1;

    emit('projectLoaded', data);
    emit('gameChanged', getCurrentGame());
    return true;
  }

  // ── XML Import / Export ──
  function importXML(xmlString) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "application/xml");

      const parserError = xmlDoc.querySelector("parsererror");
      if (parserError) {
        console.error("XML Parsing Error:", parserError.textContent);
        return false;
      }

      // 1. Extract Rows (Tag Colors/Names)
      const rows = xmlDoc.querySelectorAll("ROWS > row");
      const codeToTagMap = {};

      rows.forEach(row => {
        const codeEl = row.querySelector("code");
        if (!codeEl) return;
        const code = codeEl.textContent.trim();

        let existingTag = state.tagTypes.find(t => t.label === code);
        if (!existingTag) {
          existingTag = {
            id: 'tag_' + Date.now() + Math.random().toString(36).substring(2, 9),
            label: code,
            pre_sec: 5,
            post_sec: 5,
            row: 'top', // default
            isHidden: true
          };
          // Rough heuristic for rival vs top based on name (e.g., LEUV vs DARI)
          // But since we can't be sure, default top. 
          state.tagTypes.push(existingTag);
        }
        codeToTagMap[code] = existingTag.id;
      });

      // 2. Extract Instances (Clips)
      const instances = xmlDoc.querySelectorAll("ALL_INSTANCES > instance");
      let clipCount = 0;

      instances.forEach(inst => {
        const startEl = inst.querySelector("start");
        const endEl = inst.querySelector("end");
        const codeEl = inst.querySelector("code");

        if (!startEl || !endEl || !codeEl) return;

        const code = codeEl.textContent.trim();
        let tagId = codeToTagMap[code];

        // If instance has a code not defined in rows, create tag dynamically
        if (!tagId) {
          let existingTag = state.tagTypes.find(t => t.label === code);
          if (!existingTag) {
            existingTag = {
              id: 'tag_' + Date.now() + Math.random().toString(36).substring(2, 9),
              label: code,
              pre_sec: 5,
              post_sec: 5,
              row: 'top',
              isHidden: true
            };
            state.tagTypes.push(existingTag);
          }
          codeToTagMap[code] = existingTag.id;
          tagId = existingTag.id;
        }

        const startSec = parseFloat(startEl.textContent) || 0;
        const endSec = parseFloat(endEl.textContent) || 0;

        // Add clip
        const clip = {
          id: 'clip_' + Date.now() + Math.random().toString(36).substring(2, 9),
          game_id: state.currentGameId,
          tag_type_id: tagId,
          t_sec: startSec,
          start_sec: startSec,
          end_sec: endSec
        };
        state.clips.push(clip);
        clipCount++;
      });

      emit('tagTypesUpdated');
      emit('clipsUpdated');
      // Add trace to activity log
      addActivity('xml_import', { count: clipCount });

      return clipCount;

    } catch (e) {
      console.error('Error importing XML:', e);
      return false;
    }
  }

  function exportXML() {
    const gameId = state.currentGameId;
    if (!gameId) return null;

    // Filter clips for current game
    const gameClips = state.clips.filter(c => c.game_id === gameId);

    // Determine which tags are used and present
    const usedTagIds = new Set(gameClips.map(c => c.tag_type_id));
    const usedTags = state.tagTypes.filter(t => usedTagIds.has(t.id));

    let xml = `<?xml version="1.0" encoding="utf-8"?>\n<file>\n`;

    // --- ALL_INSTANCES ---
    xml += `<ALL_INSTANCES>\n`;
    gameClips.forEach((clip, index) => {
      const tag = state.tagTypes.find(t => t.id === clip.tag_type_id);
      const code = tag ? tag.label : 'Unknown';

      xml += `  <instance>\n`;
      xml += `    <ID>${index + 1}</ID>\n`;
      xml += `    <start>${clip.start_sec}</start>\n`;
      xml += `    <end>${clip.end_sec}</end>\n`;
      xml += `    <code>${code}</code>\n`;
      xml += `  </instance>\n`;
    });
    xml += `</ALL_INSTANCES>\n`;

    // --- ROWS ---
    xml += `<ROWS>\n`;
    usedTags.forEach(tag => {
      // Default color if custom colors are implemented later
      // Using generic neutral/team colors for XML structure
      let r = 65535, g = 65535, b = 65535;
      if (tag.row === 'bottom') {
        r = 65535; g = 20000; b = 20000; // Red-ish for rival
      } else {
        r = 20000; g = 20000; b = 65535; // Blue-ish for own team
      }

      xml += `  <row>\n`;
      xml += `    <code>${tag.label}</code>\n`;
      xml += `    <R>${r}</R>\n`;
      xml += `    <G>${g}</G>\n`;
      xml += `    <B>${b}</B>\n`;
      xml += `  </row>\n`;
    });
    xml += `</ROWS>\n`;

    xml += `</file>`;

    return xml;
  }

  return {
    on, off, emit, get, init, clearProject,
    getCurrentGame, getCurrentClip, getTagType,
    getFilteredClips, getClipUserFlags,
    setMode, setCurrentGame, setCurrentClip,
    addGame, renameGame, duplicateGame, updateGameVideo,
    addClip, updateClip, updateClipBounds, deleteClip,
    addPlaylist, addClipToPlaylist,
    toggleFlag,
    toggleTagFilter, removeTagFilter, clearTagFilters, clearAllFilters,
    setPlaylistFilter, clearPlaylistFilter,
    toggleFilterFlag, clearFilterFlags,
    addTagType, updateTagType, deleteTagType,
    togglePanel, toggleFocusView, navigateClip,
    saveToCloud, loadFromCloud,
    addComment, getComments, getClipNumber,
    addActivity, getActivityLog,
    importXML, exportXML
  };
})();
