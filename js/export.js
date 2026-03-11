/**
 * Formats XML output for NacSport or similar video analysis tools.
 */
class ExportManager {
    static generateXML(currentGame) {
        if (!currentGame || !currentGame.clips) return null;

        let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        xml += `<file>\n`;
        xml += `  <ALL_INSTANCES>\n`;

        currentGame.clips.forEach(clip => {
            const startStr = this.formatTime(clip.start);
            const endStr = this.formatTime(clip.end);

            // Map our tags to categories
            let category = "Desconocido";
            if (clip.tags && clip.tags.length > 0) {
                // Use the label of the first tag
                category = clip.tags[0].split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            } else if (clip.name) {
                // Fallback to clip name if no tags
                category = clip.name;
            }

            // Map flags to descriptors
            let notes = "";
            let descriptors = [];
            if (clip.flags) {
                if (clip.flags.importante) descriptors.push("Importante");
                if (clip.flags.acorregir) descriptors.push("A corregir");
                if (clip.flags.bueno) descriptors.push("Bueno");
                if (clip.flags.duda) descriptors.push("Duda");
            }

            if (clip.comments && clip.comments.length > 0) {
                notes = clip.comments.map(c => c.text).join(" | ");
            }

            xml += `    <instance>\n`;
            xml += `      <start>${startStr}</start>\n`;
            xml += `      <end>${endStr}</end>\n`;
            xml += `      <code>${this.escapeXml(category)}</code>\n`;

            // Add descriptors if they exist
            if (descriptors.length > 0) {
                descriptors.forEach(desc => {
                    xml += `      <label>\n        <group>Flags</group>\n        <text>${this.escapeXml(desc)}</text>\n      </label>\n`;
                });
            }

            // Add note if chat exists
            if (notes) {
                xml += `      <label>\n        <group>Notas</group>\n        <text>${this.escapeXml(notes)}</text>\n      </label>\n`;
            }

            xml += `    </instance>\n`;
        });

        xml += `  </ALL_INSTANCES>\n`;
        xml += `</file>\n`;

        return xml;
    }

    static formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return "00:00:00.00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    static escapeXml(unsafe) {
        if (!unsafe) return "";
        return unsafe.toString().replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    static download(content, filename, mimeType = 'text/xml') {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

window.ExportManager = ExportManager;
