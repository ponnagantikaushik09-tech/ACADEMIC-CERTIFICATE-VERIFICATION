import hashlib
from pathlib import Path


def generate_hash(file_path):
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as file:
        while True:
            data = file.read(4096)
            if not data:
                break
            sha256.update(data)
    return sha256.hexdigest()


CERTIFICATES_FOLDER = Path(__file__).resolve().parent
BACKEND_FOLDER = CERTIFICATES_FOLDER.parent / "backend"
HASH_FILE = BACKEND_FOLDER / "Certificate_hashes.txt"


def generate_all_hashes():
    pdf_files = sorted(CERTIFICATES_FOLDER.glob("*.pdf"))
    trusted_hashes = []

    print("========================================")
    print("LYNKSCERT TRUSTED CERTIFICATE REGISTRY")
    print("========================================")
    print(f"Certificates folder: {CERTIFICATES_FOLDER}")
    print(f"PDF files found: {len(pdf_files)}")
    print()

    for pdf_file in pdf_files:
        if "_TAMPERED" in pdf_file.stem.upper():
            print(f"[SKIPPED] {pdf_file.name} -- tampered test file")
            continue

        hash_value = generate_hash(pdf_file)
        trusted_hashes.append(f"{pdf_file.stem}|{hash_value}")
        print(f"[REGISTERED] {pdf_file.name}")
        print(f"           {hash_value}")

    BACKEND_FOLDER.mkdir(parents=True, exist_ok=True)
    HASH_FILE.write_text("\n".join(trusted_hashes) + ("\n" if trusted_hashes else ""), encoding="utf-8")

    print()
    print(f"Trusted certificates: {len(trusted_hashes)}")
    print(f"Registry updated: {HASH_FILE}")


if __name__ == "__main__":
    generate_all_hashes()
