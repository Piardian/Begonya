# Begonya & ChecklistTrigger Hibrit Replay — Aşama 1 Doğrulama Denetim Raporu

**Belge Kimliği:** `HYBRID_REPLAY_STAGE1_VALIDATION.md`  
**Denetim Tarihi:** 14 Ekim 2026  
**Denetlenen Modüller:**
- `Begonya/research/hybrid_replay/hybrid_replay.py`
- `Begonya/research/hybrid_replay/test_hybrid_replay.py`
- `Begonya/research/hybrid_replay/hybrid_replay_evaluation_log.json`
- `Begonya/HYBRID_REPLAY_RUN_REPORT.md`

---

## 1. Yönetici Özeti ve Kritik Bulgular

Bu denetim, Aşama 1 kapsamında geliştirilen izole hibrit replay motorunun (`hybrid_replay.py`) ve 66 tarihsel fırsat üzerindeki değerlendirme sonuçlarının kurallara, nedensellik ilkelerine ve veri bütünlüğüne uygunluğunu doğrulamak amacıyla gerçekleştirilmiştir.

### Kritik Denetim Sonuçları:
1. **G2 (%50 Gövde) ve G4 (Ladder Review) Eşitliği Açıklandı:** İki varyantın birebir aynı sayıları (32 Dolum, 32 İptal, 1 Giriş Yok, 1 Süre Aşımı) üretmesinin nedeni bir mantık hatası değil, veri kümesindeki 32 dolum örneğinin tamamında CHOCH kıran ilk mumun tek başına `%50.0` ile `%92.7` arasında büyük gövdeye sahip olmasıdır. `if body_ratio >= body_threshold` kontrolü birincil olduğu için tüm örnekler doğrudan `LARGE_BODY` olarak sınıflandırılmış, `LADDER` dalına düşen örnek kalmamıştır.
2. **Ladder Koruması Doğrulandı:** Kodda `disp_type == 'LADDER'` durumunda fonksiyonun anında `MANUAL_REVIEW_REQUIRED` döndürdüğü, emir dolumuna (`ENTRY_FILLED`) veya Fib 0.5 limit yerleşimine asla izin vermediği kanıtlanmıştır. Birim testlerle bu koruma mühürlenmiştir.
3. **Saat Senkronlu 15M Veto Doğrulandı:** POI geçersiz kılma kontrolleri yalnızca saatlik senkron periyotlara (`:14`, `:29`, `:44`, `:59`) denk gelen M1 barlarının kapanışında işletilmekte ve ihlal anında simülasyon sonlandırılarak gelecek verisinin sızması engellenmektedir.
4. **KRİTİK BULGU — `brokenSwing.price` Stop Referansı Olamaz:** Yapılan yön ve seviye denetiminde, `brokenSwing.price` değerinin kırılan karşı seviye olduğu tespit edilmiştir. Long işlemlerde kırılan tepe (High), Short işlemlerde ise kırılan dip (Low) kaydedilmiştir. Bu nedenle dolan 32 işlemin **27'sinde (%84.4)** stop seviyesi emrin yanlış tarafında kalmaktadır (Long için Stop > Giriş, Short için Stop < Giriş). Bu seviye koruyucu yapısal stop olarak kullanılamaz; yapısal pivot tabanı/tepesi verisi eksikse `INSUFFICIENT_DATA_STRUCTURAL_STOP` verilmelidir.

---

## 2. Varyant Ayrışımı ve G2–G4 Eşitliğinin Kök Neden Analizi

Replay motorunda 4 araştırma varyantı tanımlanmıştır:
- **G1 (BODY_40):** Tek mum gövde oranı $\ge 0.40$
- **G2 (BODY_50):** Tek mum gövde oranı $\ge 0.50$
- **G3 (BODY_60):** Tek mum gövde oranı $\ge 0.60$
- **G4 (LADDER):** Eşik 0.50 + 3 barlık yönlü merdiven displacement tespiti açık

### Kod Seviyesinde Karar Hiyerarşisi (`hybrid_replay.py` Satır 342-363):
```python
# 3. Displacement Değerlendirmesi
c_range = max(c.high - c.low, 1e-8)
c_body = abs(c.close - c.open)
body_ratio = c_body / c_range

# Önce tek mum Büyük Gövde kontrol edilir
if body_ratio >= body_threshold:
    choch_idx = k
    disp_idx = k
    disp_ratio = body_ratio
    disp_type = 'LARGE_BODY'
elif enable_ladder_detection:
    # 3 barlık ardışık gövde merdiveni kontrolü
    if k >= 2:
        three_bars = [future_m1_candles[k - 2], future_m1_candles[k - 1], c]
        total_body = sum(abs(b.close - b.open) for b in three_bars)
        total_range = sum(max(b.high - b.low, 1e-8) for b in three_bars)
        all_directional = (
            all(b.close > b.open for b in three_bars) if is_long
            else all(b.close < b.open for b in three_bars)
        )
        if all_directional and (total_body / total_range >= 0.40):
            choch_idx = k
            disp_idx = k
            disp_ratio = total_body / total_range
            disp_type = 'LADDER'
```

