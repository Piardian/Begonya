# HYBRID REPLAY SPECIFICATION: BEGONYA & CHECKLISTTRIGGER (CLT)
## İzole Araştırma Replay Modeli Tasarımı, Veri Sözleşmesi ve Şema Spesifikasyonu

**Belge Versiyonu:** 1.0.0-RESEARCH  
**Tarih:** 2026-10-14  
**Durum:** Salt Tasarım & Şema Spesifikasyonu (İnceleme / Replay Öncesi Hazırlık)  
**Çalışma İlkesi:** 
* Üretim (production) kodlarına kesinlikle dokunulmaz.
* Convexity Engine güvenlik yamalarına dokunulmaz.
* Kârlılık / performans hesaplaması yapılmaz.
* Veri eksiklikleri sıfır (0) kâr/zarar ile geçiştirilmez; açık durum kodları (`INSUFFICIENT_DATA`, `UNVERIFIED`) atanır.

---

## 1. Mimari Tasarım ve İzolasyon Sınırları

Araştırma modeli, canlı altyapıdan tamamen soyutlanmış olarak `Begonya/research/hybrid_replay/` dizini altında izole bir Python/TypeScript araştırma modülü olarak kurgulanmıştır.

```
Begonya/
  ├── research/
  │   └── hybrid_replay/                     <-- İzole Araştırma Modülü
  │       ├── contracts.py (veya .ts)         <-- Veri Sözleşmeleri ve Şema
  │       ├── status_codes.py                <-- Kesin Durum Kodları
  │       ├── htf_invalidation_guard.py      <-- Clock-Aligned HTF Bar Kapanış Denetçisi
  │       ├── ltf_chronological_walker.py    <-- Geleceği Görmeyen M1 Simülatörü
  │       ├── ladder_displacement_detector.py<-- Merdiven / Ladder Teyit Modülü
  │       ├── cost_attribution_engine.py     <-- Spread, Slippage, Komisyon Modeli
  │       └── replay_cohort_manager.py       <-- 28 İcra / 16 İptal / 112 Fırsat Kohort Ayracı
  ├── HYBRID_ENTRY_GAP_ANALYSIS.md           <-- Boşluk Analizi
  └── HYBRID_REPLAY_SPEC.md                  <-- Bu Belge (Spesifikasyon)
```

---

## 2. Veri Sözleşmesi ve Alan Şeması (Data Contract)

