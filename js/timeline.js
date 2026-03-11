const Timeline = (() => {
    let _interval = null;
    let _isDragging = false;
    let _dragType = null; // 'playhead', 'clip-start', 'clip-end'
    let _dragClipId = null;

    let _timelineEl, _progressEl, _playheadEl, _timeLabelEl, _clipsContainerEl;

    function init() {
        _timelineEl = document.getElementById('custom-timeline');
        _progressEl = document.getElementById('timeline-progress');
        _playheadEl = document.getElementById('timeline-playhead');
        _timeLabelEl = document.getElementById('playhead-time');
        _clipsContainerEl = document.getElementById('timeline-clips');

        if (!_timelineEl) return;

        _timelineEl.classList.remove('hidden');

        // Start polling
        _interval = setInterval(update, 100);

        // Event listeners
        _timelineEl.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // Listen for state changes to re-render clips
        AppState.on('stateChanged', renderClips);
        AppState.on('clipSelectionChanged', renderClips);
        AppState.on('gameChanged', () => setTimeout(renderClips, 1000));
    }

    function formatTime(sec) {
        if (!sec || isNaN(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    function update() {
        if (_isDragging && _dragType === 'playhead') return; // skip playhead update if dragging it
        if (typeof YTPlayer === 'undefined' || !YTPlayer.isReady()) return;

        try {
            const current = YTPlayer.getCurrentTime();
            const duration = YTPlayer.getDuration();

            if (duration > 0) {
                const percent = (current / duration) * 100;
                updatePlayhead(percent, current);
            }
        } catch (e) { }
    }

    function updatePlayhead(percent, currentSec) {
        if (!_progressEl || !_playheadEl) return;
        const boundedPercent = Math.max(0, Math.min(percent, 100));
        _progressEl.style.width = `${boundedPercent}%`;
        _playheadEl.style.left = `${boundedPercent}%`;
        if (_timeLabelEl) {
            _timeLabelEl.textContent = formatTime(currentSec);
        }
    }

    function getSecFromEvent(e) {
        if (typeof YTPlayer === 'undefined' || !YTPlayer.isReady()) return 0;
        const rect = _timelineEl.getBoundingClientRect();
        let x = e.clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));
        const percent = x / rect.width;
        return percent * YTPlayer.getDuration();
    }

    function onMouseDown(e) {
        if (typeof YTPlayer === 'undefined' || !YTPlayer.isReady()) return;

        const target = e.target;
        if (target.classList.contains('clip-stretch-handle')) {
            _isDragging = true;
            _dragType = target.classList.contains('left') ? 'clip-start' : 'clip-end';
            _dragClipId = target.dataset.clipId;
            e.stopPropagation();
            return;
        }

        // Otherwise seek
        _isDragging = true;
        _dragType = 'playhead';

        const sec = getSecFromEvent(e);
        YTPlayer.seekTo(sec);
        updatePlayhead((sec / YTPlayer.getDuration()) * 100, sec);
    }

    function onMouseMove(e) {
        if (!_isDragging) return;

        const sec = getSecFromEvent(e);
        const duration = YTPlayer.getDuration();
        if (duration <= 0) return;

        if (_dragType === 'playhead') {
            YTPlayer.seekTo(sec);
            updatePlayhead((sec / duration) * 100, sec);
        }
        else if (_dragType === 'clip-start' || _dragType === 'clip-end') {
            // Live preview
            YTPlayer.seekTo(sec);
            updatePlayhead((sec / duration) * 100, sec);

            // Update clip visual immediately for smooth dragging
            const clipEl = document.querySelector(`.timeline-clip-segment[data-clip-id="${_dragClipId}"]`);
            if (clipEl) {
                const clip = AppState.get('clips').find(c => c.id === _dragClipId);
                if (clip) {
                    let newStart = clip.start_sec;
                    let newEnd = clip.end_sec;

                    if (_dragType === 'clip-start') {
                        newStart = Math.min(sec, clip.end_sec - 1);
                    } else {
                        newEnd = Math.max(sec, clip.start_sec + 1);
                    }

                    const leftPct = (newStart / duration) * 100;
                    const widthPct = ((newEnd - newStart) / duration) * 100;

                    clipEl.style.left = `${Math.max(0, Math.min(leftPct, 100))}%`;
                    clipEl.style.width = `${Math.max(0, Math.min(widthPct, 100))}%`;
                }
            }
        }
    }

    function onMouseUp(e) {
        if (!_isDragging) return;

        const sec = getSecFromEvent(e);

        if (_dragType === 'clip-start' || _dragType === 'clip-end') {
            const clip = AppState.get('clips').find(c => c.id === _dragClipId);
            if (clip) {
                let finalStart = clip.start_sec;
                let finalEnd = clip.end_sec;

                if (_dragType === 'clip-start') {
                    finalStart = Math.min(sec, clip.end_sec - 1);
                } else {
                    finalEnd = Math.max(sec, clip.start_sec + 1);
                }

                // Directly update the bounds in the state without triggering multiple plays
                AppState.updateClipBounds(_dragClipId, finalStart, finalEnd);
                if (typeof UI !== 'undefined' && UI.toast) {
                    UI.toast('Límites de clip actualizados', 'success');
                }
            }
        }

        _isDragging = false;
        _dragType = null;
        _dragClipId = null;
    }

    function renderClips() {
        if (!_clipsContainerEl) return;
        _clipsContainerEl.innerHTML = '';

        if (typeof YTPlayer === 'undefined' || !YTPlayer.isReady()) {
            setTimeout(renderClips, 1000); // retry if player not ready
            return;
        }

        const duration = YTPlayer.getDuration();
        if (duration <= 0) {
            setTimeout(renderClips, 1000); // try again later if metadata isn't fully loaded
            return;
        }

        const mode = AppState.get('mode');
        let clips = [];

        // Decide what clips to show
        if (mode === 'analyze') {
            clips = AppState.get('clips');
        } else {
            clips = AppState.getFilteredClips();
        }

        const currentClipId = AppState.get('currentClipId');

        clips.forEach(clip => {
            const leftPct = (clip.start_sec / duration) * 100;
            const widthPct = ((clip.end_sec - clip.start_sec) / duration) * 100;

            const el = document.createElement('div');
            el.className = 'timeline-clip-segment';
            el.dataset.clipId = clip.id;
            el.style.left = `${Math.max(0, Math.min(leftPct, 100))}%`;
            el.style.width = `${Math.max(0, Math.min(widthPct, 100))}%`;

            // Active clip glows more
            if (clip.id === currentClipId) {
                el.style.background = 'var(--accent)';
                el.style.zIndex = '5';
            }

            // Handles
            const handleLeft = document.createElement('div');
            handleLeft.className = 'clip-stretch-handle left';
            handleLeft.dataset.clipId = clip.id;
            el.appendChild(handleLeft);

            const handleRight = document.createElement('div');
            handleRight.className = 'clip-stretch-handle right';
            handleRight.dataset.clipId = clip.id;
            el.appendChild(handleRight);

            // Clicking the segment should seek to start of clip
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('clip-stretch-handle')) return; // ignore handle clicks
                e.stopPropagation(); // prevent background seek
                AppState.setCurrentClip(clip.id);
                YTPlayer.playClip(clip.start_sec, clip.end_sec);
            });

            _clipsContainerEl.appendChild(el);
        });
    }

    return { init, renderClips };
})();

// Provide it globally
window.Timeline = Timeline;
