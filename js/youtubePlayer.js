/* ═══════════════════════════════════════════
   SimpleReplay — YouTube/Local Player Wrapper
   Provides a compatible YTPlayer interface while using VideoPlayer
   ═══════════════════════════════════════════ */

const YTPlayer = (() => {
    let _videoPlayer = null;
    let _ready = false;
    let _clipEndSec = null;
    let _pollTimer = null;
    let _onReadyCb = null;

    function init() {
        return new Promise((resolve) => {
            _onReadyCb = resolve;

            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _setupPlayer);
            } else {
                _setupPlayer();
            }
        });
    }

    function _setupPlayer() {
        if (!document.getElementById('youtube-player')) {
            console.warn('YTPlayer: youtube-player element not found');
            return;
        }

        _videoPlayer = new VideoPlayer('youtube-player');
        _ready = true;

        if (_onReadyCb) {
            _onReadyCb();
        }
    }

    function loadVideo(videoId) {
        if (!_ready || !_videoPlayer) return;
        _clipEndSec = null;
        _stopPoll();

        if (videoId) {
            _videoPlayer.loadVideo({ type: 'youtube', id: videoId });
        }
    }

    function loadLocalVideo(url) {
        if (!_ready || !_videoPlayer) return;
        _clipEndSec = null;
        _stopPoll();

        if (url) {
            _videoPlayer.loadVideo({ type: 'local', url: url });
        }
    }

    function seekTo(seconds) {
        if (!_ready || !_videoPlayer) return;
        _videoPlayer.seekTo(seconds);
    }

    function play() {
        if (!_ready || !_videoPlayer) return;
        _videoPlayer.play();
    }

    function pause() {
        if (!_ready || !_videoPlayer) return;
        _videoPlayer.pause();
    }

    function getCurrentTime() {
        if (!_ready || !_videoPlayer) return 0;
        return _videoPlayer.getCurrentTime() || 0;
    }

    function getDuration() {
        if (!_ready || !_videoPlayer) return 0;
        return _videoPlayer.getDuration() || 0;
    }

    function playClip(startSec, endSec) {
        if (!_ready || !_videoPlayer) return;
        _clipEndSec = endSec;
        _videoPlayer.seekTo(startSec);
        _videoPlayer.play();
        _startPoll();
    }

    function clearClipEnd() {
        _clipEndSec = null;
        _stopPoll();
    }

    function _startPoll() {
        _stopPoll();
        _pollTimer = setInterval(() => {
            if (!_videoPlayer || _clipEndSec === null) { _stopPoll(); return; }
            const t = _videoPlayer.getCurrentTime();
            if (t >= _clipEndSec) {
                _videoPlayer.pause();
                _clipEndSec = null;
                _stopPoll();
            }
        }, 200);
    }

    function _stopPoll() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }

    // Dummy for compatibility
    function getPlayerState() { return -1; }
    function isReady() { return _ready; }

    return { init, loadVideo, loadLocalVideo, seekTo, play, pause, getCurrentTime, getDuration, playClip, clearClipEnd, isReady, getPlayerState };
})();
