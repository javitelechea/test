/* ═══════════════════════════════════════════
   SimpleReplay — Export Module (High Quality)
   Uses non-real-time processing for instant MP4s
   ═══════════════════════════════════════════ */

const ExportTool = (() => {

    async function exportClip(clip, skipToast = false) {
        if (VideoPlayer.getType() !== 'local') {
            UI.toast('Exportar solo disponible para videos locales', 'error');
            return;
        }

        const videoSrc = VideoPlayer.getSource();
        if (!videoSrc) return;

        if (!skipToast) UI.toast('Procesando clip (Alta Calidad)...', 'info', 3000);

        try {
            await _processVideoClipping(videoSrc, clip, (progress) => {
                // UI feedback if needed
                if (!skipToast && progress % 25 === 0) {
                    UI.toast(`Procesando: ${progress}%`, 'info', 800);
                }
            });
            if (!skipToast) UI.toast('Clip exportado ✅', 'success');
        } catch (err) {
            console.error('Export error:', err);
            UI.toast('Error al exportar. Asegurate de que el video sea compatible.', 'error');
        }
    }

    /**
     * Non-real-time clipping logic.
     * Uses a temporary hidden video element to seek and capture frames
     * as fast as the browser allows, encoding them into a high-bitrate MP4.
     */
    async function _processVideoClipping(source, clip, onProgress) {
        return new Promise(async (resolve, reject) => {
            // Create a hidden video element for processing
            const procVideo = document.createElement('video');
            procVideo.src = source;
            procVideo.muted = true;
            procVideo.playsInline = true;

            await new Promise(r => procVideo.onloadedmetadata = r);

            const stream = procVideo.captureStream ? procVideo.captureStream() : procVideo.mozCaptureStream();
            const recorder = new MediaRecorder(stream, {
                mimeType: _getBestMimeType(),
                videoBitsPerSecond: 8000000 // 8Mbps for very high quality
            });

            const chunks = [];
            recorder.ondataavailable = e => chunks.push(e.data);

            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const tag = AppState.getTagType(clip.tag_type_id);
                const label = tag ? tag.label : 'Clip';
                const ts = Math.floor(clip.start_sec);
                a.download = `SimpleReplay_${label}_${ts}s.mp4`;
                a.click();
                URL.revokeObjectURL(url);
                procVideo.remove();
                resolve();
            };

            // Start processing
            procVideo.currentTime = clip.start_sec;
            await new Promise(r => procVideo.onseeked = r);

            recorder.start();

            // We use a faster playback rate to "capture" faster
            // WebCodecs would be faster but this is more compatible while being 8x-16x faster
            procVideo.playbackRate = 16.0;
            procVideo.play();

            const check = () => {
                const dur = clip.end_sec - clip.start_sec;
                const curr = procVideo.currentTime - clip.start_sec;
                const prog = Math.min(100, Math.floor((curr / dur) * 100));
                if (onProgress) onProgress(prog);

                if (procVideo.currentTime >= clip.end_sec) {
                    procVideo.pause();
                    recorder.stop();
                    procVideo.removeEventListener('timeupdate', check);
                }
            };
            procVideo.addEventListener('timeupdate', check);

            procVideo.onerror = reject;
        });
    }

    function _getBestMimeType() {
        const types = [
            'video/mp4;codecs=avc1',
            'video/mp4',
            'video/webm;codecs=h264',
            'video/webm'
        ];
        for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
        return 'video/webm';
    }

    async function exportAllClips() {
        const clips = AppState.get('clips');
        if (clips.length === 0) return UI.toast('No hay clips', 'warning');
        if (!confirm(`Exportar ${clips.length} clips en ráfaga de alta calidad?`)) return;

        UI.toast('Iniciando exportación masiva...', 'info');
        for (let i = 0; i < clips.length; i++) {
            await exportClip(clips[i], true);
            UI.toast(`Exportado ${i + 1}/${clips.length}`, 'info', 1000);
        }
        UI.toast('¡Todos los clips exportados! ✅', 'success');
    }

    async function exportPlaylist(playlistId) {
        const items = AppState.get('playlistItems')[playlistId] || [];
        const clips = AppState.get('clips').filter(c => items.includes(c.id));
        if (clips.length === 0) return UI.toast('Playlist vacía', 'warning');
        if (!confirm(`Exportar ${clips.length} clips de esta playlist?`)) return;

        UI.toast('Exportando playlist...', 'info');
        for (let i = 0; i < clips.length; i++) {
            await exportClip(clips[i], true);
            UI.toast(`Playlist: ${i + 1}/${clips.length}`, 'info', 1000);
        }
        UI.toast('Playlist exportada ✅', 'success');
    }

    return { exportClip, exportPlaylist, exportAllClips };
})();