### A. Giriş Veri Sözleşmesi (`ReplayInputCandidate`)
Replay motoruna iletilen her yapısal aday, aşağıdaki değişmez (immutable) şemaya uymak zorundadır:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ReplayInputCandidate",
  "type": "object",
  "required": [
    "candidate_id",
    "structural_opportunity_id",
    "symbol",
    "timeframe",
    "trade_direction",
    "poi_type",
    "poi_zone_low",
    "poi_zone_high",
    "signal_known_at_utc",
    "signal_known_at_timestamp",
    "htf_structural_anchor"
  ],
  "properties": {
    "candidate_id": { "type": "string", "description": "Tekil sinyal ID'si (Örn: EURUSD_15m_OB_1787928300000)" },
    "structural_opportunity_id": { "type": "string", "description": "Bağımsız fırsat tekillik anahtarı (Aynı dalganın OB ve FVG'sini tek saymak için dedupeKey)" },
    "symbol": { "type": "string", "description": "Enstrüman kodu (Örn: EURUSD, XAUUSD)" },
    "timeframe": { "type": "string", "enum": ["15m", "1h", "4h"], "description": "Sinyalin üretildiği yapısal zaman dilimi" },
    "trade_direction": { "type": "string", "enum": ["LONG", "SHORT"] },
    "poi_type": { "type": "string", "enum": ["OB", "FVG"] },
    "poi_zone_low": { "type": "number", "description": "POI kutusunun taban fiyatı" },
    "poi_zone_high": { "type": "number", "description": "POI kutusunun tavan fiyatı" },
    "signal_known_at_utc": { "type": "string", "format": "date-time", "description": "Sinyalin piyasa tarafından bilindiği ilk an (Validation Candle Close)" },
    "signal_known_at_timestamp": { "type": "integer", "description": "Sinyal bilinirlik Unix ms zaman damgası" },
    "htf_structural_anchor": {
      "type": "object",
      "required": ["anchor_price", "anchor_type", "anchor_timeframe"],
      "properties": {
        "anchor_price": { "type": ["number", "null"], "description": "HTF yapısının oluştuğu swing tepe/dip fiyatı" },
        "anchor_type": { "type": "string", "enum": ["SWING_HIGH", "SWING_LOW", "UNKNOWN"] },
        "anchor_timeframe": { "type": "string", "enum": ["15m", "1h", "4h", "UNKNOWN"] }
      }
    },
    "historical_macro_snapshot": {
      "type": ["object", "null"],
      "description": "Sinyal anında dondurulmuş makro rejim ve kapı kararı (Bugünkü canlı kapı asla kullanılamaz)"
    }
  }
}
```

---

### B. Çıkış ve Yürütme Sözleşmesi (`ReplayExecutionResult`)
Replay motorunun her bir kohort adayı için üreteceği deterministik sonuç yapısı:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ReplayExecutionResult",
  "type": "object",
  "required": [
    "candidate_id",
    "structural_opportunity_id",
    "cohort",
    "execution_status_code",
    "poi_lifecycle_state",
    "m1_data_coverage_state"
  ],
  "properties": {
    "candidate_id": { "type": "string" },
    "structural_opportunity_id": { "type": "string" },
    "cohort": {
      "type": "string",
      "enum": [
        "BENCHMARK_EXECUTED_HISTORICAL",
        "BENCHMARK_UNFILLED_HISTORICAL",
        "CLT_DISPATCHED_OPPORTUNITY"
      ]
    },
    "execution_status_code": {
      "type": "string",
      "description": "Bölüm 3'teki kesin durum kodlarından biri"
    },
    "poi_lifecycle_state": {
      "type": "string",
      "enum": ["UNTOUCHED", "TOUCHED", "BREACHED_BEFORE_TOUCH", "INVALIDATED_ON_HTF_CLOSE", "ARMED", "FILLED"]
    },
    "m1_data_coverage_state": {
      "type": "string",
      "enum": ["FULL_M1_AVAILABLE", "PARTIAL_M1_AVAILABLE", "INSUFFICIENT_M1_DATA", "NO_M1_DATA"]
    },
    "structural_stop_provenance": {
      "type": "string",
      "enum": ["HTF_STRUCTURAL_ANCHOR", "LTF_SWEEP_FALLBACK_REJECTED", "MISSING_STRUCTURAL_ANCHOR"]
    },
    "displacement_assessment": {
      "type": "object",
      "properties": {
        "large_body_detected": { "type": "boolean" },
        "large_body_ratio": { "type": ["number", "null"] },
        "ladder_displacement_detected": { "type": "boolean" },
        "ladder_classification": {
          "type": "string",
          "enum": ["CONFIRMED_LADDER", "UNVERIFIED_DISCRETIONARY_LADDER", "NONE"]
        },
        "ladder_manual_review_required": { "type": "boolean" }
      }
    },
    "confluence_scoring": {
      "type": "object",
      "properties": {
        "fib_05_breaker_overlap": { "type": "boolean" },
        "overlap_quality_tag": { "type": "string", "enum": ["PERFECT_OVERLAP", "ADJACENT", "NO_OVERLAP", "NOT_APPLICABLE"] }
      }
    },
    "trade_metrics": {
      "type": ["object", "null"],
      "properties": {
        "entry_timestamp": { "type": ["string", "null"] },
        "entry_price": { "type": ["number", "null"] },
        "structural_stop_price": { "type": ["number", "null"] },
        "tp_price": { "type": ["number", "null"] },
        "be_price": { "type": ["number", "null"] },
        "be_triggered": { "type": "boolean" },
        "be_triggered_timestamp": { "type": ["string", "null"] },
        "exit_timestamp": { "type": ["string", "null"] },
        "exit_price": { "type": ["number", "null"] },
        "exit_reason": {
          "type": "string",
          "enum": ["TP_HIT", "SL_HIT", "BE_HIT", "TIMEOUT_EXPIRED", "SAME_CANDLE_SL_CONSERVATIVE", "UNRESOLVED"]
        },
        "gross_r_multiple": { "type": ["number", "null"] },
        "net_r_multiple": { "type": ["number", "null"] },
        "transaction_costs": {
          "type": "object",
          "properties": {
            "spread_cost_r": { "type": "number" },
            "slippage_cost_r": { "type": "number" },
            "commission_cost_r": { "type": "number" },
            "total_friction_r": { "type": "number" },
            "cost_data_status": { "type": "string", "enum": ["ESTIMATED_MODEL", "HISTORICAL_RECORDED", "INSUFFICIENT_COST_DATA"] }
          }
        }
      }
    }
  }
}
```

