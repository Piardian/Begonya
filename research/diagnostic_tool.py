import os
import json
import asyncio
import aiofiles
from datetime import datetime, timedelta
from collections import defaultdict

# Analiz edilecek dizinler
TARGET_DIRS = ['benchmark', 'smc_engine', 'macro_engine']

async def read_json_file(file_path):
    """Asenkron olarak JSON dosyasını okur."""
    try:
        async with aiofiles.open(file_path, mode='r', encoding='utf-8') as f:
            content = await f.read()
            return json.loads(content)
    except Exception as e:
        print(f"Hata: {file_path} okunamadı: {e}")
        return None

async def process_data(data):
    """
    Verileri işler ve metrikleri hesaplar.
    Burada sinyal sıklığı, PnL, win/loss gibi hesaplamalar yapılır.
    """
    metrics = {
        "signal_frequency": {"60d": 0, "30d": 0, "14d": 0, "7d": 0},
        "pnl": 0.0,
        "win_loss": {"wins": 0, "losses": 0},
        "filter_success": 0.0
    }
    
    # Örnek hesaplama mantığı (gerçek veri yapınıza göre güncellenmelidir)
    now = datetime.now()
    
    if not isinstance(data, list):
        return metrics

    for entry in data:
        try:
            timestamp = datetime.fromisoformat(entry.get('timestamp', now.isoformat()))
            delta = now - timestamp
            
            # Sinyal sıklığı
            if delta.days <= 60: metrics["signal_frequency"]["60d"] += 1
            if delta.days <= 30: metrics["signal_frequency"]["30d"] += 1
            if delta.days <= 14: metrics["signal_frequency"]["14d"] += 1
            if delta.days <= 7: metrics["signal_frequency"]["7d"] += 1
            
            # PnL ve Win/Loss
            pnl = entry.get('pnl', 0)
            metrics["pnl"] += pnl
            if pnl > 0: metrics["win_loss"]["wins"] += 1
            else: metrics["win_loss"]["losses"] += 1
            
        except Exception as e:
            continue
            
    return metrics

async def run_diagnostic():
    """Ana teşhis döngüsü."""
    all_data = []
    
    for directory in TARGET_DIRS:
        if not os.path.exists(directory):
            continue
            
        for filename in os.listdir(directory):
            if filename.endswith('.json'):
                path = os.path.join(directory, filename)
                data = await read_json_file(path)
                if data:
                    if isinstance(data, list):
                        all_data.extend(data)
                    else:
                        all_data.append(data)

    metrics = await process_data(all_data)
    await generate_report(metrics)

async def generate_report(metrics):
    """Raporu dosyaya yazar."""
    os.makedirs('diagnostics', exist_ok=True)
    report_path = 'diagnostics/begonya_signal_diagnostic.md'
    
    async with aiofiles.open(report_path, mode='w', encoding='utf-8') as f:
        await f.write(f"# Begonya Signal Teşhis Raporu\n")
        await f.write(f"Tarih: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        
        await f.write("## Sinyal Sıklığı (Günlük)\n")
        for period, count in metrics['signal_frequency'].items():
            await f.write(f"- {period}: {count} sinyal\n")
            
        await f.write(f"\n## Performans\n")
        await f.write(f"- Toplam PnL: {metrics['pnl']:.2f}\n")
        await f.write(f"- Win: {metrics['win_loss']['wins']}, Loss: {metrics['win_loss']['losses']}\n")
        
        await f.write("\n---\n*Otomatik olarak oluşturulmuştur.*")
    
    print(f"Rapor başarıyla oluşturuldu: {report_path}")

if __name__ == "__main__":
    asyncio.run(run_diagnostic())
