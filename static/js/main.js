// Global State Variables
let detectedVideos = [];
let activeVideo = null;
let watermarkAction = 'erase'; // 'erase', 'blur', 'crop', 'none'
let introTrimSeconds = 0.0;
let outroTrimSeconds = 3.0;

// Watermark Bounding Box Coordinates (on canvas)
let watermarkBox = null; 
let isDrawing = false;
let startX = 0, startY = 0;
let currentX = 0, currentY = 0;

// DOM Elements
const dirPathInput = document.getElementById('dir-path-input');
const scanDirBtn = document.getElementById('scan-dir-btn');
const browseDirBtn = document.getElementById('browse-dir-btn');
const selectFilesBtn = document.getElementById('select-files-btn');
const clearListBtn = document.getElementById('clear-list-btn');

const videoCountEl = document.getElementById('video-count');
const videoList = document.getElementById('video-list');
const videoListEmpty = document.getElementById('video-list-empty');

const activeVideoName = document.getElementById('active-video-name');
const activeVideoRes = document.getElementById('active-video-resolution');
const editorVideo = document.getElementById('editor-video');
const overlayCanvas = document.getElementById('overlay-canvas');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const videoWrapper = document.getElementById('video-wrapper');

const videoPlayBtn = document.getElementById('video-play-btn');
const currentTimeEl = document.getElementById('current-time');
const totalTimeEl = document.getElementById('total-time');
const progressBarFill = document.getElementById('progress-bar-fill');
const customVideoControls = document.querySelector('.custom-video-controls');

const trimSlider = document.getElementById('trim-slider');
const trimValDisplay = document.getElementById('trim-val-display');
const introTrimSlider = document.getElementById('intro-trim-slider');
const introTrimValDisplay = document.getElementById('intro-trim-val-display');
const actionToggles = document.querySelectorAll('.toggle-btn');
const presetsRow = document.getElementById('presets-row');

const cleanSingleBtn = document.getElementById('clean-single-btn');
const cleanBatchBtn = document.getElementById('clean-batch-btn');

const progressStatusText = document.getElementById('progress-status-text');
const progressPercent = document.getElementById('progress-percent');
const progressBarFillLarge = document.getElementById('progress-bar-fill-large');
const consoleLogs = document.getElementById('console-logs');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const successActions = document.getElementById('success-actions');
const openOutDirBtn = document.getElementById('open-out-dir-btn');

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    setupEventListeners();
    setupAuthEventListeners();
    setupUploadEventListeners();
    setupOutroEventListeners();
    setupPasswordToggles();
    initCanvas();
    addConsoleLog('System Ready. Drag & Drop video file to begin.', 'system');
});

// Event Listeners Configuration
function setupEventListeners() {
    // Scanning & File Selection
    scanDirBtn.addEventListener('click', scanDirectory);
    dirPathInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') scanDirectory();
    });
    browseDirBtn.addEventListener('click', browseDirectory);
    selectFilesBtn.addEventListener('click', selectFiles);
    clearListBtn.addEventListener('click', clearQueue);

    // Custom Video controls
    videoPlayBtn.addEventListener('click', toggleVideoPlay);
    editorVideo.addEventListener('timeupdate', updateVideoProgress);
    editorVideo.addEventListener('loadedmetadata', handleVideoMetadataLoaded);

    // Toggle actions (Blur, Crop, None)
    actionToggles.forEach(btn => {
        btn.addEventListener('click', (e) => {
            actionToggles.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            watermarkAction = btn.getAttribute('data-action');
            
            if (watermarkAction === 'none') {
                presetsRow.style.display = 'none';
                clearWatermarkSelection();
            } else {
                presetsRow.style.display = 'block';
                drawOverlay();
            }
            addConsoleLog(`Watermark mode set to: ${watermarkAction.toUpperCase()}`, 'system');
        });
    });

    // Intro duration slider
    introTrimSlider.addEventListener('input', (e) => {
        introTrimSeconds = parseFloat(e.target.value);
        introTrimValDisplay.textContent = `${introTrimSeconds.toFixed(1)}s`;
    });

    // Outro duration slider
    trimSlider.addEventListener('input', (e) => {
        outroTrimSeconds = parseFloat(e.target.value);
        trimValDisplay.textContent = `${outroTrimSeconds.toFixed(1)}s`;
    });

    // Processing trigger buttons
    cleanSingleBtn.addEventListener('click', processActiveVideo);
    cleanBatchBtn.addEventListener('click', processBatchVideos);

    // Console logs controls
    clearLogsBtn.addEventListener('click', () => {
        consoleLogs.innerHTML = '';
        addConsoleLog('Logs cleared.', 'system');
    });

    // Open output directory in explorer
    openOutDirBtn.addEventListener('click', () => {
        if (activeVideo) {
            openDirectory(activeVideo.path);
        }
    });

    // Resize canvas when video window resizes
    window.addEventListener('resize', () => {
        if (editorVideo.style.display !== 'none') {
            alignCanvasWithVideo();
        }
    });
}

// Write to styled console window
function addConsoleLog(text, type = '') {
    const logLine = document.createElement('div');
    logLine.className = `log-line ${type}`;
    logLine.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    consoleLogs.appendChild(logLine);
    consoleLogs.scrollTop = consoleLogs.scrollHeight;
}

