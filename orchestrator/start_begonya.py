import subprocess
import sys
import time
import os
import signal
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = Path(__file__).resolve().parent.parent
MACRO_DIR = BASE_DIR / "macro_engine"
SMC_DIR = BASE_DIR / "smc_engine"

def run_macro_sync():
    print("\n[Begonya Orchestrator] 🚀 1. Makro Rejim Motoru İlk Analiz Döngüsü Çalıştırılıyor...")
    cmd = [sys.executable, str(MACRO_DIR / "main.py")]
    res = subprocess.run(cmd, cwd=str(MACRO_DIR))
    if res.returncode == 0:
        print("[Begonya Orchestrator] ✅ Makro Kapı Verisi Başarıyla Güncellendi.")
    else:
        print(f"[Begonya Orchestrator] ⚠️ Makro Motor {res.returncode} kodu ile tamamlandı.")

def main():
    print("=" * 70)
    print(" 🌺 BEGONYA: KURUMSAL MAKRO & SMC HİBRİT İŞLEM SİSTEMİ 🌺 ")
    print("=" * 70)
    print("Mimari: Macro Multi-AGI Army + ChecklistTrigger SMC Engine")
    print(f"Konum: {BASE_DIR}")
    print("-" * 70)

    # 1. Başlangıçta Makro Verisini Güncelle
    run_macro_sync()

    # 2. İsteğe bağlı olarak Daemon ve SMC'yi ayağa kaldır
    processes = []
    try:
        print("\n[Begonya Orchestrator] 📡 2. Arka Plan Makro Daemon Başlatılıyor...")
        daemon_cmd = [sys.executable, str(MACRO_DIR / "daemon" / "macro_scheduler.py")]
        p_daemon = subprocess.Popen(daemon_cmd, cwd=str(MACRO_DIR))
        processes.append(("Macro Daemon", p_daemon))

        print("\n[Begonya Orchestrator] 🎯 3. SMC Poller / Execution Servisi Başlatılıyor...")
        smc_cmd = ["cmd", "/c", "npm", "start"]
        p_smc = subprocess.Popen(smc_cmd, cwd=str(SMC_DIR))
        processes.append(("SMC Engine", p_smc))

        print("\n" + "=" * 70)
        print(" 🟢 TÜM BEGONYA SERVİSLERİ AKTİF. DURDURMAK İÇİN CTRL+C BASINIZ.")
        print("=" * 70)

        while True:
            time.sleep(1)
            for name, proc in processes:
                if proc.poll() is not None:
                    print(f"[Begonya Orchestrator] ⚠️ {name} kapandı (Kod: {proc.returncode})")

    except KeyboardInterrupt:
        print("\n[Begonya Orchestrator] 🛑 Kapatılıyor...")
        for name, proc in processes:
            print(f"  -> {name} sonlandırılıyor...")
            proc.terminate()
        print("[Begonya Orchestrator] Sistem güvenle kapatıldı.")

if __name__ == "__main__":
    main()
