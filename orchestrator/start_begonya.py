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
LOCK_FILE = BASE_DIR / "orchestrator" / "begonya_orchestrator.lock"

def is_pid_running(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            out = subprocess.check_output(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                text=True, stderr=subprocess.DEVNULL
            ).strip().lower()
            return "python" in out
        except Exception:
            return False
    return False

def acquire_orchestrator_lock() -> bool:
    for attempt in range(2):
        try:
            fd = os.open(str(LOCK_FILE), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(str(os.getpid()))
            return True
        except FileExistsError:
            try:
                old_pid = int(LOCK_FILE.read_text(encoding="utf-8").strip())
                if is_pid_running(old_pid):
                    print(f"[Begonya Orchestrator] ℹ️ Begonya zaten çalışıyor (PID: {old_pid}). Çıkılıyor.")
                    return False
                LOCK_FILE.unlink(missing_ok=True)
            except Exception:
                try:
                    LOCK_FILE.unlink(missing_ok=True)
                except Exception:
                    pass
        except Exception as e:
            print(f"[Begonya Orchestrator] ⚠️ Kilit dosyası oluşturulamadı: {e}")
            return True
    return False

def release_orchestrator_lock():
    try:
        if LOCK_FILE.exists():
            LOCK_FILE.unlink()
    except Exception:
        pass

def cleanup_stale_lock():
    lock_file = SMC_DIR / "data" / "runtime.lock"
    if lock_file.exists():
        try:
            lock_file.unlink()
            print("[Begonya Orchestrator] 🧹 Eski runtime.lock temizlendi.")
        except Exception as e:
            print(f"[Begonya Orchestrator] ⚠️ runtime.lock silinemedi: {e}")

def run_macro_sync():
    print("\n[Begonya Orchestrator] 🚀 1. Makro Rejim Motoru İlk Analiz Döngüsü Çalıştırılıyor...")
    cmd = [sys.executable, str(MACRO_DIR / "main.py")]
    try:
        res = subprocess.run(cmd, cwd=str(MACRO_DIR), timeout=180)
        if res.returncode == 0:
            print("[Begonya Orchestrator] ✅ Makro Kapı Verisi Başarıyla Güncellendi.")
        else:
            print(f"[Begonya Orchestrator] ⚠️ Makro Motor {res.returncode} kodu ile tamamlandı.")
    except Exception as e:
        print(f"[Begonya Orchestrator] ⚠️ Makro ilk döngü hatası: {e}")

def spawn_macro_daemon():
    print("[Begonya Orchestrator] 📡 Makro Daemon başlatılıyor...")
    daemon_cmd = [sys.executable, str(MACRO_DIR / "daemon" / "macro_scheduler.py")]
    return subprocess.Popen(daemon_cmd, cwd=str(MACRO_DIR))

def spawn_smc_engine():
    print("[Begonya Orchestrator] 🎯 SMC Engine başlatılıyor...")
    cleanup_stale_lock()
    node_script = str(SMC_DIR / "dist" / "server" / "index.js")
    cmd = ["node", node_script]
    return subprocess.Popen(cmd, cwd=str(SMC_DIR))

def main():
    if not acquire_orchestrator_lock():
        sys.exit(0)

    print("=" * 70)
    print(" 🌺 BEGONYA: KURUMSAL MAKRO & SMC HİBRİT İŞLEM SİSTEMİ 🌺 ")
    print("=" * 70)
    print("Mimari: Macro Multi-AGI Army + ChecklistTrigger SMC Engine")
    print(f"Konum: {BASE_DIR}")
    print("-" * 70)

    try:
        # 1. Başlangıçta Makro Verisini Senkronize Et
        run_macro_sync()

        # 2. Servisleri Başlat
        p_daemon = spawn_macro_daemon()
        p_smc = spawn_smc_engine()

        print("\n" + "=" * 70)
        print(" 🟢 TÜM BEGONYA SERVİSLERİ AKTİF VE NÖBETTE. DURDURMAK İÇİN CTRL+C.")
        print("=" * 70)

        while True:
            time.sleep(3)

            # Makro Daemon Süpervizör Kontrolü
            if p_daemon.poll() is not None:
                print(f"\n[Begonya Orchestrator] ⚠️ Macro Daemon durdu (Kod: {p_daemon.returncode}). 5s içinde yeniden başlatılıyor...")
                time.sleep(5)
                p_daemon = spawn_macro_daemon()

            # SMC Engine Süpervizör Kontrolü
            if p_smc.poll() is not None:
                print(f"\n[Begonya Orchestrator] ⚠️ SMC Engine durdu (Kod: {p_smc.returncode}). 5s içinde yeniden başlatılıyor...")
                time.sleep(5)
                p_smc = spawn_smc_engine()

    except KeyboardInterrupt:
        print("\n[Begonya Orchestrator] 🛑 Kapatma sinyali alındı...")
        for name, proc in [("Macro Daemon", p_daemon), ("SMC Engine", p_smc)]:
            if proc.poll() is None:
                print(f"  -> {name} sonlandırılıyor...")
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        print("[Begonya Orchestrator] Sistem güvenle kapatıldı.")
    finally:
        release_orchestrator_lock()

if __name__ == "__main__":
    main()