// ----------------------------------------------------
// Folder & Video Operations
// ----------------------------------------------------

async function scanDirectory() {
    const path = dirPathInput.value.trim();
    if (!path) {
        addConsoleLog('Error: Directory path cannot be empty.', 'error');
        return;
    }

    scanDirBtn.disabled = true;
    addConsoleLog(`Scanning directory: ${path}...`, 'system');

    try {
        const response = await fetch('/api/list-videos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: path })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            detectedVideos = data.videos;
            // Initialize each video with pending status
            detectedVideos.forEach(v => v.status = 'pending');
            videoCountEl.textContent = detectedVideos.length;
            renderVideoList();
            
            if (detectedVideos.length > 0) {
                addConsoleLog(`Success! Found ${detectedVideos.length} videos.`, 'success');
                cleanBatchBtn.disabled = false;
            } else {
                addConsoleLog('No videos found in the specified directory.', 'error');
                cleanBatchBtn.disabled = true;
            }
        } else {
            addConsoleLog(`Error: ${data.error}`, 'error');
        }
    } catch (err) {
        addConsoleLog(`Network Error: ${err.message}`, 'error');
    } finally {
        scanDirBtn.disabled = false;
    }
}

async function browseDirectory() {
    addConsoleLog('Opening folder selection dialog...', 'system');
    try {
        const response = await fetch('/api/select-directory', { method: 'POST' });
        const data = await response.json();
        if (response.ok && data.path) {
            dirPathInput.value = data.path;
            addConsoleLog(`Selected directory: ${data.path}`, 'system');
            scanDirectory();
        } else if (data.error) {
            addConsoleLog(`Browse error: ${data.error}`, 'error');
        }
    } catch (err) {
        addConsoleLog(`Network Error: ${err.message}`, 'error');
    }
}

async function selectFiles() {
    addConsoleLog('Opening file selection dialog...', 'system');
    try {
        const response = await fetch('/api/select-files', { method: 'POST' });
        const data = await response.json();
        if (response.ok && data.videos && data.videos.length > 0) {
            // Append newly selected files to our queue
            data.videos.forEach(newVid => {
                // Avoid adding duplicate paths
                if (!detectedVideos.some(v => v.path === newVid.path)) {
                    newVid.status = 'pending';
                    detectedVideos.push(newVid);
                }
            });
            videoCountEl.textContent = detectedVideos.length;
            renderVideoList();
            addConsoleLog(`Successfully loaded ${data.videos.length} videos to queue.`, 'success');
            cleanBatchBtn.disabled = false;
        } else if (response.ok) {
            addConsoleLog('No files selected or loaded.', 'system');
        } else if (data.error) {
            addConsoleLog(`Browse error: ${data.error}`, 'error');
        }
    } catch (err) {
        addConsoleLog(`Network Error: ${err.message}`, 'error');
    }
}

function clearQueue() {
    detectedVideos = [];
    activeVideo = null;
    videoCountEl.textContent = '0';
    renderVideoList();
    
    editorVideo.src = '';
    editorVideo.style.display = 'none';
    canvasPlaceholder.style.display = 'flex';
    customVideoControls.style.display = 'none';
    activeVideoName.textContent = 'No Video Selected';
    activeVideoRes.textContent = '--x--';
    
    cleanSingleBtn.disabled = true;
    cleanBatchBtn.disabled = true;
    successActions.style.display = 'none';
    
    clearWatermarkSelection();
    addConsoleLog('Queue cleared.', 'system');
}

