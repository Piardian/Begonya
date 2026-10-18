import unittest
from unittest.mock import patch, MagicMock, AsyncMock
import os
import tempfile
import json
import asyncio
from datetime import datetime, timedelta

from models import (
    ResearchError,
    DataValidationError,
    ProcessingError,
    NotFoundError,
    SignalDiagnostic,
    TradeResult,
    FilterMetrics,
    DiagnosticReport,
)

from diagnostics_engine import DiagnosticsEngine
import diagnostic_tool


class TestModelsAndErrors(unittest.TestCase):
    def test_research_error_hierarchy(self):
        """Özel hata sınıflarının ResearchError türevi olduğunu doğrular."""
        self.assertTrue(issubclass(DataValidationError, ResearchError))
        self.assertTrue(issubclass(ProcessingError, ResearchError))
        self.assertTrue(issubclass(NotFoundError, ResearchError))

    def test_exceptions_raising(self):
        """Hata fırlatma davranışlarını test eder."""
        with self.assertRaises(DataValidationError):
            raise DataValidationError("Veri doğrulama hatası")

        with self.assertRaises(ProcessingError):
            raise ProcessingError("İşleme hatası")

        with self.assertRaises(NotFoundError):
            raise NotFoundError("Kaynak bulunamadı")

    def test_dataclasses_instantiation(self):
        """Veri modellerinin başarıyla oluşturulduğunu doğrular."""
        now = datetime.now()
        sig = SignalDiagnostic(
            signal_id="sig_1",
            symbol="BTCUSDT",
            timestamp=now,
            direction="LONG",
            score=0.95,
            status="ACTIVE",
            metrics={"rsi": 30}
        )
        self.assertEqual(sig.signal_id, "sig_1")
        self.assertEqual(sig.score, 0.95)

        trade = TradeResult(
            trade_id="t_1",
            signal_id="sig_1",
            symbol="BTCUSDT",
            entry_price=50000.0,
            exit_price=51000.0,
            pnl=1000.0,
            pnl_percentage=2.0,
            entry_time=now,
            exit_time=now,
            status="CLOSED"
        )
        self.assertEqual(trade.pnl, 1000.0)

        filter_m = FilterMetrics(
            filter_name="rsi_filter",
            passed_count=10,
            rejected_count=2,
            rejection_reasons={"overbought": 2}
        )
        self.assertEqual(filter_m.passed_count, 10)

        report = DiagnosticReport(
            report_id="rep_1",
            generated_at=now,
            signals_summary=[sig]
        )
        self.assertEqual(len(report.signals_summary), 1)


class TestDiagnosticsEngine(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.log_path = os.path.join(self.temp_dir.name, "trading.log")
        self.journal_path = os.path.join(self.temp_dir.name, "trade_journal.json")
        self.engine = DiagnosticsEngine(log_path=self.log_path, journal_path=self.journal_path)

    def tearDown(self):
        self.temp_dir.cleanup()