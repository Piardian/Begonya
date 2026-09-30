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
CLT_DIR = BASE_DIR.parent / "swing-bos-core"
LOCK_FILE = BASE_DIR / "orchestrator" / "begonya_orchestrator.lock"

def is_pid_running(pid: int, expected_image: str = "python") -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            out = subprocess.check_output(
                ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                text=True, stderr=subprocess.DEVNULL
            ).strip().lower()
            return expected_image.lower() in out
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
                if is_pid_running(old_pid, "python"):
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

def cleanup_stale_lock(engine_dir: Path, label: str):
    lock_file = engine_dir / "data" / "runtime.lock"
    if lock_file.exists():
        try:
            import json
            data = json.loads(lock_file.read_text(encoding="utf-8"))
            pid = int(data.get("pid", 0))
            if is_pid_running(pid, "node"):
                return
        except Exception:
            pass
        try:
            lock_file.unlink()
            print(f"[Begonya Orchestrator] 🧹 {label} eski runtime.lock temizlendi.")
        except Exception as e:
            print(f"[Begonya Orchestrator] ⚠️ {label} runtime.lock silinemedi: {e}")

def prevent_system_sleep():
    if sys.platform == "win32":
        try:
            import ctypes
            # ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_AWAYMODE_REQUIRED
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001 | 0x00000040)
            print("[Begonya Orchestrator] 🛡️ Windows Uyku Kilidi Aktif Edildi (İşlemler kesintisiz sürecek).")
        except Exception as e:
            print(f"[Begonya Orchestrator] ⚠️ Uyku kilidi uyarısı: {e}")

def restore_system_sleep():
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
            print("[Begonya Orchestrator] 💤 Windows Uyku Kilidi Kaldırıldı.")
        except Exception:
            pass


def run_macro_sync():
    state_file = BASE_DIR / "shared" / "macro_regime_state.json"
    if state_file.exists():
        try:
            age_sec = time.time() - state_file.stat().st_mtime
            if age_sec < 3600:
                print(f"\n[Begonya Orchestrator] ℹ️ Makro Kapı Verisi güncel ({int(age_sec // 60)} dk önce güncellendi). Servisler doğrudan başlatılıyor...")
                return
        except Exception:
            pass
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
    print("[Begonya Orchestrator] 🎯 Begonya SMC Engine başlatılıyor (Port 3010)...")
    cleanup_stale_lock(SMC_DIR, "Begonya SMC")
    node_script = str(SMC_DIR / "dist" / "server" / "index.js")
    env = os.environ.copy()
    env.setdefault("PORT", "3010")
    cmd = ["node", node_script]
    return subprocess.Popen(cmd, cwd=str(SMC_DIR), env=env)

def spawn_clt_engine():
    if not (CLT_DIR / "dist" / "server" / "index.js").exists():
        print(f"[Begonya Orchestrator] ⚠️ ChecklistTrigger bulunamadı: {CLT_DIR}")
        return None
    print("[Begonya Orchestrator] ⚡ ChecklistTrigger (swing-bos-core) başlatılıyor (Port 3000)...")
    cleanup_stale_lock(CLT_DIR, "ChecklistTrigger")
    node_script = str(CLT_DIR / "dist" / "server" / "index.js")
    env = os.environ.copy()
    env.setdefault("PORT", "3000")
    cmd = ["node", node_script]
    return subprocess.Popen(cmd, cwd=str(CLT_DIR), env=env)

def main():
    if not acquire_orchestrator_lock():
        sys.exit(0)

    print("=" * 70)
    print(" 🌺 BEGONYA & CHECKLISTTRIGGER: BİRLEŞİK OTONOM İŞLEM SİSTEMİ 🌺 ")
    print("=" * 70)
    print("Mimari: Macro Multi-AGI Army + Begonya SMC + ChecklistTrigger SMC")
    print(f"Konum: {BASE_DIR} & {CLT_DIR}")
    print("-" * 70)

    p_daemon = None
    p_smc = None
    p_clt = None

    try:
        # 1. Servisleri Anında Başlat (SMC motorları makro senkronizasyonu beklemeden hemen devreye girsin)
        p_daemon = spawn_macro_daemon()
        p_smc = spawn_smc_engine()
        p_clt = spawn_clt_engine()

        # 2. Başlangıçta Makro Verisini Kontrol Et / Güncelle
        run_macro_sync()

        print("\n" + "=" * 70)
        print(" 🟢 BEGONYA VE CHECKLISTTRIGGER AKTİF VE NÖBETTE. DURDURMAK İÇİN CTRL+C.")
        print("=" * 70)
        prevent_system_sleep()

        while True:
            time.sleep(3)

            # Makro Daemon Süpervizör Kontrolü
            if p_daemon is not None and p_daemon.poll() is not None:
                print(f"\n[Begonya Orchestrator] ⚠️ Macro Daemon durdu (Kod: {p_daemon.returncode}). 5s içinde yeniden başlatılıyor...")
                time.sleep(5)
                p_daemon = spawn_macro_daemon()

            # Begonya SMC Engine Süpervizör Kontrolü
            if p_smc is not None and p_smc.poll() is not None:
                print(f"\n[Begonya Orchestrator] ⚠️ Begonya SMC Engine durdu (Kod: {p_smc.returncode}). 5s içinde yeniden başlatılıyor...")
                time.sleep(5)
                p_smc = spawn_smc_engine()

            # ChecklistTrigger (swing-bos-core) Süpervizör Kontrolü
            if p_clt is not None and p_clt.poll() is not None:
                print(f"\n[Begonya Orchestrator] ⚠️ ChecklistTrigger durdu (Kod: {p_clt.returncode}). 5s içinde yeniden başlatılıyor...")
                time.sleep(5)
                p_clt = spawn_clt_engine()

    except KeyboardInterrupt:
        print("\n[Begonya Orchestrator] 🛑 Kapatma sinyali alındı...")
        for name, proc in [("Macro Daemon", p_daemon), ("Begonya SMC Engine", p_smc), ("ChecklistTrigger", p_clt)]:
            if proc is not None and proc.poll() is None:
                print(f"  -> {name} sonlandırılıyor...")
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        print("[Begonya Orchestrator] Sistem güvenle kapatıldı.")
    finally:
        restore_system_sleep()
        release_orchestrator_lock()

if __name__ == "__main__":
    main()