function renderVideoList() {
    videoList.innerHTML = '';
    
    if (detectedVideos.length === 0) {
        videoListEmpty.style.display = 'flex';
        return;
    }
    
    videoListEmpty.style.display = 'none';
    
    detectedVideos.forEach((video, index) => {
        const li = document.createElement('li');
        li.className = 'video-item';
        if (activeVideo && activeVideo.path === video.path) {
            li.classList.add('active');
        }
        
        li.innerHTML = `
            <div class="video-item-title-row">
                <div class="video-item-title" title="${video.filename}">${video.filename}</div>
                <span class="status-badge ${video.status || 'pending'}">${video.status || 'pending'}</span>
            </div>
            <div class="video-item-meta" style="margin-top: 0.25rem;">
                <span>${video.width}x${video.height}</span>
                <span>${formatDuration(video.duration)}</span>
            </div>
        `;
        
        li.addEventListener('click', () => {
            document.querySelectorAll('.video-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            loadActiveVideo(video);
        });
        
        videoList.appendChild(li);
    });
}

function formatDuration(sec) {
    if (!sec) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ----------------------------------------------------
// Video Loading & Player Controls
// ----------------------------------------------------

function loadActiveVideo(video) {
    activeVideo = video;
    activeVideoName.textContent = video.filename;
    activeVideoRes.textContent = `${video.width}x${video.height}`;
    
    // Set video src to Flask stream endpoint
    editorVideo.src = `/api/stream-video?path=${encodeURIComponent(video.path)}`;
    editorVideo.style.display = 'block';
    canvasPlaceholder.style.display = 'none';
    customVideoControls.style.display = 'flex';
    
    cleanSingleBtn.disabled = false;
    successActions.style.display = 'none';
    
    clearWatermarkSelection();
    addConsoleLog(`Loaded video: ${video.filename}`, 'system');
}

function handleVideoMetadataLoaded() {
    alignCanvasWithVideo();
    // Default preset - top right for Vizard watermarks
    setPreset('top-right');
}

function toggleVideoPlay() {
    if (editorVideo.paused) {
        editorVideo.play();
        videoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    } else {
        editorVideo.pause();
        videoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    }
}

function updateVideoProgress() {
    const cur = editorVideo.currentTime;
    const dur = editorVideo.duration;
    
    currentTimeEl.textContent = formatDuration(cur);
    totalTimeEl.textContent = formatDuration(dur);
    
    if (dur) {
        const pct = (cur / dur) * 100;
        progressBarFill.style.width = `${pct}%`;
    }
}

// ----------------------------------------------------
// Interactive Canvas Selection Core
// ----------------------------------------------------

function initCanvas() {
    const ctx = overlayCanvas.getContext('2d');
    
    overlayCanvas.addEventListener('mousedown', (e) => {
        if (watermarkAction === 'none') return;
        isDrawing = true;
        const rect = overlayCanvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        currentX = startX;
        currentY = startY;
        
        editorVideo.pause(); // Pause video while drawing
        videoPlayBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    });

    overlayCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const rect = overlayCanvas.getBoundingClientRect();
        currentX = e.clientX - rect.left;
        currentY = e.clientY - rect.top;
        
        // Update selection box
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const w = Math.abs(startX - currentX);
        const h = Math.abs(startY - currentY);
        
        watermarkBox = { x, y, w, h };
        drawOverlay();
    });

    overlayCanvas.addEventListener('mouseup', () => {
        if (isDrawing) {
            isDrawing = false;
            if (watermarkBox && (watermarkBox.w < 10 || watermarkBox.h < 10)) {
                clearWatermarkSelection();
            } else {
                reportCoordinates();
            }
        }
    });

    overlayCanvas.addEventListener('mouseleave', () => {
        if (isDrawing) {
            isDrawing = false;
            reportCoordinates();
        }
    });
}

function alignCanvasWithVideo() {
    // Perfectly position and size canvas to overlay the visible video region
    const width = editorVideo.clientWidth;
    const height = editorVideo.clientHeight;
    
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    
    overlayCanvas.style.left = `${editorVideo.offsetLeft}px`;
    overlayCanvas.style.top = `${editorVideo.offsetTop}px`;
    
    drawOverlay();
}

function drawOverlay() {
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    if (!watermarkBox || watermarkAction === 'none') return;
    
    const { x, y, w, h } = watermarkBox;
    
    // Draw outer dimmed screen layer (except selected region if crop, otherwise just highlight)
    if (watermarkAction === 'crop') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        // Top
        ctx.fillRect(0, 0, overlayCanvas.width, y);
        // Bottom
        ctx.fillRect(0, y + h, overlayCanvas.width, overlayCanvas.height - (y + h));
        // Left
        ctx.fillRect(0, y, x, h);
        // Right
        ctx.fillRect(x + w, y, overlayCanvas.width - (x + w), h);
        
        // Draw Crop boundary border
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, w, h);
    } else if (watermarkAction === 'erase') {
        // Draw smart erase (delogo) glowing box
        ctx.shadowColor = 'rgba(255, 42, 95, 0.4)';
        ctx.shadowBlur = 10;
        
        ctx.strokeStyle = '#ff2a5f';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, w, h);
        
        ctx.shadowBlur = 0; // reset
        ctx.fillStyle = 'rgba(255, 42, 95, 0.12)';
        ctx.fillRect(x, y, w, h);
        
        // Corners overlay ticks
        ctx.fillStyle = '#ff2a5f';
        const tick = 8;
        const tickW = 2;
        // Top-left corner
        ctx.fillRect(x, y, tick, tickW);
        ctx.fillRect(x, y, tickW, tick);
        // Top-right
        ctx.fillRect(x + w - tick, y, tick, tickW);
        ctx.fillRect(x + w - tickW, y, tickW, tick);
        // Bottom-left
        ctx.fillRect(x, y + h - tickW, tick, tickW);
        ctx.fillRect(x, y + h - tick, tickW, tick);
        // Bottom-right
        ctx.fillRect(x + w - tick, y + h - tickW, tick, tickW);
        ctx.fillRect(x + w - tickW, y + h - tick, tickW, tick);
        
        // Small Label inside
        ctx.fillStyle = 'rgba(8, 12, 20, 0.8)';
        ctx.fillRect(x + 4, y + 4, 80, 18);
        ctx.fillStyle = '#ff2a5f';
        ctx.font = '600 10px Outfit';
        ctx.fillText('ERASE AREA', x + 8, y + 16);
    } else { // blur
        // Draw elegant glowing box over logo
        ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
        ctx.shadowBlur = 10;
        
        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, w, h);
        
        ctx.shadowBlur = 0; // reset
        ctx.fillStyle = 'rgba(0, 242, 254, 0.12)';
        ctx.fillRect(x, y, w, h);
        
        // Corners overlay ticks
        ctx.fillStyle = '#00f2fe';
        const tick = 8;
        const tickW = 2;
        // Top-left corner
        ctx.fillRect(x, y, tick, tickW);
        ctx.fillRect(x, y, tickW, tick);
        // Top-right
        ctx.fillRect(x + w - tick, y, tick, tickW);
        ctx.fillRect(x + w - tickW, y, tickW, tick);
        // Bottom-left
        ctx.fillRect(x, y + h - tickW, tick, tickW);
        ctx.fillRect(x, y + h - tick, tickW, tick);
        // Bottom-right
        ctx.fillRect(x + w - tick, y + h - tickW, tick, tickW);
        ctx.fillRect(x + w - tickW, y + h - tick, tickW, tick);
        
        // Small Label inside
        ctx.fillStyle = 'rgba(8, 12, 20, 0.8)';
        ctx.fillRect(x + 4, y + 4, 75, 18);
        ctx.fillStyle = '#00f2fe';
        ctx.font = '600 10px Outfit';
        ctx.fillText('BLUR AREA', x + 8, y + 16);
    }
}

