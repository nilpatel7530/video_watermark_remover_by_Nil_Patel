import hashlib
import sys

SECRET_KEY = "SNP_WATERMARK_REMOVER_SECRET_KEY_2026"

def generate_activation_code(fingerprint):
    """Generate the unique activation key for a given fingerprint."""
    raw = f"{fingerprint.strip().upper()}:{SECRET_KEY}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24].upper()

def main():
    print("=" * 60)
    print("      SNP SOLUTIONS - VIDEO WATERMARK REMOVER KEYGEN      ")
    print("=" * 60)
    print("This utility generates secure one-time activation keys for clients.")
    print("Please enter the client's Hardware ID below.\n")
    
    try:
        while True:
            hwid = input("Enter Client Hardware ID (or 'exit' to quit): ").strip()
            if not hwid:
                continue
            if hwid.lower() == 'exit':
                break
                
            code = generate_activation_code(hwid)
            print("-" * 60)
            print(f"Hardware ID:     {hwid.upper()}")
            print(f"Activation Code: {code}")
            print("-" * 60)
            print("\nCopy the Activation Code above and send it to your buyer.\n")
    except KeyboardInterrupt:
        print("\nExiting keygen...")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == '__main__':
    main()
