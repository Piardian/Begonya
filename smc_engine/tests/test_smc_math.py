import pytest

def test_premium_discount_calculation():
    # Örnek test durumu: Premium/Discount hesaplama mantığı
    range_high = 100
    range_low = 0
    current_price = 75
    fib_value = (current_price - range_low) / (range_high - range_low)
    assert fib_value == 0.75
    assert fib_value > 0.5  # Premium bölge

def test_structure_break():
    # Örnek test durumu: BOS/CHoCH kırılım mantığı
    break_close_price = 110
    broken_swing_price = 100
    assert break_close_price > broken_swing_price # Bullish kırılım