function clearWatermarkSelection() {
    watermarkBox = null;
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
}

function setPreset(preset) {
    if (!activeVideo || watermarkAction === 'none') return;
    
    const wCanvas = overlayCanvas.width;
    const hCanvas = overlayCanvas.height;
    
    // Preset coordinates scaled relative to standard 9:16 layout
    if (preset === 'top-right') {
        // Standard top right region where Vizard logo typically stays
        const w = wCanvas * 0.32;
        const h = hCanvas * 0.055;
        const x = wCanvas * 0.64;
        const y = hCanvas * 0.035;
        watermarkBox = { x, y, w, h };
    } else if (preset === 'top-left') {
        const w = wCanvas * 0.32;
        const h = hCanvas * 0.055;
        const x = wCanvas * 0.04;
        const y = hCanvas * 0.035;
        watermarkBox = { x, y, w, h };
    } else if (preset === 'bottom') {
        // Bottom overlay logo
        const w = wCanvas * 0.45;
        const h = hCanvas * 0.06;
        const x = (wCanvas - w) / 2;
        const y = hCanvas * 0.88;
        watermarkBox = { x, y, w, h };
    }
    
    drawOverlay();
    reportCoordinates();
}

function reportCoordinates() {
    if (!watermarkBox || !activeVideo) return;
    
    const naturalCoords = getNaturalCoords();
    addConsoleLog(`Selection coords (video pixels) -> X: ${Math.round(naturalCoords.x)}, Y: ${Math.round(naturalCoords.y)}, W: ${Math.round(naturalCoords.w)}, H: ${Math.round(naturalCoords.h)}`, 'system');
}

function getNaturalCoords() {
    if (!watermarkBox || !activeVideo) return null;
    
    // Translate canvas-relative display coords to original video file resolution coordinates
    const scaleX = activeVideo.width / overlayCanvas.width;
    const scaleY = activeVideo.height / overlayCanvas.height;
    
    return {
        x: Math.max(0, watermarkBox.x * scaleX),
        y: Math.max(0, watermarkBox.y * scaleY),
        w: Math.min(activeVideo.width, watermarkBox.w * scaleX),
        h: Math.min(activeVideo.height, watermarkBox.h * scaleY)
    };
}

function setTrim(secs) {
    trimSlider.value = secs;
    outroTrimSeconds = secs;
    trimValDisplay.textContent = `${secs.toFixed(1)}s`;
    addConsoleLog(`Outro trim set to: ${secs.toFixed(1)} seconds.`, 'system');
}

function setIntroTrim(secs) {
    introTrimSlider.value = secs;
    introTrimSeconds = secs;
    introTrimValDisplay.textContent = `${secs.toFixed(1)}s`;
    addConsoleLog(`Intro trim set to: ${secs.toFixed(1)} seconds.`, 'system');
}

window.setTrim = setTrim;
window.setIntroTrim = setIntroTrim;

// ----------------------------------------------------
// API Processing Operations
// ----------------------------------------------------

async function processActiveVideo() {
    if (!activeVideo) return;
    
    cleanSingleBtn.disabled = true;
    cleanBatchBtn.disabled = true;
    successActions.style.display = 'none';
    
    const naturalCoords = getNaturalCoords();
    const payload = {
        video_path: activeVideo.path,
        intro_trim: introTrimSeconds,
        outro_trim: outroTrimSeconds,
        watermark_action: watermarkAction,
        watermark_coords: naturalCoords
    };
    
    addConsoleLog(`Sending request to clean ${activeVideo.filename}...`, 'system');
    progressStatusText.textContent = "Queued...";
    progressBarFillLarge.style.width = '0%';
    progressPercent.textContent = '0%';
    
    try {
        const response = await fetch('/api/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            pollJobStatus(data.job_id);
        } else {
            addConsoleLog(`Error starting process: ${data.error}`, 'error');
            cleanSingleBtn.disabled = false;
            cleanBatchBtn.disabled = false;
        }
    } catch (err) {
        addConsoleLog(`Network Error: ${err.message}`, 'error');
        cleanSingleBtn.disabled = false;
        cleanBatchBtn.disabled = false;
    }
}

