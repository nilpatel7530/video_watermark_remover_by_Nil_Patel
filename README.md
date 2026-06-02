# Video Watermark Remover (by Nil Patel - SNP Solutions)

A robust, full-featured Flask web application designed to clean video files by removing watermarks, trimming intro/outro segments, and appending customized end-screens. This tool is built specifically to automate and streamline video processing workflows (e.g., prepping short-form content).

---

## 🚀 Key Features

* **User Authentication & Session Management**:
  * Secure registration, login, and logout flow using bcrypt-equivalent secure hashing.
  * Session-backed API access using Flask cookies.
  * Persistent user state stored in SQLite.

* **Advanced Watermark Removal Modes**:
  * 💧 **Blur**: Crops the watermark region, scales down to `6x6` pixels, scales back up via bicubic interpolation, and applies a box blur. This blends the watermark area with the background colors dynamically.
  * ❌ **Erase**: Applies the standard FFmpeg `delogo` algorithm to seamlessly dissolve/interpolate bounding box pixels.
  * ✂️ **Crop**: Trims the coordinate boundaries of the video to exclude watermarked edges.

* **Precise Video Trimming**:
  * Trim frame-by-frame from both the beginning (intro) and end (outro) of videos.

* **Custom End-Screen Outros**:
  * Upload static images (`.png`, `.jpg`, etc.) or outro videos to append to the end of the processed file.
  * Dynamically scales and pads the end screen to match the input video dimensions, frame rate, and aspect ratio.

* **Desktop & Web Integration**:
  * Features a web UI that can trigger native Windows desktop directory selectors and file-selection dialogs (using `tkinter`).
  * Asynchronously processes videos in background threads with progress feedback (0-100%).
  * Automatically detects bundled `ffmpeg` and `ffprobe` binaries for standalone packaging.

---

## 🗄️ Database Architecture (SQLite)

The application uses an SQLite database (`users.db`) with two primary tables:

### 1. `users` Table
Stores basic credentials and metadata for user accounts.
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. `user_settings` Table
Holds the outro configuration values for each user.
```sql
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    end_screen_enabled INTEGER DEFAULT 0,
    end_screen_path TEXT,
    end_screen_duration REAL DEFAULT 3.0,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
```

---

## 🔌 API Endpoint Reference

### Authentication Endpoints
* **`POST /api/auth/register`**: Registers a new user. Expects `username`, `password`, and `confirm_password`.
* **`POST /api/auth/login`**: Authenticates a user and starts a session.
* **`POST /api/auth/logout`**: Clears the active user session.
* **`GET /api/auth/status`**: Returns the current login status and username.

### Settings Endpoints
* **`GET /api/settings`**: Retrieves the current user's outro configuration.
* **`POST /api/settings`**: Saves custom outro settings (toggle, path, and duration).
* **`POST /api/settings/upload-end-screen`**: Uploads a custom image/video to use as an outro.

### File Selector & Directory Endpoints
* **`POST /api/select-directory`**: Launches a native Tkinter folder selector.
* **`POST /api/select-files`**: Launches a native Tkinter file picker.
* **`POST /api/list-videos`**: Lists all supported videos in a given directory path.
* **`POST /api/video-info`**: Extracts video dimensions, frame rate, and duration using `ffprobe`.
* **`POST /api/open-directory`**: Opens a directory on the local system.
* **`GET /api/stream-video`**: Streams files locally to the frontend web browser.

---

## 🛠️ Technical Details & Code Design

### FFmpeg Integration
Watermark removal, trimming, and outro additions are handled via system subprocesses.
* **Progress Tracking**: The app parses stderr from `ffmpeg` via the `-progress` pipe. It matches `out_time_us` against the total duration to calculate the 0-100% processing percentage in real-time.
* **Smart Blur Syntax**:
  ```bash
  [0:v]crop=w:h:x:y,scale=6:6:flags=bicubic,scale=w:h:flags=bicubic,boxblur=luma_radius=10:luma_power=2[blurred];[0:v][blurred]overlay=x:y
  ```

### Packaging & Standalone Execution
`app.py` detects if the script is run in a compiled state (e.g., using `PyInstaller`). If it is `frozen`, it maps template/static paths to `sys._MEIPASS` and looks for bundled `ffmpeg.exe`/`ffprobe.exe` binaries next to the executable.

---

## 📦 Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/nilpatel7530/video_watermark_remover_by_Nil_Patel.git
   cd video_watermark_remover_by_Nil_Patel
   ```

2. **Configure Virtual Environment**:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```

3. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Ensure FFmpeg is Installed**:
   Make sure `ffmpeg` and `ffprobe` are added to your system environment variables (`PATH`), or place them in the root folder of the project.

5. **Run the App**:
   ```bash
   python app.py
   ```
   Open your browser to `http://127.0.0.1:5000` to start cleaning your videos!
