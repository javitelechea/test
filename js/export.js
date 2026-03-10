/* ═══════════════════════════════════════════
   SimpleReplay — Export Module
   Handles clip recording and file generation
   ═══════════════════════════════════════════ */

const ExportTool = (() => {
    let _recorder = null;
    let _chunks = [];

    async function exportClip(clip) {
        const video = document.getElementById('local-video');
        if (VideoPlayer.getType() !== 'local' || !video) {
            UI.toast('Exportar solo disponible para videos locales', 'error');
            return;
        }

        UI.toast('Grabando clip...', 'info', 4000);

        // Seek to start
        video.currentTime = clip.start_sec;
        await new Promise(r => video.onseeked = r);

        const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
        _recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        _chunks = [];

        _recorder.ondataavailable = (e) => {
            if (e.data.size > 0) _chunks.push(e.data);
        };

        _recorder.onstop = () => {
            const blob = new Blob(_chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const tag = AppState.getTagType(clip.tag_type_id);
            const label = tag ? tag.label : 'Clip';
            a.download = `SimpleReplay_${label}_${Math.floor(clip.start_sec)}s.webm`;
            a.click();
            URL.revokeObjectURL(url);
            UI.toast('Clip exportado ✅', 'success');
        };

        _recorder.start();
        video.play();

        // Monitor time to stop recording
        const checkStop = () => {
            if (video.currentTime >= clip.end_sec) {
                video.pause();
                _recorder.stop();
                video.removeEventListener('timeupdate', checkStop);
            }
        };
        video.addEventListener('timeupdate', checkStop);
    }

    return { exportClip };
})();

