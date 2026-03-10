/* ═══════════════════════════════════════════
   SimpleReplay — Drawing Annotation Tool
   Canvas overlay on video for freehand drawing
   ═══════════════════════════════════════════ */

const DrawingTool = (() => {
    'use strict';

    let _canvas = null;
    let _ctx = null;
    let _toolbar = null;
    let _active = false;
    let _drawing = false;
    let _playlistId = null;
    let _clipId = null;
    let _videoTimestamp = 0; // exact second in the video when drawing was started

    // Drawing state
    let _color = '#ff3b3b';
    let _lineWidth = 4;
    let _tool = 'pen'; // 'pen' | 'eraser'
    let _strokes = []; // array of stroke objects for undo
    let _currentStroke = null;

    // ── Init (called once on app load) ──
    function init() {
        _canvas = document.getElementById('drawing-canvas');
        _toolbar = document.getElementById('drawing-toolbar');
        if (!_canvas || !_toolbar) return;
        _ctx = _canvas.getContext('2d');

        // Mouse events
        _canvas.addEventListener('mousedown', _onPointerDown);
        _canvas.addEventListener('mousemove', _onPointerMove);
        _canvas.addEventListener('mouseup', _onPointerUp);
        _canvas.addEventListener('mouseleave', _onPointerUp);

        // Touch events
        _canvas.addEventListener('touchstart', _onTouchStart, { passive: false });
        _canvas.addEventListener('touchmove', _onTouchMove, { passive: false });
        _canvas.addEventListener('touchend', _onTouchEnd);
        _canvas.addEventListener('touchcancel', _onTouchEnd);

        // Toolbar buttons
        _toolbar.querySelector('[data-action="draw-save"]').addEventListener('click', save);
        _toolbar.querySelector('[data-action="draw-cancel"]').addEventListener('click', close);
        _toolbar.querySelector('[data-action="draw-clear"]').addEventListener('click', clearCanvas);
        _toolbar.querySelector('[data-action="draw-undo"]').addEventListener('click', undo);

        // Color swatches
        _toolbar.querySelectorAll('.draw-color-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                _color = swatch.dataset.color;
                _tool = 'pen';
                _updateToolbar();
            });
        });

        // Eraser
        _toolbar.querySelector('[data-action="draw-eraser"]').addEventListener('click', () => {
            _tool = _tool === 'eraser' ? 'pen' : 'eraser';
            _updateToolbar();
        });

        // Brush size
        const sizeSlider = _toolbar.querySelector('#draw-size');
        if (sizeSlider) {
            sizeSlider.addEventListener('input', () => {
                _lineWidth = parseInt(sizeSlider.value, 10);
            });
        }
    }

    // ── Open drawing mode ──
    function open(playlistId, clipId) {
        if (_active) return;
        _playlistId = playlistId;
        _clipId = clipId;
        _active = true;
        _strokes = [];
        _currentStroke = null;
        _tool = 'pen';
        _color = '#ff3b3b';
        _lineWidth = 4;

        // Capture exact video timestamp
        _videoTimestamp = YTPlayer.getCurrentTime();

        // Pause the video
        YTPlayer.pause();

        // Resize canvas to match player container
        _resizeCanvas();

        // Show canvas & toolbar
        _canvas.classList.add('active');
        _toolbar.classList.add('active');

        // Clear
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        _updateToolbar();

        // Listen for window resize
        window.addEventListener('resize', _resizeCanvas);
    }

    // ── Close drawing mode (no save) ──
    function close() {
        if (!_active) return;
        _active = false;
        _canvas.classList.remove('active');
        _toolbar.classList.remove('active');
        window.removeEventListener('resize', _resizeCanvas);
        _strokes = [];
        _currentStroke = null;
    }

    // ── Save drawing as comment ──
    function save() {
        if (!_active) return;
        if (_strokes.length === 0) {
            UI.toast('Dibujá algo antes de guardar', 'error');
            return;
        }

        const dataUrl = _canvas.toDataURL('image/png');
        const savedName = localStorage.getItem('sr_chat_name') || 'Anónimo';

        // Use the extended addComment with drawing data
        AppState.addComment(_playlistId, _clipId, savedName, '🎨 Dibujo', dataUrl, _videoTimestamp);

        UI.toast('Dibujo guardado ✏️', 'success');
        close();
    }

    // ── Clear canvas ──
    function clearCanvas() {
        _strokes = [];
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    }

    // ── Undo last stroke ──
    function undo() {
        if (_strokes.length === 0) return;
        _strokes.pop();
        _redraw();
    }

    // ── Redraw all strokes ──
    function _redraw() {
        _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
        _strokes.forEach(stroke => {
            _ctx.beginPath();
            _ctx.strokeStyle = stroke.color;
            _ctx.lineWidth = stroke.width;
            _ctx.lineCap = 'round';
            _ctx.lineJoin = 'round';
            _ctx.globalCompositeOperation = stroke.eraser ? 'destination-out' : 'source-over';

            stroke.points.forEach((pt, i) => {
                if (i === 0) _ctx.moveTo(pt.x, pt.y);
                else _ctx.lineTo(pt.x, pt.y);
            });
            _ctx.stroke();
        });
        _ctx.globalCompositeOperation = 'source-over';
    }

    // ── Pointer events ──
    function _onPointerDown(e) {
        if (!_active) return;
        _drawing = true;
        const rect = _canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        _currentStroke = {
            color: _tool === 'eraser' ? '#000' : _color,
            width: _tool === 'eraser' ? _lineWidth * 3 : _lineWidth,
            eraser: _tool === 'eraser',
            points: [{ x, y }]
        };
        _ctx.beginPath();
        _ctx.strokeStyle = _currentStroke.color;
        _ctx.lineWidth = _currentStroke.width;
        _ctx.lineCap = 'round';
        _ctx.lineJoin = 'round';
        _ctx.globalCompositeOperation = _currentStroke.eraser ? 'destination-out' : 'source-over';
        _ctx.moveTo(x, y);
    }

    function _onPointerMove(e) {
        if (!_drawing || !_currentStroke) return;
        const rect = _canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        _currentStroke.points.push({ x, y });
        _ctx.lineTo(x, y);
        _ctx.stroke();
        _ctx.beginPath();
        _ctx.moveTo(x, y);
    }

    function _onPointerUp() {
        if (!_drawing || !_currentStroke) return;
        _drawing = false;
        _ctx.globalCompositeOperation = 'source-over';
        if (_currentStroke.points.length > 1) {
            _strokes.push(_currentStroke);
        }
        _currentStroke = null;
    }

    // ── Touch events (mobile/tablet) ──
    function _onTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        _onPointerDown({ clientX: touch.clientX, clientY: touch.clientY });
    }

    function _onTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        _onPointerMove({ clientX: touch.clientX, clientY: touch.clientY });
    }

    function _onTouchEnd(e) {
        _onPointerUp();
    }

    // ── Resize canvas to fill player container ──
    function _resizeCanvas() {
        const container = document.getElementById('player-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        _canvas.width = rect.width;
        _canvas.height = rect.height;
        // Redraw after resize
        _redraw();
    }

    // ── Update toolbar active states ──
    function _updateToolbar() {
        _toolbar.querySelectorAll('.draw-color-swatch').forEach(swatch => {
            swatch.classList.toggle('active', swatch.dataset.color === _color && _tool === 'pen');
        });
        const eraserBtn = _toolbar.querySelector('[data-action="draw-eraser"]');
        if (eraserBtn) eraserBtn.classList.toggle('active', _tool === 'eraser');

        const sizeSlider = _toolbar.querySelector('#draw-size');
        if (sizeSlider) sizeSlider.value = _lineWidth;
    }

    // ── Show a saved drawing overlay on the video ──
    function showDrawingOverlay(dataUrl, videoTimeSec) {
        // Seek to the exact moment the drawing was made
        if (videoTimeSec !== undefined && videoTimeSec !== null) {
            YTPlayer.seekTo(videoTimeSec);
            YTPlayer.pause();
        }

        // Create or reuse overlay
        let overlay = document.getElementById('drawing-preview-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'drawing-preview-overlay';
            overlay.className = 'drawing-preview-overlay';
            document.getElementById('player-container').appendChild(overlay);
        }

        overlay.innerHTML = `<img src="${dataUrl}" alt="Dibujo" /><button class="drawing-preview-close" title="Cerrar">✕</button>`;
        overlay.classList.add('active');

        overlay.querySelector('.drawing-preview-close').addEventListener('click', () => {
            overlay.classList.remove('active');
        });

        // Click outside drawing to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    }

    function isActive() { return _active; }

    return { init, open, close, save, isActive, showDrawingOverlay };
})();
