import os
import sys
import shutil
import subprocess

def locate_binary(name):
    """Find the path of a system binary."""
    path = shutil.which(name)
    if path:
        return path
    # Common Winget/Gyan fallbacks
    user_profile = os.environ.get('USERPROFILE', 'C:\\Users\\Nilpa')
    fallback_dir = os.path.join(user_profile, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages')
    if os.path.exists(fallback_dir):
        for root, dirs, files in os.walk(fallback_dir):
            if f"{name}.exe" in files:
                return os.path.join(root, f"{name}.exe")
    return None

def main():
    print("=" * 60)
    print("      SNP SOLUTIONS BUILD SYSTEM - STANDALONE COMPILER      ")
    print("=" * 60)
    
    # 1. Locate FFmpeg & FFprobe
    print("[*] Locating FFmpeg and FFprobe binaries...")
    ffmpeg_path = locate_binary("ffmpeg")
    ffprobe_path = locate_binary("ffprobe")
    
    if not ffmpeg_path or not ffprobe_path:
        print("[!] ERROR: Could not find ffmpeg or ffprobe binaries on this system!")
        print("Please ensure FFmpeg is installed and added to your system PATH.")
        sys.exit(1)
        
    print(f" -> Found FFmpeg:  {ffmpeg_path}")
    print(f" -> Found FFprobe: {ffprobe_path}")
    
    # 2. Copy binaries to project folder for bundling
    print("[*] Copying binaries to project root for PyInstaller...")
    try:
        src_ffmpeg = os.path.abspath(ffmpeg_path)
        dst_ffmpeg = os.path.abspath("ffmpeg.exe")
        if src_ffmpeg.lower() != dst_ffmpeg.lower():
            shutil.copy2(src_ffmpeg, dst_ffmpeg)
            
        src_ffprobe = os.path.abspath(ffprobe_path)
        dst_ffprobe = os.path.abspath("ffprobe.exe")
        if src_ffprobe.lower() != dst_ffprobe.lower():
            shutil.copy2(src_ffprobe, dst_ffprobe)
            
        print(" -> Bundling preparation complete.")
    except Exception as e:
        print(f" -> Info/Warning during copy: {e}")
    
    # 3. Build with PyInstaller using the Spec file
    # We will modify the Spec file to bundle ffmpeg.exe and ffprobe.exe
    print("[*] Compiling app with PyInstaller...")
    
    # Let's call PyInstaller directly
    try:
        # Build command: pyinstaller Video_Watermark_Remover_SNP_Solutions.spec
        cmd = [
            "pyinstaller", 
            "--clean", 
            "Video_Watermark_Remover_SNP_Solutions.spec"
        ]
        print(f"Executing: {' '.join(cmd)}")
        subprocess.run(cmd, check=True)
        print("\n[*] PyInstaller compilation COMPLETED successfully!")
        print(" -> Standing executable created in dist/Video_Watermark_Remover_SNP_Solutions/")
    except subprocess.CalledProcessError as e:
        print(f"[!] PyInstaller compilation FAILED: {e}")
        sys.exit(1)
        
    # 4. Clean up temporary root copies to keep source directory clean
    print("[*] Cleaning up temporary root copies...")
    try:
        if os.path.exists("ffmpeg.exe"):
            os.remove("ffmpeg.exe")
        if os.path.exists("ffprobe.exe"):
            os.remove("ffprobe.exe")
        print(" -> Cleaned up source binaries.")
    except Exception as e:
        print(f" -> Warning during cleanup: {e}")
        
    print("\n" + "=" * 60)
    print(" BUILD SUCCESS! Your self-contained package is ready in dist/ folder.")
    print("=" * 60)

if __name__ == '__main__':
    main()