### Karar Günlüğü Analizi:
1. Dolan 32 fırsatın displacement gövde oranları incelendiğinde:
   - **Minimum Gövde Oranı:** `%50.00`
   - **Maksimum Gövde Oranı:** `%92.73`
   - **Ortalama Gövde Oranı:** `%70.60`
   - **$\ge \%50$ Olan Örnek Sayısı:** 32 / 32
2. G4 varyantında `body_threshold = 0.50` olduğundan, kırılım üreten 32 örneğin tamamı ilk `if body_ratio >= body_threshold` koşulunu sağlamış ve doğrudan `LARGE_BODY` etiketini almıştır.
3. Kalan 34 fırsatın 32'si HTF mum kapanışıyla geçersiz olmuş (`INVALIDATED`), 1'i POI'ye hiç temas etmemiş (`EXPIRED`), 1'i ise sweep sonrası CHOCH seviyesini aşamamıştır (`NO_ENTRY`). Dolayısıyla hiçbir örnek `elif enable_ladder_detection` bloğuna kalmamıştır.
4. **Varyant Duyarlılığı Kanıtı (G1 vs G2 vs G3):**
   - **G1 vs G2:** 2 fırsat (`XAUUSD` OB ve FVG) `%43.5` gövde oranına sahiptir. G1'de (%40 eşiği) emir dolmuş; G2'de (%50 eşiği) tekil mum reddedilmiş, ardından gelen 15M kapanışında POI ihlal edilerek `INVALIDATED` olmuştur.
   - **G2 vs G3:** 2 fırsat (`USDCAD_15m_FVG` %52.9 ve `XAUUSD_15m_OB` %58.6) G2'de dolmuş; G3'te (%60 eşiği) gövde yetersiz kalarak `NO_ENTRY` durumuna düşmüştür.
   - Bu durum motorun parametrik varyantları eksiksiz ve hassas biçimde ayrıştırdığını kanıtlar.

---

## 3. Ladder Displacement İzolasyon ve Giriş Engelleme Denetimi

Kullanıcı gereksinimleri uyarınca merdiven (ladder) displacement örnekleri kesinlikle otomatik `ENTRY_FILLED` olmamalı ve performans hesaplarına dahil edilmemelidir.

### Kod Koruması İncelemesi (`hybrid_replay.py` Satır 394-416):
```python
# Eğer displacement türü LADDER ise, anında manuel incelemeye ayır
if disp_type == 'LADDER':
    audit.append(StepRecord('LADDER_DISPLACEMENT_DETECTED', k, c.timestamp, {'ladder_ratio': disp_ratio}))
    return ReplayEvaluationResult(
        candidate_id=candidate.candidate_id,
        structural_opportunity_id=candidate.structural_opportunity_id,
        symbol=candidate.symbol,
        trade_direction=candidate.trade_direction,
        variant_name=variant_name,
        final_status='MANUAL_REVIEW_REQUIRED',
        status_reason='Ladder displacement detected without confirmed single large-body rule; requires manual discretionary review',
        ...
    )
```
- Fonksiyon bu noktada **`return` ederek derhal sonlanmaktadır**.
- Sonraki adım olan Step C (Fib 0.5 hesaplama, limit emir yerleştirme ve sonraki barlarla dolum) koduna asla geçilmez.
- `entry_price` alanı `None`, `filled_bar_index` alanı `None` kalır.

---

## 4. Saat Senkronlu 15M Kapanış Veto ve Nedensellik (No-Lookahead) Denetimi

Replay motorunda POI geçersiz kılınması (invalidation) katı zaman kurallarına bağlanmıştır.

### Mekanizma:
- 15 dakikalık periyotlarda mum kapanışı yalnızca `:14`, `:29`, `:44` ve `:59` dakikalarında gerçekleşir (`is_htf_boundary_minute` fonksiyonu).
- Ara M1 barlarındaki anlık fitil sarkmaları (wick breach) POI'yi iptal etmez; yalnızca bu saat senkronlu sınırlardaki kapanış (`close < zone_low` veya `close > zone_high`) veto üretir.
- Bir aday `INVALIDATED` olduğu anda döngü `return` ile sonlandırılır. Sonraki barlar okunmaz, işlenmez veya hafızaya alınmaz.

