/* ═══════════════════════════════════════════
   SimpleReplay — Export Module
   Handles clip recording and file generation
   ═══════════════════════════════════════════ */

const ExportTool = (() => {
    let _recorder = null;
    let _chunks = [];

    function _getBestMimeType() {
        // QuickTime/Mac likes H.264. Safari supports video/mp4. 
        // Chrome often only supports video/webm even if it has H.264.
        const types = [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=h264',
            'video/webm;codecs=vp9',
            'video/webm'
        ];
        for (const t of types) {
            if (MediaRecorder.isTypeSupported(t)) return t;
        }
        return 'video/webm';
    }

    async function exportClip(clip, skipToast = false) {
        const video = document.getElementById('local-video');
        if (VideoPlayer.getType() !== 'local' || !video) {
            UI.toast('Exportar solo disponible para videos locales', 'error');
            return;
        }

        const mimeType = _getBestMimeType();
        const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

        if (!skipToast) {
            if (isChrome && isMac && !mimeType.includes('mp4')) {
                UI.toast('Nota: Chrome en Mac usa WebM. Si QuickTime falla, usá VLC o abrí la app en Safari.', 'info', 6000);
            }
            UI.toast('Grabando clip (tiempo real)...', 'info', 3000);
        }

        // Seek to start
        video.currentTime = clip.start_sec;
        await new Promise(r => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                r();
            };
            video.addEventListener('seeked', onSeeked);
        });

        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';

        _recorder = new MediaRecorder(stream, { mimeType });
        _chunks = [];

        return new Promise((resolve) => {
            _recorder.ondataavailable = (e) => {
                if (e.data.size > 0) _chunks.push(e.data);
            };

            _recorder.onstop = () => {
                const blob = new Blob(_chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const tag = AppState.getTagType(clip.tag_type_id);
                const label = tag ? tag.label : 'Clip';
                const timestamp = new Date().getTime();
                a.download = `SimpleReplay_${label}_${Math.floor(clip.start_sec)}s_${timestamp}.${ext}`;
                a.click();
                URL.revokeObjectURL(url);
                if (!skipToast) UI.toast('Clip exportado ✅', 'success');
                resolve();
            };

            _recorder.start();
            video.play();

            const checkStop = () => {
                if (video.currentTime >= clip.end_sec) {
                    video.pause();
                    _recorder.stop();
                    video.removeEventListener('timeupdate', checkStop);
                }
            };
            video.addEventListener('timeupdate', checkStop);
        });
    }

    async function exportPlaylist(playlistId) {
        const playlist = AppState.get('playlists').find(p => p.id === playlistId);
        if (!playlist) return;
        const items = AppState.get('playlistItems')[playlistId] || [];
        const clips = AppState.get('clips').filter(c => items.includes(c.id));

        if (clips.length === 0) {
            UI.toast('La playlist está vacía', 'warning');
            return;
        }

        const confirmExport = confirm(`Vas a exportar ${clips.length} clips. Esto se hace en tiempo real (debe reproducirse cada clip). ¿Continuar?`);
        if (!confirmExport) return;

        UI.toast('Iniciando exportación de playlist...', 'info');

        for (let i = 0; i < clips.length; i++) {
            UI.toast(`Exportando ${i + 1}/${clips.length}...`, 'info', 2000);
            await exportClip(clips[i], true);
        }

        UI.toast('Playlist exportada completa ✅', 'success');
    }

    return { exportClip, exportPlaylist };
})();

