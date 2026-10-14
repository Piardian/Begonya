import os

def ensure_diagnostics_directory(base_path: str):
    """
    'diagnostics' klasörünün varlığını kontrol eder, yoksa oluşturur.
    """
    diag_path = os.path.join(base_path, 'diagnostics')
    if not os.path.exists(diag_path):
        os.makedirs(diag_path)
        return f"Dizin oluşturuldu: {diag_path}"
    return f"Dizin zaten mevcut: {diag_path}"

def log_diagnostic_result(base_path: str, message: str):
    """
    Teşhis sonuçlarını 'diagnostics' klasörü altına bir log dosyasına yazar.
    """
    diag_path = os.path.join(base_path, 'diagnostics', 'analysis.log')
    with open(diag_path, 'a', encoding='utf-8') as f:
        f.write(f"{message}\n")