### Sayım ve Dağılım:
G2 varyantında geçersiz kılınan 32 fırsatın dökümü:
- **POI Temasından Önce Veto:** 23 fırsat (fiyat POI bölgesine gelmeden önce ilgili 15M mumu bölge dışında kapattı).
- **POI Tepkisi Sırasında Veto:** 9 fırsat (fiyat POI içine girdi, 1M tepkisi ararken 15M mumu bölgenin altında/üstünde kapandı).
- **Gelecek Verisi Sızıntısı:** 0 (Her karar anında sadece o ana kadar oluşan barlar kullanılmıştır).

---

## 5. Yapısal Stop (`brokenSwing.price`) Derin Analizi — KRİTİK UYARI

Kullanıcı 5. maddede `brokenSwing.price` değerinin her fırsatta doğru yönde ve sinyal anında bilinebilir bir stop referansı olup olmadığının denetlenmesini istemiştir.

### Yapılan Denetim ve Bulgular:
ChecklistTrigger (`CLT`) sinyal yapısında yer alan `poi.relatedEvent.brokenSwing` alanı, POI'yi oluşturan HTF hareketinin **kırdığı karşı tepe veya dibi** temsil etmektedir:
- **Bullish BOS (LONG):** Kırılan seviye önceki bir **Swing High**'dır (Örn: Tepe kırıldı, yukarı BOS oldu).
- **Bearish BOS (SHORT):** Kırılan seviye önceki bir **Swing Low**'dır (Örn: Dip kırıldı, aşağı BOS oldu).

Replay motorunun Step D aşamasında bu değer `structural_anchor_price` olarak okunup stop mesafesi mutlak değerle hesaplanmıştır:
```python
structural_stop = candidate.structural_anchor_price
risk_dist = abs(executed_entry_price - structural_stop)
```

### Gerçek Durum ve Hata Kanıtı:
Dolan 32 işlem üzerinde yönsel geçerlilik testi çalıştırılmıştır:
- **Long İşlemler (20 adet):** Geçerli bir Stop Loss, giriş fiyatının **altında** olmalıdır (`Stop < Entry`).
  - **Ters/Geçersiz Stop Sayısı:** **16 / 20** (Stop seviyesi girişin **üzerindedir**!).
- **Short İşlemler (12 adet):** Geçerli bir Stop Loss, giriş fiyatının **üstünde** olmalıdır (`Stop > Entry`).
  - **Ters/Geçersiz Stop Sayısı:** **11 / 12** (Stop seviyesi girişin **altındadır**!).
- **Toplam Hatalı Stop Oranı:** **27 / 32 (%84.4)**.

#### Somut Örnekler:
1. `USDJPY` Short Fırsatı (`entry_price = 159.0645`):
   - Kırılan dip (`brokenSwing.price`): `158.95627`.
   - Short işlemde stop girişi 159.06 iken stop 158.95'e konulamaz! Fiyat düşerken kâr bölgesinde stop oluşmaktadır.
2. `USDCAD` Long Fırsatı (`entry_price = 1.37395`):
   - Kırılan tepe (`brokenSwing.price`): `1.37443`.
   - Long işlemde stop girişi 1.37395 iken stop 1.37443'e konulamaz! Stop seviyesi emrin üstündedir.

### 5 "Mantıklı" Görünen Örnek Neden Öyle Çıktı?
Kalan 5 örnekte fiyat kırılan seviyenin çok ötesine geri çekildiği veya FVG boşluğu ekstrem seviyede olduğu için matematiksel olarak eşitsizlik tesadüfen yönle uyuşmuştur; ancak yapısal olarak o seviye yine de koruyucu tepe/dip değil, kırılmış olan seviyedir.

> [!CAUTION]
> **Aşama 2 (Çıkış ve Net R) İçin Zorunlu Karar:**  
> `brokenSwing.price` hiçbir şekilde koruyucu Stop Loss olarak kullanılamaz.  
> Bu değer koruyucu dip/tepe değil, kırılan yapıdır (Target veya trigger referansıdır).  
> Gerçek koruyucu yapısal stop, kırılımı başlatan dalganın başlangıç pivotudur (Originating Swing Extreme) veya POI'nin yapısal tabanıdır.  
> Veri kümesinde bu başlangıç pivotu açıkça kayıtlı değilse, Aşama 2'ye geçmeden önce kural gereği bu fırsatlara `INSUFFICIENT_DATA_STRUCTURAL_STOP` statüsü verilmeli veya yapısal stop tanımı kullanıcı onayıyla netleştirilmelidir.

