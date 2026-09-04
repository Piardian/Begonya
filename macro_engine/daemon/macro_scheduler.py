"""
Olay Odaklı Makro Arka Plan Servisi (Event-Driven Macro Daemon)
Tetikleme Mantığı:
1. Periyodik: Günlük (D1) seans kapanışında günde 1 kez.
2. Olay Odaklı: Ekonomik takvimdeki yüksek etkili (Kırmızı Bayrak) bir veri
   açıklandıktan 3 dakika sonra (T + 180s) piyasa şoku sindirildiğinde 1 kez.
"""

import os
import sys
import time
import json
import logging
import argparse
import datetime
from pathlib import Path

# Proje kök dizinini ekle
ROOT_DIR = Path(__file__).parent.parent.resolve()
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import asyncio
from graph.macro_graph import MacroWorkflowEngine
from ingestion.calendar_event import CalendarEventIngestion
from config import BIAS_GATE_FILE

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [MacroDaemon] - %(levelname)s - %(message)s'
)
logger = logging.getLogger("MacroDaemon")


class MacroEventScheduler:
    def __init__(self, post_news_delay_seconds: int = 180):
        self.post_news_delay = post_news_delay_seconds
        self.engine = MacroWorkflowEngine()
        self.calendar = CalendarEventIngestion()

    def run_cycle(self, trigger_source: str = "Manual / Scheduled"):
        """Tam makro analiz döngüsünü çalıştırır ve atomik kapıyı günceller."""
        logger.info(f"🚀 [MAKRO DÖNGÜ BAŞLATILDI] Tetikleyici: {trigger_source}")
        start_time = time.time()
        try:
            result = self.engine.run_pipeline()
            strat = result.get("final_output", {})
            regime = strat.get("primary_regime", "Bilinmiyor")
            gates = strat.get("execution_bias_gates", {})
            elapsed = round(time.time() - start_time, 2)
            logger.info(
                f"✅ [MAKRO DÖNGÜ TAMAMLANDI - {elapsed}s] Rejim: {regime} | "
                f"Kapılar: XAUUSD={gates.get('XAUUSD')}, EURUSD={gates.get('EURUSD')}, BTC={gates.get('BTC')}"
            )
            return True
        except Exception as e:
            logger.error(f"❌ Makro analiz döngüsünde hata: {e}", exc_info=True)
            return False

    def get_upcoming_triggers(self) -> list:
        """Bugünkü kırmızı bayraklı olayları ve D1 kapanışını listeler."""
        triggers = []
        now = datetime.datetime.now()

        # 1. Günlük D1 Kapanış Tetikleyicisi (Her gece 23:55)
        d1_target = now.replace(hour=23, minute=55, second=0, microsecond=0)
        if d1_target < now:
            d1_target += datetime.timedelta(days=1)
        triggers.append({
            "name": "D1 Günlük Bar Kapanışı",
            "scheduled_time": d1_target,
            "type": "DAILY_CLOSE"
        })

        # 2. Yüksek Etkili Olaylar (Kırmızı Bayrak)
        try:
            events = asyncio.run(self.calendar.fetch_latest_events())
            for ev in events:
                # Olay başlığı ve saatini kontrol et
                title = ev.get('title', 'Ekonomik Olay')
                time_str = ev.get('time', '')
                if time_str and ":" in time_str:
                    try:
                        t_parts = time_str.split(":")
                        ev_time = now.replace(hour=int(t_parts[0]), minute=int(t_parts[1]), second=0, microsecond=0)
                        # Olaydan 3 dakika sonra tetikle
                        trigger_time = ev_time + datetime.timedelta(seconds=self.post_news_delay)
                        if trigger_time > now:
                            triggers.append({
                                "name": f"Haber Tetiklemesi (+3dk): {title}",
                                "scheduled_time": trigger_time,
                                "type": "EVENT_DRIVEN"
                            })
                    except Exception:
                        pass
        except Exception as ce:
            logger.debug(f"Takvim tetikleyicileri taranırken hata: {ce}")

        # Tarihe göre sırala
        triggers.sort(key=lambda x: x["scheduled_time"])
        return triggers

    def start_daemon_loop(self, poll_interval_seconds: int = 30):
        """Arka planda tetikleyicileri izleyen ana döngü."""
        logger.info("🛡️ [DAEMON BAŞLATILDI] Olay Odaklı Makro Tetikleyici devrede.")
        logger.info(f"⚙️ Kontrol aralığı: {poll_interval_seconds}s | Haber sonrası gecikme: {self.post_news_delay}s")

        # İlk çalıştırma (Sistem başlarken kapıyı güncel tut)
        self.run_cycle(trigger_source="Daemon Startup Baseline")

        executed_triggers = set()

        while True:
            try:
                now = datetime.datetime.now()
                triggers = self.get_upcoming_triggers()

                for trig in triggers:
                    trig_key = f"{trig['name']}_{trig['scheduled_time'].strftime('%Y%m%d_%H%M')}"
                    if trig_key in executed_triggers:
                        continue

                    time_diff = (trig["scheduled_time"] - now).total_seconds()
                    # Eğer tetikleme anına geldiysek (-15s ile +45s arası)
                    if -15 <= time_diff <= 45:
                        logger.info(f"🔔 [ZAMANLAYICI TETİKLENDİ] {trig['name']}")
                        self.run_cycle(trigger_source=trig["name"])
                        executed_triggers.add(trig_key)

                time.sleep(poll_interval_seconds)
            except KeyboardInterrupt:
                logger.info("🛑 Daemon kullanıcı tarafından durduruldu.")
                break
            except Exception as e:
                logger.error(f"Daemon döngüsünde beklenmeyen hata: {e}")
                time.sleep(poll_interval_seconds)


def main():
    parser = argparse.ArgumentParser(description="Olay Odaklı Makro Arka Plan Servisi")
    parser.add_argument("--once", action="store_true", help="Tek bir makro analiz döngüsü çalıştır ve çık")
    parser.add_argument("--daemon", action="store_true", help="Arka plan izleme döngüsünü başlat")
    parser.add_argument("--status", action="store_true", help="Yaklaşan tetikleyicileri listele")
    args = parser.parse_args()

    scheduler = MacroEventScheduler()

    if args.once:
        scheduler.run_cycle(trigger_source="CLI --once")
    elif args.status:
        triggers = scheduler.get_upcoming_triggers()
        print("\n" + "=" * 60)
        print("          YAKLAŞAN MAKRO TETİKLEYİCİ TAKVİMİ          ")
        print("=" * 60)
        for i, t in enumerate(triggers, 1):
            print(f"{i}. [{t['type']:<12}] {t['scheduled_time'].strftime('%Y-%m-%d %H:%M:%S')} -> {t['name']}")
        print("=" * 60 + "\n")
    else:
        # Varsayılan: Tek çalıştırma veya --daemon modu
        scheduler.start_daemon_loop()


if __name__ == "__main__":
    main()
