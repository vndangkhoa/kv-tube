import subprocess
import sys

def update_dependencies():
    print("--- Updating Dependencies ---")
    try:
        # Update ytfetcher
        print("Updating ytfetcher...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "--upgrade", 
            "git+https://github.com/kaya70875/ytfetcher.git"
        ])
        print("--- ytfetcher updated successfully ---")

        # Update yt-dlp (nightly)
        print("Updating yt-dlp (nightly)...")
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", "--upgrade", 
            "git+https://github.com/yt-dlp/yt-dlp.git"
        ])
        print("--- yt-dlp (nightly) updated successfully ---")
        
    except Exception as e:
        print(f"--- Failed to update dependencies: {e} ---")

if __name__ == "__main__":
    update_dependencies()
