# Phase 10 (v2): Swing, BOS/CHoCH, Range, Sweep, OB, FVG, Premium/Discount, Displacement Quality, POI Test Tracking, Model Determination, Grade Calculation, Twelve Data Poller, Candle Store, and Telegram Sender Core Engine

EUR/USD ve GBP/USD pariteleri için swing noktası, BOS/CHoCH, Range, Sweep tespiti, Order Block (OB), Fair Value Gap (FVG), Premium/Discount (Fib) sınıflandırma, Displacement Kalitesi skorlama, POI test sayısı takip, Model 1/2 belirleme, Grade Puanlama, Twelve Data Poller, Candle Store ve Telegram Bildirim Gönderim motorudur.

## Kurulum ve Test

Bağımlılıkları yüklemek ve testleri çalıştırmak için projenin dizininde (`C:\Users\piard\.gemini\antigravity\scratch\swing-bos-core`) aşağıdaki komutları kullanın:

```bash
npm install
npm test
```

Projeyi derlemek (production build) için:
```bash
npm run build
```

---

## Modüller ve Kullanım Rehberleri

### 1. Twelve Data İstemcisi (`server/twelveDataClient.ts`)
`https://api.twelvedata.com/time_series` üzerinden API anahtarı (`TWELVE_DATA_API_KEY`) ile mum verisi çeker. Çekilen mumlar UTC zaman diliminde parse edilip en eskiden en yeniye sıralanır.

### 2. Poller Orkestratörü (`server/poller.ts`)
Belirli aralıklarla Twelve Data API'den veri çeker. Eğer store boş ise (cold start) 100 mum, aksi takdirde 10 mum çekerek `CandleStore`'u günceller. 15m verisi güncellendiğinde orkestrasyon pipeline'ını tetikler ve aday fırsatları Telegram'a iletir.

### 3. Zamanlayıcı ve Health Check (`server/index.ts`)
Sunucu başlarken tüm 6 ticker/zaman dilimi kombinasyonunu paralel olmayan (`await` ile ardışık) şekilde çekerek rate limitlerini aşmadan cold-start verilerini toplar. Ardından her kombinasyon için zamanlayıcıları (`setInterval`) kurar:
- 15m kombinasyonları için: 15 dakikada bir.
- 1h kombinasyonları için: 1 saatte bir.
- 4h kombinasyonları için: 4 saatte bir.

Ayrıca Render/Railway gibi platformların health-check pingleri için `GET /health` endpoint'ini barındıran Express sunucusunu ayağa kaldırır.