---

## 3. Kesin Durum Kodları (Status Codes Specification)

Sistemde hiçbir belirsizlik yuvarlanamaz veya sıfır kâr/zararla kapatılamaz. Her senaryo için açık bir durum kodu döner:

### A. Veri Kapsamı ve Giriş Öncesi Durum Kodları
* `INSUFFICIENT_DATA_M1_MISSING`: İlgili sembol veya tarih aralığında M1 verisi bulunmadığı için replay çalıştırılamadı (Örn: BTCUSD M1 < 1 gün veya 1 yıllık M1 yokluğu).
* `INSUFFICIENT_DATA_STRUCTURAL_STOP`: HTF yapısal tepe/dip seviyesi veri setinde kayıtlı değil; 1M fitili sessizce stop kabul edilmedi, işlem reddedildi.
* `INSUFFICIENT_DATA_MACRO_UNAVAILABLE`: Sinyalin üretildiği ana ait dondurulmuş makro kapı kaydı bulunamadı (Bugünkü canlı makro kapı uygulanmadı).
* `POI_BREACHED_BEFORE_TOUCH_HTF_CLOSE`: 15M mum kapanışında fiyat doğrudan POI tavan/tabanını aştığı için POI henüz test edilmeden geçersiz kılındı.
* `NO_TOUCH_ENTRY_WINDOW_EXPIRED`: Fiyat izin verilen süre içinde POI kutusuna hiç temas etmedi.

### B. 1M Sniper Aşaması Durum Kodları
* `NO_1M_INDUCEMENT_SWEEP`: POI içine girildi fakat içeride 1M yerel likidite süpürmesi (IDM / SFP) oluşmadı.
* `DISPLACEMENT_REJECTED_WEAK_BODY`: Süpürme sonrası itki mumunun gövde oranı eşiğin altında kaldı (`body/range < 0.40`).
* `DISPLACEMENT_LADDER_UNVERIFIED`: İtki tek barlı değil, merdiven (ladder) şeklinde gerçekleşti; nesnel bir kural tanımı olmadığı için otomatik onaylanmadı, `MANUAL_REVIEW` etiketlendi.
* `NO_FVG_OR_IFVG_DETECTED`: Breaker/CHoCH kırılımı gerçekleşti ancak üzerinde çalışılabilecek bir FVG veya iFVG dengesizliği bulunamadı.
* `FIB_05_LIMIT_NOT_RETESTED`: Dinamik Fib 0.5 seviyesi yukarı/aşağı taşındı fakat fiyat geri çekilme vermeden kaçtı (Limit dolmadı).

### C. İcra ve Çıkış Durum Kodları
* `FILLED_CLOSED_TAKE_PROFIT`: Seviye oluştuktan sonraki barlarda doldu ve hedefe ulaştı.
* `FILLED_CLOSED_BREAK_EVEN`: +1.0R kâra ulaşıldıktan sonra stop başabaşa çekildi ve koruma ile kapatıldı.
* `FILLED_CLOSED_STOP_LOSS`: Yapısal stop seviyesi vuruldu (-1.0R + maliyetler).
* `FILLED_SAME_CANDLE_CONFLICT_SL_FIRST`: Tek bir M1 mumu içinde hem TP hem SL seviyesi test edildi; kural gereği muhafazakar olarak SL kabul edildi.
* `FILLED_MAX_HOLD_TIMEOUT`: İzin verilen maksimum bar taşıma süresi doldu.

---

## 4. Mantıksal Kuralların Replay Uygulama Esasları