---

## 6. Durum Geçişleri ve Veri Tutarlılığı Mutabakatı

`hybrid_replay_evaluation_log.json` ve `HYBRID_REPLAY_RUN_REPORT.md` verileri satır satır mutabakat testine tabi tutulmuştur.

| Varyant | Toplam Aday | ENTRY_FILLED | INVALIDATED | NO_ENTRY | EXPIRED | MANUAL_REVIEW | INSUFFICIENT_DATA |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **G1 (Gövde %40)** | 66 | 34 (%51.5) | 30 (%45.5) | 1 (%1.5) | 1 (%1.5) | 0 | 0 |
| **G2 (Gövde %50)** | 66 | 32 (%48.5) | 32 (%48.5) | 1 (%1.5) | 1 (%1.5) | 0 | 0 |
| **G3 (Gövde %60)** | 66 | 30 (%45.5) | 32 (%48.5) | 3 (%4.5) | 1 (%1.5) | 0 | 0 |
| **G4 (Ladder Rev)** | 66 | 32 (%48.5) | 32 (%48.5) | 1 (%1.5) | 1 (%1.5) | 0 | 0 |

- **Rapor ve Log Mutabakatı:** 66 fırsatın tamamında durum kodları, zaman damgaları ve filtre geçişleri raporla **%100 uyumludur**. Hiçbir uyuşmazlık veya hayali kayıt bulunmamaktadır.

---

## 7. Birim Test Paketi ve Doğrulama Sonuçları

`Begonya/research/hybrid_replay/test_hybrid_replay.py` dosyasına G4 varyantının merdiven displacement durumunda emir doldurmasını kesin olarak engelleyen senaryolar eklenmiştir.

### Eklenen ve Güncellenen Test Senaryoları:
1. `test_missing_structural_anchor_rejects`: Yapısal çapa eksikliğinde `INSUFFICIENT_DATA_STRUCTURAL_STOP` döndüğünü doğrular.
2. `test_insufficient_m1_bars_rejects`: M1 veri yetersizliğinde `INSUFFICIENT_DATA_M1_MISSING` döndüğünü doğrular.
3. `test_htf_clock_aligned_close_veto`: 15M bar sınırında kapanış ihlaliyle `INVALIDATED` üretimini doğrular.
4. `test_dynamic_fib_expansion_and_subsequent_fill`: Dinamik Fib genişlemesi ve sonraki barlarla dolumu doğrular.
5. `test_ladder_displacement_classified_manual_review`: Merdiven displacement tespit edildiğinde `MANUAL_REVIEW_REQUIRED` üretildiğini, `entry_price` ve `filled_bar_index`'in `None` kaldığını doğrular.
6. `test_g4_variant_ladder_prevents_autofill_despite_deep_retrace` (**YENİ**): Merdiven oluşumundan sonra fiyat Fib 0.5 seviyesinin altına/üstüne derin çekilme yapsa dahi emrin doldurulmadığını (`ENTRY_FILLED` olmadığını) ve sürecin `MANUAL_REVIEW_REQUIRED` sınıfında izole kaldığını doğrular.

### Test Koşumu Sonucu:
```text
Ran 6 tests in 0.000s
OK
```
Tüm birim testler sıfır hata ile başarıyla tamamlanmıştır.

---

## 8. Aşama 2'ye Geçiş İçin Karar ve Öneri

1. **Giriş Motoru Onayı:** Giriş onaylama mantığı (POI teması, saat senkronlu veto, inducement, CHOCH, displacement eşikleri, dinamik Fib 0.5 ve sonraki barlarda dolum) matematiksel ve nedensel olarak doğrulanmıştır.
2. **Yapısal Stop Düzeltmesi Zorunluluğu:** Çıkış simülasyonu (TP/SL/BE) ve Net R hesaplamasına geçilmeden önce, 5. maddede belgelenen `brokenSwing.price` tersliği çözülmelidir. Gerçek işlemlerin stop referansı ya POI'nin yapısal sınırına (OB low/high) ya da sinyali üreten dalganın başlangıç swing noktasına bağlanmalıdır. Bu yapılmadan başlatılacak herhangi bir çıkış simülasyonu anlamsız ve hatalı sonuçlar üretecektir.