// Periodically check the progress of a processing video
function pollJobStatus(jobId) {
    if (activeVideo) {
        activeVideo.status = 'processing';
        renderVideoList();
    }
    
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/job-status/${jobId}`);
            if (!res.ok) {
                clearInterval(interval);
                addConsoleLog("Error checking job status.", "error");
                cleanSingleBtn.disabled = false;
                cleanBatchBtn.disabled = false;
                if (activeVideo) {
                    activeVideo.status = 'failed';
                    renderVideoList();
                }
                return;
            }
            
            const data = await res.json();
            
            // Update UI progress indicators
            progressPercent.textContent = `${data.progress}%`;
            progressBarFillLarge.style.width = `${data.progress}%`;
            progressStatusText.textContent = data.status.toUpperCase();
            
            if (data.log) {
                // If it is standard ffmpeg progress, replace or add
                if (data.log.startsWith('frame=') || data.log.startsWith('Processing...')) {
                    // Update current status
                    progressStatusText.textContent = data.log;
                } else {
                    addConsoleLog(data.log, data.status === 'error' ? 'error' : '');
                }
            }
            
            if (data.status === 'completed') {
                clearInterval(interval);
                progressStatusText.textContent = "SUCCESS!";
                addConsoleLog(`SUCCESS! Cleaned video saved to: ${data.output_path}`, 'success');
                cleanSingleBtn.disabled = false;
                cleanBatchBtn.disabled = false;
                
                const downloadBtn = document.getElementById('download-clean-btn');
                if (downloadBtn) {
                    downloadBtn.href = `/api/stream-video?path=${encodeURIComponent(data.output_path)}`;
                    downloadBtn.download = data.output_path.split(/[\\/]/).pop();
                }
                
                successActions.style.display = 'flex';
                
                if (activeVideo) {
                    activeVideo.status = 'completed';
                    renderVideoList();
                }
                
                // Play completion chime
                playSuccessChime();
            } else if (data.status === 'error') {
                clearInterval(interval);
                progressStatusText.textContent = "FAILED";
                addConsoleLog(`Processing Error: ${data.log}`, 'error');
                cleanSingleBtn.disabled = false;
                cleanBatchBtn.disabled = false;
                if (activeVideo) {
                    activeVideo.status = 'failed';
                    renderVideoList();
                }
            }
        } catch (err) {
            clearInterval(interval);
            addConsoleLog(`Polling error: ${err.message}`, 'error');
            cleanSingleBtn.disabled = false;
            cleanBatchBtn.disabled = false;
            if (activeVideo) {
                activeVideo.status = 'failed';
                renderVideoList();
            }
        }
    }, 1000);
}

// ----------------------------------------------------
// Folder Batch Operations
// ----------------------------------------------------

async function processBatchVideos() {
    if (detectedVideos.length === 0) return;
    
    cleanSingleBtn.disabled = true;
    cleanBatchBtn.disabled = true;
    successActions.style.display = 'none';
    
    const naturalCoords = getNaturalCoords();
    const videoPaths = detectedVideos.map(v => v.path);
    
    const payload = {
        video_paths: videoPaths,
        intro_trim: introTrimSeconds,
        outro_trim: outroTrimSeconds,
        watermark_action: watermarkAction,
        watermark_coords: naturalCoords
    };
    
    addConsoleLog(`Starting batch clean for ${videoPaths.length} videos...`, 'system');
    progressStatusText.textContent = "Starting Batch...";
    progressBarFillLarge.style.width = '0%';
    progressPercent.textContent = '0%';
    
    try {
        const response = await fetch('/api/batch-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            pollBatchStatus(data.batch_id);
        } else {
            addConsoleLog(`Error starting batch: ${data.error}`, 'error');
            cleanSingleBtn.disabled = false;
            cleanBatchBtn.disabled = false;
        }
    } catch (err) {
        addConsoleLog(`Network Error: ${err.message}`, 'error');
        cleanSingleBtn.disabled = false;
        cleanBatchBtn.disabled = false;
    }
}

function pollBatchStatus(batchId) {
    const interval = setInterval(async () => {
        try {
            const res = await fetch(`/api/job-status/${batchId}`);
            if (!res.ok) {
                clearInterval(interval);
                addConsoleLog("Error checking batch status.", "error");
                cleanSingleBtn.disabled = false;
                cleanBatchBtn.disabled = false;
                detectedVideos.forEach(v => v.status = 'failed');
                renderVideoList();
                return;
            }
            
            const data = await res.json();
            
            progressPercent.textContent = `${data.progress}%`;
            progressBarFillLarge.style.width = `${data.progress}%`;
            progressStatusText.textContent = `Batch: ${data.processed_count}/${data.total_count} videos done`;
            
            // Update individual video statuses in sidebar in real-time
            if (data.current_video) {
                let currentIdx = detectedVideos.findIndex(v => v.filename === data.current_video);
                if (currentIdx !== -1) {
                    detectedVideos.forEach((v, idx) => {
                        if (idx < currentIdx) {
                            v.status = 'completed';
                        } else if (idx === currentIdx) {
                            v.status = 'processing';
                        } else {
                            v.status = 'pending';
                        }
                    });
                    renderVideoList();
                }
            }
            
            if (data.log) {
                addConsoleLog(data.log, 'success');
            }
            
            if (data.status === 'completed') {
                clearInterval(interval);
                progressStatusText.textContent = "BATCH SUCCESS!";
                addConsoleLog(`BATCH SUCCESS! All completed videos saved in 'cleaned_videos' directory.`, 'success');
                cleanSingleBtn.disabled = false;
                cleanBatchBtn.disabled = false;
                successActions.style.display = 'flex';
                
                detectedVideos.forEach(v => v.status = 'completed');
                renderVideoList();
                
                playSuccessChime();
            } else if (data.status === 'error') {
                clearInterval(interval);
                progressStatusText.textContent = "BATCH FAILED";
                addConsoleLog(`Batch Error: ${data.log}`, 'error');
                cleanSingleBtn.disabled = false;
                cleanBatchBtn.disabled = false;
                
                detectedVideos.forEach(v => {
                    if (v.status === 'processing') v.status = 'failed';
                });
                renderVideoList();
            }
        } catch (err) {
            clearInterval(interval);
            addConsoleLog(`Polling error: ${err.message}`, 'error');
            cleanSingleBtn.disabled = false;
            cleanBatchBtn.disabled = false;
            
            detectedVideos.forEach(v => {
                if (v.status === 'processing') v.status = 'failed';
            });
            renderVideoList();
        }
    }, 1200);
}

// ----------------------------------------------------
// UI Helpers
// ----------------------------------------------------

async function openDirectory(filePath) {
    try {
        await fetch('/api/open-directory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
        });
    } catch (err) {
        addConsoleLog(`Could not open folder in Explorer: ${err.message}`, 'error');
    }
}

// Play premium browser synthesizer success chime
function playSuccessChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Pitch sequence for premium notification chime (Arpeggio major 7th)
        const notes = [523.25, 659.25, 783.99, 987.77]; // C5, E5, G5, B5
        
        notes.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime + idx * 0.08);
            osc.type = 'sine';
            
            gain.gain.setValueAtTime(0.06, audioCtx.currentTime + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + idx * 0.08 + 0.5);
            
            osc.start(audioCtx.currentTime + idx * 0.08);
            osc.stop(audioCtx.currentTime + idx * 0.08 + 0.6);
        });
    } catch (e) {
        // Fallback if browser audio context blocked
        console.log("Audio feedback skipped.");
    }
}

// ----------------------------------------------------
// Software SaaS Authentication & Session Handling
// ----------------------------------------------------

const authOverlay = document.getElementById('auth-overlay');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const registerUsernameInput = document.getElementById('register-username');
const registerPasswordInput = document.getElementById('register-password');
const registerConfirmPasswordInput = document.getElementById('register-confirm-password');

const tabLoginBtn = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');
const loginFormPanel = document.getElementById('login-form-panel');
const registerFormPanel = document.getElementById('register-form-panel');

const submitLoginBtn = document.getElementById('submit-login-btn');
const submitRegisterBtn = document.getElementById('submit-register-btn');
const logoutBtn = document.getElementById('logout-btn');

const authError = document.getElementById('auth-error');
const authSuccess = document.getElementById('auth-success');

const userProfileWidget = document.getElementById('user-profile-widget');
const userDisplayName = document.getElementById('user-display-name');

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        if (data.authenticated) {
            authOverlay.style.display = 'none';
            userDisplayName.textContent = data.username;
            userProfileWidget.style.display = 'flex';
            loadUserSettings(); // Load persistent settings!
        } else {
            authOverlay.style.display = 'flex';
            userProfileWidget.style.display = 'none';
        }
    } catch (err) {
        addConsoleLog(`Failed to check user login status: ${err.message}`, 'error');
    }
}

function setupAuthEventListeners() {
    // Form Tab Switching
    tabLoginBtn.addEventListener('click', () => {
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        loginFormPanel.style.display = 'flex';
        registerFormPanel.style.display = 'none';
        hideAuthStatus();
    });

    tabRegisterBtn.addEventListener('click', () => {
        tabRegisterBtn.classList.add('active');
        tabLoginBtn.classList.remove('active');
        registerFormPanel.style.display = 'flex';
        loginFormPanel.style.display = 'none';
        hideAuthStatus();
    });

    // Form Submissions
    submitLoginBtn.addEventListener('click', loginUser);
    submitRegisterBtn.addEventListener('click', registerUser);

    loginPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginUser();
    });
    registerConfirmPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') registerUser();
    });

    // Logout
    logoutBtn.addEventListener('click', logoutUser);
}

async function loginUser() {
    const username = loginUsernameInput.value.trim();
    const password = loginPasswordInput.value;
    
    if (!username || !password) {
        showAuthStatus("Please fill in all fields.", "error");
        return;
    }

    submitLoginBtn.disabled = true;
    submitLoginBtn.textContent = "Signing In...";
    hideAuthStatus();

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        
        if (response.ok) {
            showAuthStatus("Signed in successfully! Loading workspace...", "success");
            userDisplayName.textContent = data.user.username;
            userProfileWidget.style.display = 'flex';
            loadUserSettings(); // Load persistent settings!
            setTimeout(() => {
                authOverlay.style.opacity = '0';
                setTimeout(() => {
                    authOverlay.style.display = 'none';
                    authOverlay.style.opacity = '1';
                }, 400);
            }, 1200);
        } else {
            showAuthStatus(data.error || "Authentication failed.", "error");
        }
    } catch (err) {
        showAuthStatus(`Network error: ${err.message}`, "error");
    } finally {
        submitLoginBtn.disabled = false;
        submitLoginBtn.textContent = "Sign In to Account";
    }
}

async function registerUser() {
    const username = registerUsernameInput.value.trim();
    const password = registerPasswordInput.value;
    const confirm_password = registerConfirmPasswordInput.value;

    if (!username || !password || !confirm_password) {
        showAuthStatus("Please fill in all fields.", "error");
        return;
    }

    if (password.length < 6) {
        showAuthStatus("Password must be at least 6 characters.", "error");
        return;
    }

    if (password !== confirm_password) {
        showAuthStatus("Passwords do not match.", "error");
        return;
    }

    submitRegisterBtn.disabled = true;
    submitRegisterBtn.textContent = "Creating Account...";
    hideAuthStatus();

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, confirm_password })
        });
        const data = await response.json();
        
        if (response.ok) {
            showAuthStatus("Account created successfully! Switching to sign in...", "success");
            setTimeout(() => {
                registerUsernameInput.value = '';
                registerPasswordInput.value = '';
                registerConfirmPasswordInput.value = '';
                tabLoginBtn.click();
                loginUsernameInput.value = username;
                loginPasswordInput.focus();
            }, 1800);
        } else {
            showAuthStatus(data.error || "Registration failed.", "error");
        }
    } catch (err) {
        showAuthStatus(`Network error: ${err.message}`, "error");
    } finally {
        submitRegisterBtn.disabled = false;
        submitRegisterBtn.textContent = "Create Account";
    }
}

async function logoutUser() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        userProfileWidget.style.display = 'none';
        authOverlay.style.display = 'flex';
        addConsoleLog("Logged out from SaaS session.", "system");
        
        // Reset state
        detectedVideos = [];
        activeVideo = null;
        renderVideoList();
        clearCanvas();
        canvasPlaceholder.style.display = 'flex';
        editorVideo.style.display = 'none';
    } catch (err) {
        addConsoleLog(`Logout failed: ${err.message}`, 'error');
    }
}

function showAuthStatus(message, type) {
    if (type === 'error') {
        authError.textContent = message;
        authError.style.display = 'block';
        authSuccess.style.display = 'none';
    } else {
        authSuccess.textContent = message;
        authSuccess.style.display = 'block';
        authError.style.display = 'none';
    }
}

function hideAuthStatus() {
    authError.style.display = 'none';
    authSuccess.style.display = 'none';
}

// ----------------------------------------------------
// Browser Drag & Drop Web Uploader
// ----------------------------------------------------

const dropZone = document.getElementById('drop-zone');
const webFileInput = document.getElementById('web-file-input');
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadProgressFill = document.getElementById('upload-progress-fill');
const uploadFilenameText = document.getElementById('upload-filename');
const uploadPctText = document.getElementById('upload-pct');

function setupUploadEventListeners() {
    // Click on dropzone triggers input click
    dropZone.addEventListener('click', () => {
        webFileInput.click();
    });

    webFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    // Drag-and-drop triggers
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    }, false);
}

function handleFileUpload(file) {
    if (!file.type.startsWith('video/')) {
        addConsoleLog("Error: Only video files are allowed for upload.", "error");
        return;
    }

    addConsoleLog(`Starting cloud upload of ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`, "system");
    uploadFilenameText.textContent = file.name;
    uploadProgressContainer.style.display = 'block';
    uploadProgressFill.style.width = '0%';
    uploadPctText.textContent = '0%';

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            uploadProgressFill.style.width = `${pct}%`;
            uploadPctText.textContent = `${pct}%`;
        }
    });

    xhr.addEventListener('load', () => {
        uploadProgressContainer.style.display = 'none';
        if (xhr.status === 200) {
            const info = JSON.parse(xhr.responseText);
            addConsoleLog(`Upload complete! Successfully analyzed metadata.`, "success");
            
            // Push uploaded video metadata directly to current list
            detectedVideos.push(info);
            renderVideoList();
            
            // Set uploaded video as active immediately
            const videoItems = videoList.querySelectorAll('.video-item');
            const newIndex = detectedVideos.length - 1;
            if (videoItems[newIndex]) {
                videoItems[newIndex].click();
            }
        } else {
            let errMsg = "Upload failed.";
            try {
                const res = JSON.parse(xhr.responseText);
                errMsg = res.error || errMsg;
            } catch(err) {}
            addConsoleLog(`Error: ${errMsg}`, "error");
        }
    });

    xhr.addEventListener('error', () => {
        uploadProgressContainer.style.display = 'none';
        addConsoleLog("Network error during upload.", "error");
    });

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
}

// ----------------------------------------------------
// Premium Custom Outro End-Screen Management
// ----------------------------------------------------
let outroEnabled = false;
let outroPath = '';
let outroDuration = 3.0;

const outroToggle = document.getElementById('end-screen-toggle');
const outroConfigFields = document.getElementById('end-screen-config-fields');
const outroDropZone = document.getElementById('end-screen-drop-zone');
const outroFileInput = document.getElementById('end-screen-file-input');
const outroPreviewContainer = document.getElementById('end-screen-preview-container');
const outroMediaPreview = document.getElementById('end-screen-media-preview');
const outroRemoveBtn = document.getElementById('end-screen-remove-btn');
const outroDurationSlider = document.getElementById('end-screen-duration-slider');
const outroDurationVal = document.getElementById('end-screen-duration-val');

async function loadUserSettings() {
    try {
        const res = await fetch('/api/settings');
        const settings = await res.json();
        if (res.ok) {
            outroEnabled = settings.end_screen_enabled;
            outroPath = settings.end_screen_path;
            outroDuration = settings.end_screen_duration;
            
            // Sync UI fields
            outroToggle.checked = outroEnabled;
            outroConfigFields.style.display = outroEnabled ? 'flex' : 'none';
            outroDurationSlider.value = outroDuration;
            outroDurationVal.textContent = `${outroDuration.toFixed(1)}s`;
            
            if (outroPath) {
                const filename = outroPath.split(/[\\/]/).pop();
                outroMediaPreview.textContent = `Attached: ${filename}`;
                outroPreviewContainer.style.display = 'flex';
            } else {
                outroMediaPreview.textContent = 'No file selected';
                outroPreviewContainer.style.display = 'none';
            }
            
            addConsoleLog("SaaS persistent configurations sync completed.", "system");
        }
    } catch(err) {
        addConsoleLog(`Failed to fetch persistent user settings: ${err.message}`, "error");
    }
}

async function saveUserSettings() {
    try {
        const payload = {
            end_screen_enabled: outroEnabled,
            end_screen_path: outroPath,
            end_screen_duration: outroDuration
        };
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const data = await res.json();
            addConsoleLog(`Failed to save settings: ${data.error}`, 'error');
        }
    } catch(err) {
        addConsoleLog(`Error saving settings: ${err.message}`, 'error');
    }
}

function setupOutroEventListeners() {
    // Checkbox Toggle
    outroToggle.addEventListener('change', (e) => {
        outroEnabled = e.target.checked;
        outroConfigFields.style.display = outroEnabled ? 'flex' : 'none';
        saveUserSettings();
        addConsoleLog(`Custom outro end screen is now: ${outroEnabled ? 'ENABLED' : 'DISABLED'}`, 'system');
    });

    // Duration Slider
    outroDurationSlider.addEventListener('input', (e) => {
        outroDuration = parseFloat(e.target.value);
        outroDurationVal.textContent = `${outroDuration.toFixed(1)}s`;
    });
    
    outroDurationSlider.addEventListener('change', () => {
        saveUserSettings();
        addConsoleLog(`Outro duration saved: ${outroDuration.toFixed(1)}s`, 'system');
    });

    // Upload Click
    outroDropZone.addEventListener('click', () => {
        outroFileInput.click();
    });

    outroFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleOutroUpload(e.target.files[0]);
        }
    });

    // Drag-and-drop triggers
    ['dragenter', 'dragover'].forEach(eventName => {
        outroDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            outroDropZone.style.borderColor = '#8b5cf6';
            outroDropZone.style.background = 'rgba(139, 92, 246, 0.05)';
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        outroDropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            outroDropZone.style.borderColor = 'rgba(15, 23, 42, 0.12)';
            outroDropZone.style.background = 'transparent';
        }, false);
    });

    outroDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleOutroUpload(files[0]);
        }
    }, false);

    // Remove Outro file
    outroRemoveBtn.addEventListener('click', () => {
        outroPath = '';
        outroPreviewContainer.style.display = 'none';
        outroMediaPreview.textContent = 'No file selected';
        saveUserSettings();
        addConsoleLog('Custom Outro screen removed.', 'system');
    });
}

function handleOutroUpload(file) {
    addConsoleLog(`Uploading custom outro file: ${file.name}...`, "system");
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
            const res = JSON.parse(xhr.responseText);
            outroPath = res.path;
            outroMediaPreview.textContent = `Attached: ${file.name}`;
            outroPreviewContainer.style.display = 'flex';
            addConsoleLog("Custom Outro saved permanently!", "success");
        } else {
            addConsoleLog("Outro upload failed.", "error");
        }
    });

    xhr.addEventListener('error', () => {
        addConsoleLog("Network error during Outro upload.", "error");
    });

    xhr.open('POST', '/api/settings/upload-end-screen');
    xhr.send(formData);
}

// Password Visibility Show/Hide Overlay
function setupPasswordToggles() {
    const toggleBtns = document.querySelectorAll('.premium-password-toggle-btn');
    toggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                btn.classList.add('visible');
                btn.innerHTML = `<svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
            } else {
                input.type = 'password';
                btn.classList.remove('visible');
                btn.innerHTML = `<svg class="eye-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
            }
        });
    });
}