### Kural 2: Gerçek HTF Mum Kapanışıyla POI Geçersizleşme (Clock-Aligned Guard)
* **Kural:** 15M POI geçersizleşmesi, 1M mumlarının anlık fitiliyle veya kayan pencereyle değil; **15:00, 15:15, 15:30 gibi tam 15M mum kapanış saatine denk gelen M1 mumunun `close` fiyatıyla** denetlenir.
* **Uygulama:** Eğer $T_{\text{bar}} \pmod{15\text{ dk}} = 14\text{ dk}$ (bar kapanış dakikası) anındaki kapanış fiyatı bölge dışındaysa (`close < zoneLow` long için), POI derhal `POI_BREACHED_BEFORE_TOUCH_HTF_CLOSE` kodu ile sonlandırılır.

### Kural 4: Büyük Gövde vs. Merdiven (Ladder) Displacement Ayrımı
* **Büyük Gövde (Large Body):** Tek bar için $\frac{|\text{close} - \text{open}|}{\text{high} - \text{low}} \ge 0.50$ ve yönlü kapanış şartı arandığında `CONFIRMED_LARGE_BODY` atanır.
* **Merdiven (Ladder):** Ardışık 3 barın yönlü gövde toplamı $\sum \text{body} / \sum \text{range} \ge 0.60$ olsa dahi, kullanıcı tarafından kesin ve matematiksel bir merdiven formülü onaylanana kadar durum **`DISPLACEMENT_LADDER_UNVERIFIED`** olarak etiketlenir ve otomatik dolum sayılmaz.

### Kural 6 & 7: Dinamik Fib 0.5 ve Seviye Sonrası Dolum (Strict No-Lookahead)
* Fibonacci uçları:
  * Alt Uç ($E_{\text{anchor}}$): Onaylanan 1M sweep fitilinin ekstrem fiyatı.
  * Üst Uç ($I_{\text{anchor}}$): İtkinin zirvesi.
* Fiyat geri çekilmeden yeni tepe yaptıkça $I_{\text{anchor}} \leftarrow \text{high}_{k}$ ötelenir.
* Dinamik giriş: $\text{LimitPrice}_k = E_{\text{anchor}} + (I_{\text{anchor}} - E_{\text{anchor}}) \times 0.50$.
* Emir yalnızca $k+1$ ve sonraki mumların $\text{low} \le \text{LimitPrice}_k$ şartını sağlamasıyla doldurulur. $k$ anındaki veya önceki mumların fitiliyle emir doldurulamaz.

### Kural 8: Yapısal Zaman Dilimi Stopu (HTF Structural Anchor)
* Long işlemi için stop seviyesi: POI'yi oluşturan 15M swing yapısının korunan yapısal dip seviyesidir ($\text{SwingLow}_{15M} - \text{buffer}$).
* Eğer adayın veri kütüğünde bu yapısal seviye eksikse, sistem 1M sweep ucunu alternatif stop olarak **kabul etmez**; doğrudan `INSUFFICIENT_DATA_STRUCTURAL_STOP` durum kodu üretir.

### Kural 9: Fib 0.5 ile Breaker Örtüşmesi (Kalite Etiketi)
* Breaker kutusunun sınırları $[\text{Brk}_{\text{low}}, \text{Brk}_{\text{high}}]$ ile $\text{LimitPrice}$ karşılaştırılır.
* Eğer $\text{Brk}_{\text{low}} \le \text{LimitPrice} \le \text{Brk}_{\text{high}}$ ise `confluence_scoring.overlap_quality_tag = "PERFECT_OVERLAP"` etiketi basılır.
* Bu durum bir eleme veya veto şartı değildir; yalnızca kalite analiz etiketidir.

---

## 5. Kohort Ayrımı ve Veri Kapsama Raporu

Replay motoru verileri tek bir torbaya atmaz; aşağıdaki 3 bağımsız kohortta ayrı ayrı çalıştırılır:

| Kohort Adı | Kaynak Dosya | Toplam Kayıt | Bağımsız Yapısal Fırsat | M1 Veri Kapsamı (3 Ay) | 1 Yıllık M1 Kapsamı |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Kohort A (Gerçekleşmiş Benchmark)** | `benchmark_records.json` | 28 İcra Edilmiş İşlem | 28 Bağımsız İşlem | %100 (Eylül-Ekim 2026) | `INSUFFICIENT_DATA` (MT5 kısıtı) |
| **Kohort B (Doldurulmamış Benchmark)**| `benchmark_records.json` | 16 İptal/Doldurulmamış | 16 Bağımsız POI | %100 (Eylül-Ekim 2026) | `INSUFFICIENT_DATA` (MT5 kısıtı) |
| **Kohort C (CLT Sevk Edilmiş Sinyaller)**| `signal_delivery_queue.json`| 156 Sevk Edilmiş Sinyal | **~112 Tekil Yapısal Fırsat** | %100 (Ağustos-Ekim 2026 - Majörler)| `INSUFFICIENT_DATA` (MT5 kısıtı) |

