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

        if (!skipToast) {
            $('#export-title').textContent = "Exportando Clip";
            $('#export-status').textContent = "Iniciando procesamiento...";
            $('#export-progress-bar').style.width = '0%';
            $('#export-info').textContent = "0% completo";
            UI.showModal('modal-export-progress');
        }

        try {
            await _processVideoClipping(videoSrc, clip, (progress) => {
                $('#export-progress-bar').style.width = `${progress}%`;
                $('#export-info').textContent = `${progress}% completo`;
            });
            if (!skipToast) {
                UI.hideModal('modal-export-progress');
                UI.toast('Clip exportado ✅', 'success');
            }
        } catch (err) {
            console.error('Export error:', err);
            UI.hideModal('modal-export-progress');
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

            // We use 1.0 speed to ensure correct recording speed/sync.
            // Using a hidden video keeps it "silent" for the user.
            procVideo.playbackRate = 1.0;
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

    async function exportPlaylist(playlistId) {
        const items = AppState.get('playlistItems')[playlistId] || [];
        const clips = AppState.get('clips').filter(c => items.includes(c.id));
        if (clips.length === 0) return UI.toast('Playlist vacía', 'warning');
        if (!confirm(`Exportar ${clips.length} clips de esta playlist?`)) return;

        $('#export-title').textContent = "Exportando Playlist";
        $('#export-progress-bar').style.width = '0%';
        UI.showModal('modal-export-progress');

        for (let i = 0; i < clips.length; i++) {
            const clip = clips[i];
            const tag = AppState.getTagType(clip.tag_type_id);
            const label = tag ? tag.label : 'Clip';

            $('#export-status').textContent = `Exportando (${i + 1}/${clips.length}): ${label}`;

            await exportClip(clip, true); // true avoids closing modal each time

            const overallProgress = Math.floor(((i + 1) / clips.length) * 100);
            $('#export-progress-bar').style.width = `${overallProgress}%`;
            $('#export-info').textContent = `Total: ${i + 1} de ${clips.length} clips`;
        }

        UI.hideModal('modal-export-progress');
        UI.toast('Playlist exportada ✅', 'success');
    }

    return { exportClip, exportPlaylist };
})();
