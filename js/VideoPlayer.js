/* ═══════════════════════════════════════════
   SimpleReplay — Unified Video Player
   Supports both YouTube and Local Files
   ═══════════════════════════════════════════ */

const VideoPlayer = (() => {
    let _type = 'none'; // 'youtube' or 'local' or 'none'
    let _ytPlayer = null;
    let _localPlayer = null;
    let _ready = false;
    let _clipEndSec = null;
    let _pollTimer = null;
    let _onReadyCb = null;
    let _onTimeUpdateCb = null;

    function init() {
        _localPlayer = document.getElementById('local-video');

        // Attach local player events
        if (_localPlayer) {
            _localPlayer.addEventListener('timeupdate', _onLocalTimeUpdate);
            _localPlayer.addEventListener('loadedmetadata', () => {
                _ready = true;
                if (_onReadyCb) _onReadyCb();
            });
        }

        return new Promise((resolve) => {
            _onReadyCb = resolve;

            // Try to load YouTube API too
            if (window.YT && window.YT.Player) {
                _createYTPlayer(resolve);
            } else {
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                document.head.appendChild(tag);

                window.onYouTubeIframeAPIReady = () => {
                    _createYTPlayer(resolve);
                };

                // Safety timeout
                setTimeout(() => {
                    if (!_ready) {
                        console.warn('Player init timeout/fallback.');
                        resolve();
                    }
                }, 4000);
            }
        });
    }

    function _createYTPlayer(resolve) {
        _ytPlayer = new YT.Player('youtube-player', {
            height: '100%',
            width: '100%',
            playerVars: {
                autoplay: 0,
                controls: 1,
                modestbranding: 1,
                rel: 0,
                iv_load_policy: 3,
                fs: 1,
                playsinline: 1,
                origin: window.location.origin === "null" ? "*" : window.location.origin
            },
            events: {
                onReady: () => {
                    _ready = true;
                    if (resolve) resolve();
                },
                onStateChange: _onYTStateChange,
            }
        });
    }

    function _onYTStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            _startPoll();
        }
        if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
            _stopPoll();
        }
    }

    function onTimeUpdate(cb) {
        _onTimeUpdateCb = cb;
    }

    function _triggerTimeUpdate() {
        if (_onTimeUpdateCb) _onTimeUpdateCb(getCurrentTime());
    }

    function _onLocalTimeUpdate() {
        _triggerTimeUpdate();
        if (_localPlayer.paused) return;

        // Ensure polling style updates for local if needed, although timeupdate should suffice
        if (_clipEndSec !== null && _localPlayer.currentTime >= _clipEndSec) {
            _localPlayer.pause();
            _clipEndSec = null;
        }
    }

    function _startPoll() {
        _stopPoll();
        _pollTimer = setInterval(() => {
            _triggerTimeUpdate();
            if (_type === 'youtube' && _ytPlayer && _clipEndSec !== null) {
                if (_ytPlayer.getCurrentTime() >= _clipEndSec) {
                    _ytPlayer.pauseVideo();
                    _clipEndSec = null;
                    _stopPoll();
                }
            } else if (_type === 'youtube' && _ytPlayer) {
                // Keep polling for playhead update even if not in clip
            } else {
                _stopPoll();
            }
        }, 100);
    }

    function _stopPoll() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    function loadVideo(source, type = 'youtube') {
        _type = type;
        _clipEndSec = null;
        _stopPoll();

        const ytContainer = document.getElementById('youtube-player');
        const localContainer = document.getElementById('local-video');

        if (type === 'youtube') {
            if (ytContainer) ytContainer.classList.remove('hidden');
            if (localContainer) localContainer.classList.add('hidden');
            if (_ytPlayer && _ytPlayer.loadVideoById) {
                _ytPlayer.loadVideoById(source, 0);
                setTimeout(() => { if (_ytPlayer.pauseVideo) _ytPlayer.pauseVideo(); }, 500);
            }
        } else {
            if (ytContainer) ytContainer.classList.add('hidden');
            if (localContainer) localContainer.classList.remove('hidden');
            if (_localPlayer) {
                _localPlayer.src = source;
                _localPlayer.load();
            }
        }
    }

    function seekTo(seconds) {
        if (_type === 'youtube' && _ytPlayer) _ytPlayer.seekTo(seconds, true);
        else if (_type === 'local' && _localPlayer) _localPlayer.currentTime = seconds;
    }

    function play() {
        if (_type === 'youtube' && _ytPlayer) _ytPlayer.playVideo();
        else if (_type === 'local' && _localPlayer) _localPlayer.play();
    }

    function pause() {
        if (_type === 'youtube' && _ytPlayer) _ytPlayer.pauseVideo();
        else if (_type === 'local' && _localPlayer) _localPlayer.pause();
    }

    function getCurrentTime() {
        if (_type === 'youtube' && _ytPlayer) return _ytPlayer.getCurrentTime() || 0;
        if (_type === 'local' && _localPlayer) return _localPlayer.currentTime || 0;
        return 0;
    }

    function playClip(startSec, endSec) {
        _clipEndSec = endSec;
        seekTo(startSec);
        play();
        if (_type === 'youtube') _startPoll();
    }

    function clearClipEnd() {
        _clipEndSec = null;
        _stopPoll();
    }

    function getPlayerState() {
        if (_type === 'youtube' && _ytPlayer) return _ytPlayer.getPlayerState();
        if (_type === 'local' && _localPlayer) return _localPlayer.paused ? 2 : 1;
        return -1;
    }

    function isReady() { return _ready; }
    function getType() { return _type; }
    function getSource() {
        const local = document.getElementById('local-video');
        return local ? local.src : null;
    }

    return { init, loadVideo, seekTo, play, pause, getCurrentTime, playClip, clearClipEnd, isReady, getPlayerState, getType, getSource };
})();