*Not: Kohort C'deki 156 kaydın 44 tanesi aynı fiyat dalgasının hem OB hem FVG adayı olarak mükerrer açıldığı tespit edilmiştir. Bunlar `structural_opportunity_id` üzerinden tek bir fırsat olarak izlenir.*

---

## 6. Test Senaryoları (Unit / Spec Validation Scenarios)

Modül devreye alınmadan önce aşağıdaki 5 deterministik birim senaryosu ile doğrulanacaktır:

1. **Test Senaryosu 1 (HTF Kapanışında İptal):**  
   M1 barlarında POI tabanı 1.1000 olan long kurulumunda, fiyat 14. dakikada fitille 1.0995'e inip 1.1005 kapatsın; 15. dakikada (HTF bar kapanışı) 1.0990 kapatsın. Sistemin 14. dakikada pozisyonu koruyup 15. dakikada `POI_BREACHED_BEFORE_TOUCH_HTF_CLOSE` üretmesi doğrulanmalıdır.
2. **Test Senaryosu 2 (Merdiven Displacement İzolasyonu):**  
   3 ardışık barda %40'lık küçük gövdelerle yükselen merdiven yapısı verilsin. Sistemin bunu tek bar displacement saymayıp `DISPLACEMENT_LADDER_UNVERIFIED` koduyla durdurması doğrulanmalıdır.
3. **Test Senaryosu 3 (Dinamik Fib Taşıma & No-Lookahead):**  
   Sweep sonrası fiyat 100'den 110'a çıksın (Fib 0.5 = 105). Sonraki bar 114'e fırlasın (Fib 0.5 = 107). 3. bar 106'ya düşsün. Sistemin 107 seviyesinden dolum yapıp `FILLED` üretmesi doğrulanmalıdır.
4. **Test Senaryosu 4 (Eksik Yapısal Stop Reddi):**  
   Sinyal nesnesinde `htf_structural_anchor` alanı boş (`null`) verilsin. Sistemin 1M fitiline stop koymayıp doğrudan `INSUFFICIENT_DATA_STRUCTURAL_STOP` fırlatması doğrulanmalıdır.
5. **Test Senaryosu 5 (Aynı Mum Çakışması):**  
   Pozisyon açıldıktan sonraki bir barda hem TP hem SL fiyatı aynı anda görülsün (`low <= SL` ve `high >= TP`). Sistemin kesinlikle `SAME_CANDLE_SL_CONSERVATIVE` kodunu ve -1.0R sonucunu üretmesi doğrulanmalıdır.

---

## 7. Çözülemeyen Belirsizlikler (Unresolved Discretionary Items)

Aşağıdaki maddeler kod yazılmadan önce operatör/kullanıcı kararına muhtaçtır:
1. **Ladder Displacement Eşik Değeri:** Merdiven tipi gövdeli ilerleyişin algoritma tarafından kaç barlık pencerede ve hangi minimum kümülatif gövde/aralık oranıyla otomatik kabul edileceği tanımlanmamıştır. (Mevcut spesifikasyon bunu güvenli tarafta kalarak `UNVERIFIED` sayar).
2. **HTF Yapısal Stop Tamponu:** 15M swing tepe/dibine kaç pip tampon (`buffer`) ekleneceği kuralı net değildir (Spesifikasyonda döviz için 2.0 pip, altın için 25 cent varsayılan alan bırakılmıştır).
3. **Maliyet Kesintisi Belirsizliği:** Gerçekleşen 44 benchmark kaydında spread not edilmiş ancak net komisyon USD olarak ayrıştırılmamıştır. Replay motoru `estimateDynamicTransactionCost` modelini opsiyonel bir maliyet katmanı olarak sunacaktır.

---
*Rapor tamamlanmıştır. Üretim kodları değiştirilmemiş, emir gönderilmemiş, backtest çalıştırılmamıştır.*
