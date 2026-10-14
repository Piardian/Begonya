import os

def analyze_directory_structure(root_path: str) -> dict:
    """
    Belirtilen dizindeki dosyaları ve yapıyı analiz eder.
    Dosya içeriğini değiştirmez, sadece okuma yapar.
    """
    analysis = {
        "root": root_path,
        "files": [],
        "diagnostics_found": False
    }
    
    for root, dirs, files in os.walk(root_path):
        if 'diagnostics' in dirs:
            analysis["diagnostics_found"] = True
        
        for file in files:
            analysis["files"].append(os.path.join(root, file))
            
    return analysis

def perform_read_only_check(file_path: str) -> str:
    """
    Dosyanın varlığını kontrol eder ve basit bir okuma testi yapar.
    """
    if os.path.exists(file_path):
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read(100) # Sadece ilk 100 karakteri oku
                return f"Dosya okundu: {file_path} (İlk 100 karakter: {content[:20]}...)"
        except Exception as e:
            return f"Okuma hatası: {str(e)}"
    return "Dosya bulunamadı."
