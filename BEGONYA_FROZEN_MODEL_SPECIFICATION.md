# Begonya Frozen Model Şartnamesi (Frozen Model Specification)
**Belge Kodu:** `BEGONYA_FROZEN_MODEL_SPECIFICATION.md`  
**Dondurulma Tarihi:** 14 Ekim 2026 (17:26 UTC)  
**Durum:** **`STRICTLY FROZEN (DONDURULDU — KURAL DEĞİŞİKLİĞİ YASAKLANMIŞTIR)`**  
**Amaç:** Begonya `VAR_4_COMBINED_MACRO_AND_SESSION` stratejisinin tüm parametre ve kurallarını sabitleyerek, 14 Ekim 2026 sonrası taze veride veri gözetleme (data snooping) ve aşırı uyarlama (overfitting) olmaksızın tarafsız forward-walk testini yürütmek.

---

## 1. Dondurulan Model Kuralları Özeti

```
[4H Makro Trend Filtresi]
         │ (Yön Uyumluysa İzin Ver)
         ▼
[15M POI Tespiti (OB / FVG)]
         │
[15M Kapanış Vetosu] ──(Gövde POI dışı kapandıysa)──► [İPTAL / VETO]
         │ (Geçerliyse)
         ▼
[M1 Likidite İndüktansı (Inducement Sweep)]
         │
[M1 CHOCH + Displacement Kırılımı]
         │
[Dinamik Fib 0.5 Limit Girişi]
         │
[Ex-Ante Tekilleştirme Kontrolü (FIFO - Maks 1 Pozisyon)]
         │ (Mükerrer değilse)
         ▼
[Pozisyon Açılışı: Yapısal Stop + Seans Likidite Hedefi (Maks 5R)]
```

---

## 2. Kural Bileşenlerinin Kesin Tanımları

### 1. Makro Yön Filtresi (4H Macro Trend Gate)
- **Kural:** 4 saatlik (4H) ana piyasa yapısı incelenir (Swing BOS / CHOCH).
- **Yürütme:**
  - 4H Trend Boğa (Bullish) ise: **Yalnızca LONG** sinyallerine izin verilir. SHORT sinyalleri elenir.
  - 4H Trend Ayı (Bearish) ise: **Yalnızca SHORT** sinyallerine izin verilir. LONG sinyalleri elenir.
  - 4H Nötr / Belirsiz ise: Pozisyon açılmaz.

### 2. POI ve 15M Gövde Kapanış Vetosu (POI & Candle Close Veto)
- **POI Tanımı:** 15 dakikalık grafikteki mitigation görmemiş Order Block (OB) ve Fair Value Gap (FVG) alanları.
- **Veto Kuralı:** Eğer 15M mumu gövde (body) kapanışıyla POI ekstremum seviyesinin ötesinde kapanırsa, yapı kırılmış sayılır ve sinyal **derhal iptal edilir (VETO)**. Sadece fitil (wick) ihlallerine izin verilir.

### 3. Giriş Mekanizması (M1 Inducement, CHOCH & Dinamik Fib 0.5)
- **İndüktans (Inducement):** POI içine girmeden önce ya da POI içinde iç likiditeyi süpüren bar hareketi aranır.
- **Karakter Değişimi (CHOCH):** M1 zaman diliminde en son geçerli iç pivotun kırılması şarttır.
- **Displacement:** Kırılım mumu güçlü gövdeli ve hacimli bir itki mumu olmalıdır.
- **Giriş Emri:** Kırılımı yaratan itki dalgasının %50 geri çekilme (Fib 0.5) seviyesine dinamik Limit emir konur. 

### 4. Stop-Loss Modeli (Yapısal Swing Stop)
- **Kural:** CHOCH kırılımını başlatan gerçek yapısal swing pivotu stop seviyesi olarak belirlenir.
- **Yasak:** Sabit pip (örneğin 2 pip, 3 pip) gibi piyasa yapısından bağımsız rastgele mikro-stoplar kesinlikle kullanılmaz.

### 5. Kâr Al Hedefi (Seans Likidite Hedefi & Maks 5R Tavanı)
- **Kural:** Hedef seviyesi, önceki veya mevcut seansın (Asya, Londra, New York) aşılmamış tepe/dip likidite havuzudur.
- **Tavan Koruması:** Seans likiditesi aşırı uzakta kaldığında ($> 5.0\text{ R}$), hedef yapay olarak uç noktalara bırakılmaz; **maksimum 5.0 R** ile sınırlandırılır.

### 6. Ex-Ante Tekilleştirme Kuralı (Setup Cluster / FIFO Rule)
- **Kural:** Aynı enstrüman ve aynı yönde, aktif bir pozisyon açıkken (`fill` ile `exit` arası) yeni pozisyon açılamaz.
- **Mükerrerlik:** Aynı 15M mumunda hem OB hem FVG etiketi alan sinyaller tek bir piyasa fırsatıdır; yalnızca ilk tetiklenen emir (FIFO) yürütülür, ikincisi reddedilir.

### 7. Limit Emir Dolum Gerçekçiliği (Fill Penetration Hurdle)
- **Kural:** Fiyatın limit seviyesine sadece fitil ucuyla değmesi (`touch`) gerçekleşme (fill) sayılmaz.
- **Engel:** Limit emrin gerçekleşmesi için piyasanın limiti aşıp en az spread kadar içine girmesi şarttır (Long için `Ask_low < limit_price`, Short için `Bid_high > limit_price`).
- **Zaman Aşımı:** 60 adet M1 barı içinde gerçekleşmeyen limit emirler iptal edilir (`EXPIRED_UNFILLED`).

### 8. Yürütme ve Maliyet Çerçevesi (Bid/Ask & Komisyon)
- **FX:** 1.5 pip spread.
- **Altın (XAUUSD):** 3.0 pip ($0.30) spread.
- **Kripto (BTC/ETH/SOL):** %0.10 nominal spread/ücret.
- **Çift Ceza Yasağı:** Stop ve hedef engelleri Bid/Ask fiyatları üzerinden kronolojik olarak test edilir. Engel aşıldığında net getiri planlanan R üzerinden muhasebeleştirilir; R üzerinden ikinci kez spread düşülmez.

---

## 3. İleriye Dönük (Forward-Walk) Test Protokolü

1. **Kesin Zaman Damgası Eşiği:**
   - **UTC Zamanı:** `2026-10-14 14:45:00 UTC`
   - **Yerel Zaman:** `2026-10-14 17:45:00 Local (UTC+3)`
   - **Milisaniye Epoch:** `1791989100000`
   - Bu eşikten önce oluşan hiçbir bar veya aday ileriye dönük gözleme dahil edilmez (`REJECTED_LOOKBACK`).
2. **Kural Değişikliği Yasağı:** İleriye dönük test devam ederken hiçbir parametre, eşik, stop mesafesi veya filtre değiştirilemez.
3. **Günlük İzolasyonu (Purity):** Sentetik testler ve birim testleri `test_journal.jsonl` üzerinde yürütülür; üretim günlüğü `forward_walk_trade_journal.jsonl` yalnızca gerçek piyasa olaylarını barındırır.
4. **Değerlendirme Eşiği:** En az 50 bağımsız işlem veya 60 takvim günü yalnızca bir ilk gözlem alt sınırıdır; nihai karar t-istatistiği, güven aralığı (%95 CI) ve piyasa rejim tutarlılığı ile verilecektir.
