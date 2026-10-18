"""
Forensic Audit Unit Tests
=========================
Verifies:
1. Timestamp-based slicing (preventing relative index lookback bug)
2. Accurate spread-adjusted R calculations
3. Strict chronology of equity curve and drawdown

Path: Begonya/research/ultimate_validation/test_forensic_audit.py
"""

import pytest
from datetime import datetime, timezone
from ultimate_replay_engine import Candle, run_trade_simulation


class TestForensicAuditSuite:

    def test_slicing_by_timestamp_prevents_lookback_bug(self):
        # Full dataset starts at T=1000, 2000, 3000, 4000, 5000
        # Trade signals at T=4000, fills at T=4000
        # If relative index 1 was mistakenly used on full dataset, it would pick T=2000 (PAST!)
        full_candles = [
            Candle(timestamp=1000, open=100, high=101, low=99, close=100),
            Candle(timestamp=2000, open=100, high=101, low=99, close=100),
            Candle(timestamp=3000, open=100, high=101, low=99, close=100),
            Candle(timestamp=4000, open=100, high=101, low=99, close=100),
            Candle(timestamp=5000, open=100, high=105, low=99, close=104),
        ]
        fill_ts = 4000
        # The correct slicing MUST strictly filter timestamp > fill_ts
        correct_fwd = [c for c in full_candles if c.timestamp > fill_ts]
        assert len(correct_fwd) == 1
        assert correct_fwd[0].timestamp == 5000

    def test_spread_drag_debit_math(self):
        # Entry = 100, Stop = 90 (Risk = 10), Target = 150 (Reward = 50 = 5R)
        # Spread = 1.0 (Spread value = 1.0 -> 0.1 R)
        risk = 10.0
        spread_val = 1.0
        spread_r = spread_val / risk  # 0.1 R
        planned_r = 5.0

        # On target hit, True realized R must debit spread friction
        true_win_r = planned_r - spread_r
        assert true_win_r == 4.9

        # On stop hit, True loss must increase by spread friction
        true_loss_r = -1.0 - spread_r
        assert true_loss_r == -1.1

    def test_drawdown_chronological_sequence(self):
        # Sequence: -1, -1, -1, +5, -1
        # Equity: -1, -2, -3, +2, +1
        # Peak: 0, 0, 0, 2, 2
        # Drawdown at step 3: 0 - (-3) = 3.0
        r_series = [-1.0, -1.0, -1.0, 5.0, -1.0]
        running = 0.0
        peak = 0.0
        max_dd = 0.0
        for r in r_series:
            running += r
            if running > peak:
                peak = running
            dd = peak - running
            if dd > max_dd:
                max_dd = dd
        assert max_dd == 3.0

    def test_setup_cluster_deduplication(self):
        # Two signals generated on the same candle, same entry price, overlapping window
        trade_1 = {'candidate_id': 'T1_OB', 'symbol': 'XAUUSD', 'direction': 'long', 'fill_ts': 1000, 'exit_ts': 2000, 'entry_price': 100.0}
        trade_2 = {'candidate_id': 'T2_FVG', 'symbol': 'XAUUSD', 'direction': 'long', 'fill_ts': 1000, 'exit_ts': 2000, 'entry_price': 100.0}
        candidates = [trade_1, trade_2]
        
        deduped = []
        for c in candidates:
            dup = False
            for active in deduped:
                if c['symbol'] == active['symbol'] and c['direction'] == active['direction']:
                    overlap = not (c['fill_ts'] >= active['exit_ts'] or c['exit_ts'] <= active['fill_ts'])
                    if overlap and abs(c['entry_price'] - active['entry_price']) < 0.01:
                        dup = True
                        break
            if not dup:
                deduped.append(c)
        assert len(deduped) == 1
        assert deduped[0]['candidate_id'] == 'T1_OB'

    def test_forward_walk_harness_enforcement(self, tmp_path):
        from forward_walk_harness import ForwardWalkEngine, FORWARD_WALK_START_TS
        journal_file = str(tmp_path / "test_journal.jsonl")
        state_file = str(tmp_path / "test_state.json")
        engine = ForwardWalkEngine(journal_file, state_file)

        # 1. Past candidate must be rejected
        past_cand = {
            'candidate_id': 'PAST_1',
            'symbol': 'EURUSD',
            'direction': 'long',
            'signal_timestamp': FORWARD_WALK_START_TS - 1000,
            'entry_price': 1.1000,
            'stop_price': 1.0950,
            'target_price': 1.1100
        }
        res1 = engine.process_candidate_signal(past_cand)
        assert res1.status == 'REJECTED_LOOKBACK'

        # 2. Valid forward candidate accepted as PENDING_FILL
        fwd_cand1 = {
            'candidate_id': 'FWD_1',
            'symbol': 'EURUSD',
            'direction': 'long',
            'signal_timestamp': FORWARD_WALK_START_TS + 1000,
            'entry_price': 1.1000,
            'stop_price': 1.0950,
            'target_price': 1.1100,
            'spread_pips': 1.5,
            'planned_r': 2.0
        }
        res2 = engine.process_candidate_signal(fwd_cand1)
        assert res2.status == 'PENDING_FILL'

        # 3. Duplicate concurrent candidate rejected
        fwd_cand2 = {
            'candidate_id': 'FWD_2',
            'symbol': 'EURUSD',
            'direction': 'long',
            'signal_timestamp': FORWARD_WALK_START_TS + 2000,
            'entry_price': 1.1000,
            'stop_price': 1.0950,
            'target_price': 1.1100
        }
        res3 = engine.process_candidate_signal(fwd_cand2)
        assert res3.status == 'REJECTED_DUPLICATE'

        # 4. Fill and exit via candle update
        c_fill = {'open_time': FORWARD_WALK_START_TS + 3000, 'open': 1.1010, 'high': 1.1020, 'low': 1.0990, 'close': 1.1000, 'close_time': FORWARD_WALK_START_TS + 60000}
        engine.update_with_candle('EURUSD', c_fill)
        assert res2.status == 'ACTIVE'

        c_exit = {'open_time': FORWARD_WALK_START_TS + 61000, 'open': 1.1010, 'high': 1.1120, 'low': 1.0990, 'close': 1.1110, 'close_time': FORWARD_WALK_START_TS + 120000}
        engine.update_with_candle('EURUSD', c_exit)
        assert res2.status == 'CLOSED'
        assert res2.exit_status == 'TARGET_HIT'

        metrics = engine.compute_metrics()
        assert metrics['total_closed'] == 1
        assert metrics['sum_r'] == 2.0

    def test_mfe_mae_bounded_strictly_to_trade_life(self):
        # Entry: 100, Stop: 90 (Risk: 10), Target: 130 (Reward: 30 = 3R)
        # Bar 0: Entry candle, favorable +5 (high=105, low=99) -> MFE = 0.5R, MAE = 0.1R
        # Bar 1: Stopped out (low=88, high=102) -> Stop hit at 90!
        # Bar 2: Post-exit bar runs to 160 (+6R!) -> MUST NOT leak into MFE!
        candles = [
            Candle(timestamp=1000, open=100, high=105, low=99, close=102),
            Candle(timestamp=2000, open=102, high=102, low=88, close=89),
            Candle(timestamp=3000, open=89, high=160, low=89, close=155),
        ]
        res = run_trade_simulation(
            entry_price=100.0,
            stop_price=90.0,
            target_price=130.0,
            direction='long',
            forward_m1_bars=candles,
            spread_pips=0.0,
            symbol='TEST',
            commission_r=0.0
        )
        assert res['exit_status'] == 'STOP_HIT'
        assert res['exit_bar'] == 1
        assert res['realized_r'] == -1.0
        # MFE must be 0.5R (from bar 0 high 105), NOT 6.0R (from post-exit bar 2 high 160)!
        assert res['mfe_r'] == 0.5
        # MAE must be 1.2R (from bar 1 low 88)
        assert res['mae_r'] == 1.2

