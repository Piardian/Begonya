from research.diagnostic_engine import DiagnosticEngine

def main():
    # Teşhis motorunu başlat
    # data_root, sinyal verilerinin bulunduğu dizini temsil eder
    engine = DiagnosticEngine(data_root="./data")
    
    print("Teşhis süreci başlatılıyor...")
    engine.run_diagnostic()
    print("İşlem tamamlandı.")

if __name__ == "__main__":
    main()
