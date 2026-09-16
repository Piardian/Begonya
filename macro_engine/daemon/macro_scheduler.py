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
from gateways.telegram_notifier import send_telegram_message, format_morning_briefing
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

STATE_FILE = Path(__file__).parent / "scheduler_state.json"


class MacroEventScheduler:
    def __init__(self, post_news_delay_seconds: int = 180):
        self.post_news_delay = post_news_delay_seconds
        self.state_file = STATE_FILE
        self.engine = MacroWorkflowEngine()
        self.calendar = CalendarEventIngestion()
        self.cached_events = []
        self.last_calendar_fetch = 0.0

    def _load_state(self) -> dict:
        try:
            if self.state_file.exists():
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            logger.warning(f"State dosyası okunamadı: {e}")
        return {
            "last_morning_briefing_date": "",
            "last_daily_close_date": "",
            "executed_news_events": []
        }

    def _save_state(self, state: dict):
        try:
            with open(self.state_file, "w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"State dosyası yazılamadı: {e}")

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

    def send_morning_briefing(self) -> bool:
        """Sabah 09:00 analizini çalıştırır ve Telegram'a detaylı bülten iletir."""
        logger.info("☀️ [SABAH BÜLTENİ] 09:00 Makro Analizi ve Telegram Raporlama Başlatıldı...")
        result = self.engine.run_pipeline()
        events = []
        try:
            events = asyncio.run(self.calendar.fetch_latest_events())
        except Exception as e:
            logger.debug(f"Bülten için takvim çekilirken hata: {e}")
        
        msg = format_morning_briefing(result, events)
        sent = send_telegram_message(msg)
        if sent:
            logger.info("☀️ [SABAH BÜLTENİ] Telegram Sabah Makro Bülteni Başarıyla Gönderildi!")
            state = self._load_state()
            state["last_morning_briefing_date"] = datetime.datetime.now().strftime("%Y-%m-%d")
            self._save_state(state)
        else:
            logger.warning("⚠️ [SABAH BÜLTENİ] Telegram bülteni gönderilemedi!")
        return sent

    def _get_calendar_events_cached(self, ttl_seconds: int = 300) -> list:
        """Ekonomik takvim olaylarını 5 dakika önbellekli olarak çeker."""
        now_ts = time.time()
        if not self.cached_events or (now_ts - self.last_calendar_fetch) > ttl_seconds:
            try:
                self.cached_events = asyncio.run(self.calendar.fetch_latest_events())
                self.last_calendar_fetch = now_ts
            except Exception as ce:
                logger.debug(f"Takvim çekilirken hata: {ce}")
        return self.cached_events

    def get_upcoming_triggers(self) -> list:
        """Bugünkü kırmızı bayraklı olayları, sabah bültenini ve D1 kapanışını listeler."""
        triggers = []
        now = datetime.datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        state = self._load_state()

        # 1. Sabah 09:00 Makro Bülten Tetikleyicisi
        morning_target = now.replace(hour=9, minute=0, second=0, microsecond=0)
        if state.get("last_morning_briefing_date") == today_str or morning_target < now:
            morning_target += datetime.timedelta(days=1)
        triggers.append({
            "name": "Sabah Makro Bülteni (09:00)",
            "scheduled_time": morning_target,
            "type": "MORNING_BRIEFING"
        })

        # 2. Günlük D1 Kapanış Tetikleyicisi (Her gece 23:55)
        d1_target = now.replace(hour=23, minute=55, second=0, microsecond=0)
        if state.get("last_daily_close_date") == today_str or d1_target < now:
            d1_target += datetime.timedelta(days=1)
        triggers.append({
            "name": "D1 Günlük Bar Kapanışı (23:55)",
            "scheduled_time": d1_target,
            "type": "DAILY_CLOSE"
        })

        # 3. Yüksek Etkili Olaylar (Kırmızı Bayrak)
        events = self._get_calendar_events_cached(ttl_seconds=300)
        for ev in events:
            title = ev.get('title', 'Ekonomik Olay')
            time_str = ev.get('time', '')
            if time_str and ":" in time_str:
                try:
                    t_parts = time_str.split(":")
                    ev_time = now.replace(hour=int(t_parts[0]), minute=int(t_parts[1]), second=0, microsecond=0)
                    trigger_time = ev_time + datetime.timedelta(seconds=self.post_news_delay)
                    if trigger_time > now:
                        triggers.append({
                            "name": f"Haber Tetiklemesi (+3dk): {title}",
                            "scheduled_time": trigger_time,
                            "type": "EVENT_DRIVEN"
                        })
                except Exception:
                    pass

        triggers.sort(key=lambda x: x["scheduled_time"])
        return triggers

    def start_daemon_loop(self, poll_interval_seconds: int = 30):
        """Arka planda tetikleyicileri izleyen ana döngü."""
        logger.info("🛡️ [DAEMON BAŞLATILDI] Olay Odaklı Makro Tetikleyici devrede.")
        logger.info(f"⚙️ Kontrol aralığı: {poll_interval_seconds}s | Haber sonrası gecikme: {self.post_news_delay}s")

        # İlk çalıştırma (Sistem başlarken kapıyı güncel tut)
        self.run_cycle(trigger_source="Daemon Startup Baseline")

        while True:
            try:
                now = datetime.datetime.now()
                today_str = now.strftime("%Y-%m-%d")
                state = self._load_state()

                # 1. Sabah 09:00 Bülteni Kontrolü (Tarih kilitli, asla ıskalanmaz)
                # Saat 09:00 ile 18:00 arasında ise ve bugünün bülteni henüz gönderilmediyse:
                if (now.hour >= 9 and now.hour < 18) and state.get("last_morning_briefing_date") != today_str:
                    logger.info(f"🔔 [ZAMANLAYICI TETİKLENDİ] Sabah Makro Bülteni (09:00) | Tarih: {today_str}")
                    sent = self.send_morning_briefing()
                    state["last_morning_briefing_date"] = today_str
                    self._save_state(state)

                # 2. Günlük D1 Kapanış Kontrolü (Her gece 23:55 veya sonrası)
                if (now.hour == 23 and now.minute >= 55) and state.get("last_daily_close_date") != today_str:
                    logger.info(f"🔔 [ZAMANLAYICI TETİKLENDİ] D1 Günlük Bar Kapanışı (23:55) | Tarih: {today_str}")
                    self.run_cycle(trigger_source="D1 Günlük Bar Kapanışı (23:55)")
                    state["last_daily_close_date"] = today_str
                    self._save_state(state)

                # 3. Yüksek Etkili Haber / Olay Tetikleyicileri (Kırmızı Bayrak)
                events = self._get_calendar_events_cached(ttl_seconds=300)
                executed_events = set(state.get("executed_news_events", []))

                for ev in events:
                    title = ev.get('title', 'Ekonomik Olay')
                    time_str = ev.get('time', '')
                    if time_str and ":" in time_str:
                        try:
                            t_parts = time_str.split(":")
                            ev_time = now.replace(hour=int(t_parts[0]), minute=int(t_parts[1]), second=0, microsecond=0)
                            trigger_time = ev_time + datetime.timedelta(seconds=self.post_news_delay)
                            event_key = f"{title}_{today_str}_{t_parts[0]}:{t_parts[1]}"

                            if event_key not in executed_events:
                                time_diff = (now - trigger_time).total_seconds()
                                # Olay anından itibaren [0s, 900s] (15 dakika) içinde yakalandıysa tetikle
                                if 0 <= time_diff <= 900:
                                    logger.info(f"🔔 [HABER TETİKLENDİ] {title} (+3dk gecikme ile)")
                                    self.run_cycle(trigger_source=f"Haber: {title}")
                                    executed_events.add(event_key)
                                    state["executed_news_events"] = list(executed_events)[-100:]
                                    self._save_state(state)
                        except Exception as ee:
                            logger.debug(f"Haber tetikleyici hatası: {ee}")

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
    parser.add_argument("--briefing", action="store_true", help="Sabah makro bültenini hemen oluştur ve Telegram'a gönder")
    args = parser.parse_args()

    scheduler = MacroEventScheduler()

    if args.briefing:
        scheduler.send_morning_briefing()
    elif args.once:
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
