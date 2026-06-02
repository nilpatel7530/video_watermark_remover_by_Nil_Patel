import os
import sys
import subprocess
import json
import re
import threading
import time
import webbrowser
from flask import Flask, request, jsonify, render_template, Response, send_from_directory
from flask import Flask, request, jsonify, render_template, Response, send_from_directory, session
import database
from functools import wraps

# Initialize SQLite database on startup
database.init_db()

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__, template_folder='templates', static_folder='static')

app.secret_key = "SNP_WATERMARK_REMOVER_SaaS_SECRET_KEY_2026"
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def login_required(f):
    """Decorator to require login session for API endpoints."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized. Please login first.'}), 401
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    confirm_password = data.get('confirm_password', '')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required.'}), 400
        
    if password != confirm_password:
        return jsonify({'error': 'Passwords do not match.'}), 400
        
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters.'}), 400
        
    success = database.create_user(username, password)
    if success:
        return jsonify({'success': True, 'message': 'Account created successfully! Please sign in.'})
    else:
        return jsonify({'error': 'Username is already taken.'}), 400

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    if not username or not password:
        return jsonify({'error': 'Username and password are required.'}), 400
        
    user = database.verify_user(username, password)
    if user:
        session.permanent = True
        session['user_id'] = user['id']
        session['username'] = user['username']
        return jsonify({
            'success': True,
            'message': 'Logged in successfully!',
            'user': {
                'id': user['id'],
                'username': user['username']
            }
        })
    else:
        return jsonify({'error': 'Invalid username or password.'}), 401

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully!'})

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    if 'user_id' in session:
        return jsonify({
            'authenticated': True,
            'username': session['username']
        })
    return jsonify({'authenticated': False})

@app.route('/api/settings', methods=['GET'])
@login_required
def get_settings():
    user_id = session['user_id']
    settings = database.get_user_settings(user_id)
    return jsonify(settings)

@app.route('/api/settings', methods=['POST'])
@login_required
def save_settings():
    user_id = session['user_id']
    data = request.json or {}
    enabled = bool(data.get('end_screen_enabled', False))
    path = data.get('end_screen_path', '').strip()
    duration = float(data.get('end_screen_duration', 3.0))
    
    success = database.save_user_settings(user_id, enabled, path, duration)
    if success:
        return jsonify({'success': True, 'message': 'Settings saved permanently.'})
    return jsonify({'error': 'Failed to save settings.'}), 500

from werkzeug.utils import secure_filename

@app.route('/api/settings/upload-end-screen', methods=['POST'])
@login_required
def upload_end_screen():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
        
    # Ensure end screens dir exists
    end_screens_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'end_screens')
    os.makedirs(end_screens_dir, exist_ok=True)
    
    filename = secure_filename(file.filename)
    unique_name = f"outro_{int(time.time())}_{filename}"
    filepath = os.path.join(end_screens_dir, unique_name)
    file.save(filepath)
    
    # Save automatically to settings
    user_id = session['user_id']
    current_settings = database.get_user_settings(user_id)
    database.save_user_settings(
        user_id, 
        current_settings['end_screen_enabled'], 
        filepath, 
        current_settings['end_screen_duration']
    )
    
    return jsonify({
        'success': True,
        'path': filepath,
        'filename': filename
    })


@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Empty filename'}), 400
        
    filename = secure_filename(file.filename)
    unique_name = f"{int(time.time())}_{filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
    file.save(filepath)
    
    info = get_video_info(filepath)
    if info:
        return jsonify(info)
    else:
        try:
            os.remove(filepath)
        except Exception:
            pass
        return jsonify({'error': 'Could not read video metadata.'}), 400



def get_ffmpeg_command():
    """Locate the FFmpeg binary, checking for bundled/local versions first."""
    if getattr(sys, 'frozen', False):
        # next to compiled executable
        local_dir = os.path.dirname(sys.executable)
        local_ffmpeg = os.path.join(local_dir, 'ffmpeg.exe')
        if os.path.exists(local_ffmpeg):
            return local_ffmpeg
            
        # inside PyInstaller temp dir
        meipass_ffmpeg = os.path.join(sys._MEIPASS, 'ffmpeg.exe')
        if os.path.exists(meipass_ffmpeg):
            return meipass_ffmpeg
            
    # default to system path
    return 'ffmpeg'

def get_ffprobe_command():
    """Locate the FFprobe binary, checking for bundled/local versions first."""
    if getattr(sys, 'frozen', False):
        local_dir = os.path.dirname(sys.executable)
        local_ffprobe = os.path.join(local_dir, 'ffprobe.exe')
        if os.path.exists(local_ffprobe):
            return local_ffprobe
            
        meipass_ffprobe = os.path.join(sys._MEIPASS, 'ffprobe.exe')
        if os.path.exists(meipass_ffprobe):
            return meipass_ffprobe
            
    return 'ffprobe'

# In-memory store for active job progress
jobs_progress = {}

def get_video_info(video_path):
    """Extract video duration, width, height, and frame rate using ffprobe."""
    if not os.path.exists(video_path):
        return None
    
    cmd = [
        get_ffprobe_command(),
        '-v', 'error',
        '-show_entries', 'format=duration:stream=width,height,r_frame_rate',
        '-of', 'json',
        video_path
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        data = json.loads(result.stdout)
        
        # Extract stream info
        streams = data.get('streams', [{}])
        video_stream = next((s for s in streams if 'width' in s), {})
        
        width = video_stream.get('width')
        height = video_stream.get('height')
        
        # Get frame rate
        r_frame_rate = video_stream.get('r_frame_rate', '30/1')
        if '/' in r_frame_rate:
            num, den = map(int, r_frame_rate.split('/'))
            fps = round(num / den, 2) if den != 0 else 30.0
        else:
            fps = float(r_frame_rate)
            
        # Get duration (check stream first, then format)
        duration_str = video_stream.get('duration') or data.get('format', {}).get('duration')
        duration = float(duration_str) if duration_str else 0.0
        
        return {
            'width': width,
            'height': height,
            'duration': duration,
            'fps': fps,
            'filename': os.path.basename(video_path),
            'path': video_path
        }
    except Exception as e:
        print(f"Error reading video info: {e}")
        return None

def parse_time_to_seconds(time_str):
    """Convert HH:MM:SS.xx to seconds."""
    parts = time_str.split(':')
    if len(parts) == 3:
        return float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
    return 0.0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/list-videos', methods=['POST'])
@login_required
def list_videos():
    data = request.json or {}
    directory = data.get('path', '').strip()
    
    if not directory:
        return jsonify({'error': 'Directory path is required'}), 400
        
    if not os.path.isdir(directory):
        return jsonify({'error': 'Invalid directory path'}), 400
        
    try:
        videos = []
        valid_extensions = ('.mp4', '.mov', '.mkv', '.avi', '.webm')
        for file in os.listdir(directory):
            if file.lower().endswith(valid_extensions):
                full_path = os.path.join(directory, file)
                info = get_video_info(full_path)
                if info:
                    videos.append(info)
                    
        return jsonify({'videos': videos})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/video-info', methods=['POST'])
@login_required
def video_info():
    data = request.json or {}
    video_path = data.get('video_path', '').strip()
    
    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video file not found'}), 404
        
    info = get_video_info(video_path)
    if info:
        return jsonify(info)
    return jsonify({'error': 'Could not read video metadata'}), 500

@app.route('/api/open-directory', methods=['POST'])
@login_required
def open_directory():
    data = request.json or {}
    path = data.get('path', '').strip()
    if os.path.exists(path):
        if os.path.isfile(path):
            path = os.path.dirname(path)
        os.startfile(path)
        return jsonify({'success': True})
    return jsonify({'error': 'Directory not found'}), 404

@app.route('/api/stream-video')
@login_required
def stream_video():
    video_path = request.args.get('path', '').strip()
    if not video_path or not os.path.exists(video_path):
        return "File not found", 404
    
    directory = os.path.dirname(video_path)
    filename = os.path.basename(video_path)
    return send_from_directory(directory, filename)

@app.route('/api/select-directory', methods=['POST'])
@login_required
def select_directory():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        dir_path = filedialog.askdirectory(title="Select Folder Containing Shorts")
        root.destroy()
        return jsonify({'path': dir_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/select-files', methods=['POST'])
@login_required
def select_files():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_paths = filedialog.askopenfilenames(
            title="Select Video Shorts to Clean",
            filetypes=[("Video Files", "*.mp4 *.mov *.mkv *.avi *.webm")]
        )
        root.destroy()
        
        if not file_paths:
            return jsonify({'videos': []})
            
        videos = []
        for path in file_paths:
            info = get_video_info(path)
            if info:
                videos.append(info)
        return jsonify({'videos': videos})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def run_ffmpeg_process(job_id, video_path, output_path, intro_trim, outro_trim, watermark_action, watermark_coords, duration, end_screen_settings=None):
    """Run FFmpeg process in background and report progress via jobs_progress dict."""
    try:
        jobs_progress[job_id] = {'status': 'processing', 'progress': 0, 'log': 'Starting FFmpeg...'}
        
        # Calculate target duration
        target_duration = duration - intro_trim - outro_trim
        if target_duration <= 0:
            jobs_progress[job_id] = {'status': 'error', 'progress': 0, 'log': 'Error: Trim duration exceeds video length.'}
            return

        # Build FFmpeg filters
        filters = []
        
        if watermark_action == 'crop' and watermark_coords:
            # Crop syntax: crop=w:h:x:y
            x = int(watermark_coords.get('x', 0))
            y = int(watermark_coords.get('y', 0))
            w = int(watermark_coords.get('w', 100))
            h = int(watermark_coords.get('h', 100))
            filters.append(f"crop={w}:{h}:{x}:{y}")
            
        elif watermark_action == 'blur' and watermark_coords:
            # Low-frequency background color matching blur:
            x = int(watermark_coords.get('x', 0))
            y = int(watermark_coords.get('y', 0))
            w = int(watermark_coords.get('w', 100))
            h = int(watermark_coords.get('h', 100))
            filter_str = f"[0:v]crop={w}:{h}:{x}:{y},scale=6:6:flags=bicubic,scale={w}:{h}:flags=bicubic,boxblur=luma_radius=10:luma_power=2[blurred];[0:v][blurred]overlay={x}:{y}"
            
        elif watermark_action == 'erase' and watermark_coords:
            # Smart delogo filter to erase watermark
            x = int(watermark_coords.get('x', 0))
            y = int(watermark_coords.get('y', 0))
            w = int(watermark_coords.get('w', 100))
            h = int(watermark_coords.get('h', 100))
            filter_str = f"delogo=x={x}:y={y}:w={w}:h={h}:show=0"
            
        # Determine if we can do copy or need transcode
        cmd = [get_ffmpeg_command(), '-y', '-i', video_path]
        
        if intro_trim > 0 or outro_trim > 0:
            cmd.extend(['-ss', f"{intro_trim:.3f}", '-t', f"{target_duration:.3f}"])
            
        if (watermark_action == 'blur' or watermark_action == 'crop' or watermark_action == 'erase') and watermark_coords:
            if watermark_action == 'crop':
                cmd.extend(['-vf', filters[0]])
            elif watermark_action == 'erase':
                cmd.extend(['-vf', filter_str])
            else: # blur
                cmd.extend(['-filter_complex', filter_str])
            cmd.extend(['-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-c:a', 'aac'])
        else:
            # Lossless copy if only trimming
            cmd.extend(['-c', 'copy'])
            
        # Force progress output to stdout/stderr
        cmd.extend(['-progress', 'pipe:1', output_path])
        
        print(f"Executing: {' '.join(cmd)}")
        
        # Start subprocess
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        
        # Read progress from stdout
        pattern = re.compile(r'out_time_us=(\d+)')
        
        while True:
            line = process.stdout.readline()
            if not line:
                break
                
            match = pattern.search(line)
            if match:
                us = int(match.group(1))
                secs = us / 1000000.0
                if target_duration > 0:
                    pct = min(int((secs / target_duration) * 100), 99)
                    jobs_progress[job_id]['progress'] = pct
                    jobs_progress[job_id]['log'] = f"Processing... {pct}% complete"
            
            # Keep log updated with any other text
            if 'fps=' in line or 'speed=' in line:
                jobs_progress[job_id]['log'] = line.strip()
 
        process.wait()
        
        if process.returncode == 0:
            # Check for custom end screen
            if end_screen_settings and end_screen_settings.get('enabled') and os.path.exists(end_screen_settings.get('path', '')):
                try:
                    jobs_progress[job_id]['log'] = 'Applying custom end screen...'
                    
                    cleaned_info = get_video_info(output_path)
                    if cleaned_info:
                        width = cleaned_info['width']
                        height = cleaned_info['height']
                        fps = cleaned_info['fps']
                        duration_outro = float(end_screen_settings.get('duration', 3.0))
                        outro_source = end_screen_settings.get('path')
                        
                        temp_output_path = output_path + ".temp.mp4"
                        os.rename(output_path, temp_output_path)
                        
                        temp_outro_path = output_path + ".outro.mp4"
                        
                        ext = os.path.splitext(outro_source.lower())[1]
                        is_image = ext in ('.png', '.jpg', '.jpeg', '.webp', '.bmp')
                        
                        if is_image:
                            outro_cmd = [
                                get_ffmpeg_command(), '-y',
                                '-loop', '1', '-i', outro_source,
                                '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
                                '-vf', f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                                '-t', str(duration_outro),
                                '-r', str(fps),
                                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
                                temp_outro_path
                            ]
                        else:
                            outro_cmd = [
                                get_ffmpeg_command(), '-y',
                                '-i', outro_source,
                                '-vf', f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                                '-r', str(fps),
                                '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
                                temp_outro_path
                            ]
                            
                        subprocess.run(outro_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                        
                        # Concatenate
                        concat_cmd = [
                            get_ffmpeg_command(), '-y',
                            '-i', temp_output_path,
                            '-i', temp_outro_path,
                            '-filter_complex', '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]',
                            '-map', '[outv]', '-map', '[outa]',
                            '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
                            output_path
                        ]
                        
                        subprocess.run(concat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
                        
                        try:
                            os.remove(temp_output_path)
                            os.remove(temp_outro_path)
                        except Exception:
                            pass
                except Exception as e:
                    print(f"Failed to append custom end screen: {e}")
                    # Restore original if rename happened
                    if os.path.exists(temp_output_path) and not os.path.exists(output_path):
                        os.rename(temp_output_path, output_path)

            jobs_progress[job_id] = {
                'status': 'completed',
                'progress': 100,
                'log': 'Video cleaned successfully!',
                'output_path': output_path
            }
        else:
            jobs_progress[job_id] = {
                'status': 'error',
                'progress': 0,
                'log': f'FFmpeg failed with exit code {process.returncode}'
            }
            
    except Exception as e:
        jobs_progress[job_id] = {
            'status': 'error',
            'progress': 0,
            'log': f'Exception during processing: {str(e)}'
        }

@app.route('/api/process', methods=['POST'])
@login_required
def process_video():
    data = request.json or {}
    video_path = data.get('video_path', '').strip()
    intro_trim = float(data.get('intro_trim', 0.0))
    outro_trim = float(data.get('outro_trim', 0.0))
    watermark_action = data.get('watermark_action', 'none') # 'blur', 'crop', 'none'
    watermark_coords = data.get('watermark_coords') # {x, y, w, h}
    
    if not video_path or not os.path.exists(video_path):
        return jsonify({'error': 'Video path does not exist'}), 404
        
    info = get_video_info(video_path)
    if not info:
        return jsonify({'error': 'Could not read video info'}), 500
        
    # Get user settings
    user_id = session.get('user_id')
    user_settings = database.get_user_settings(user_id)
    end_screen_settings = {
        'enabled': user_settings['end_screen_enabled'],
        'path': user_settings['end_screen_path'],
        'duration': user_settings['end_screen_duration']
    }
        
    # Set up output paths
    # Save in a subdirectory of the original or a designated Output directory
    dir_name = os.path.dirname(video_path)
    base_name = os.path.basename(video_path)
    name, ext = os.path.splitext(base_name)
    
    output_dir = os.path.join(dir_name, 'cleaned_videos')
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"{name}{ext}")
    
    job_id = f"job_{int(time.time())}"
    jobs_progress[job_id] = {'status': 'queued', 'progress': 0, 'log': 'Starting...'}
    
    # Run the processing in a separate thread so as not to block the UI
    thread = threading.Thread(
        target=run_ffmpeg_process,
        args=(job_id, video_path, output_path, intro_trim, outro_trim, watermark_action, watermark_coords, info['duration'], end_screen_settings)
    )
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'job_id': job_id,
        'output_path': output_path,
        'output_dir': output_dir
    })

@app.route('/api/job-status/<job_id>', methods=['GET'])
@login_required
def job_status(job_id):
    status = jobs_progress.get(job_id)
    if not status:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(status)

# Batch processing endpoint
@app.route('/api/batch-process', methods=['POST'])
@login_required
def batch_process():
    data = request.json or {}
    video_paths = data.get('video_paths', [])
    intro_trim = float(data.get('intro_trim', 0.0))
    outro_trim = float(data.get('outro_trim', 0.0))
    watermark_action = data.get('watermark_action', 'none')
    watermark_coords = data.get('watermark_coords')
    
    if not video_paths:
        return jsonify({'error': 'No video files specified'}), 400
        
    user_id = session.get('user_id')
    user_settings = database.get_user_settings(user_id)
    end_screen_settings = {
        'enabled': user_settings['end_screen_enabled'],
        'path': user_settings['end_screen_path'],
        'duration': user_settings['end_screen_duration']
    }
        
    batch_id = f"batch_{int(time.time())}"
    jobs_progress[batch_id] = {
        'status': 'processing',
        'progress': 0,
        'current_video': '',
        'processed_count': 0,
        'total_count': len(video_paths),
        'log': 'Starting batch process...'
    }
    
    def run_batch():
        total = len(video_paths)
        for idx, path in enumerate(video_paths):
            if not os.path.exists(path):
                continue
                
            filename = os.path.basename(path)
            jobs_progress[batch_id]['current_video'] = filename
            jobs_progress[batch_id]['log'] = f"Processing {idx+1}/{total}: {filename}..."
            
            info = get_video_info(path)
            if not info:
                continue
                
            dir_name = os.path.dirname(path)
            name, ext = os.path.splitext(filename)
            output_dir = os.path.join(dir_name, 'cleaned_videos')
            os.makedirs(output_dir, exist_ok=True)
            output_path = os.path.join(output_dir, f"{name}{ext}")
            
            # Simple unique job ID for the sub-task
            sub_job_id = f"sub_{batch_id}_{idx}"
            
            # Run processing synchronously inside this background thread
            run_ffmpeg_process(sub_job_id, path, output_path, intro_trim, outro_trim, watermark_action, watermark_coords, info['duration'], end_screen_settings)
            
            sub_status = jobs_progress.get(sub_job_id, {})
            if sub_status.get('status') == 'completed':
                jobs_progress[batch_id]['processed_count'] += 1
            
            # Update batch progress overall
            batch_pct = int(((idx + 1) / total) * 100)
            jobs_progress[batch_id]['progress'] = batch_pct
            
        jobs_progress[batch_id]['status'] = 'completed'
        jobs_progress[batch_id]['log'] = f"Successfully completed cleaning {jobs_progress[batch_id]['processed_count']}/{total} videos!"
        
    thread = threading.Thread(target=run_batch)
    thread.daemon = True
    thread.start()
    
    return jsonify({
        'batch_id': batch_id,
        'output_dir': os.path.join(os.path.dirname(video_paths[0]), 'cleaned_videos') if video_paths else ''
    })


if __name__ == '__main__':
    # Start web server
    host = '127.0.0.1'
    port = 5000
    
    # Elegant auto-browser launch
    def open_browser():
        time.sleep(1.5)
        webbrowser.open(f"http://{host}:{port}")
        
    threading.Thread(target=open_browser, daemon=True).start()
    
    print(f"[*] Video Watermark Remover by SNP Solutions running at http://{host}:{port}")
    app.run(host=host, port=port, debug=False)
