import json
import logging
from pathlib import Path
from typing import Tuple, Dict, Any, Optional
from config import BIAS_GATE_FILE

logger = logging.getLogger("ExecutionBiasBridge")

class ExecutionBiasBridge:
    """
    Makro Ajan Ordusu ile MetaTrader 5 / Algoritmik Yürütme Motoru arasındaki
    Yönlü Koruma Kapısı (Execution Gate).
    
    Kural:
    Makro Ajan doğrudan işlem açmaz; teknik işlem motorunun açmak istediği
    emir yönünün küresel makro rejimle çelişip çelişmediğini denetler.
    """
    def __init__(self, gate_file_path: Path = BIAS_GATE_FILE):
        self.gate_file = gate_file_path

    def load_gate_data(self) -> Dict[str, Any]:
        if not self.gate_file.exists():
            return {
                "execution_bias_gates": {},
                "volatility_risk_score": 0.5,
                "primary_regime": "Default Neutral"
            }
        try:
            with open(self.gate_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Gate dosyası okunamadı: {e}")
            return {"execution_bias_gates": {}, "volatility_risk_score": 0.5}

    def is_trade_allowed(self, symbol: str, requested_action: str) -> Tuple[bool, str]:
        """
        Örnek: requested_action = "BUY" veya "SELL"
        symbol = "EURUSD", "XAUUSD" vb.
        
        Döner: (İzin Verildi mi: True/False, Gerekçe: str)
        """
        data = self.load_gate_data()
        gates = data.get("execution_bias_gates", {})
        risk_score = data.get("volatility_risk_score", 0.5)
        regime = data.get("primary_regime", "Bilinmiyor")

        # Aşırı riskli veya kriz rejimi filtresi (Risk > 0.90)
        if risk_score >= 0.90:
            return False, f"Aşırı Sistemik Volatilite Riski (Skor: {risk_score}). Makro kapı kapalı."

        sym_key = symbol.upper()
        allowed_bias = gates.get(sym_key)

        # Eğer sembol için özel kapı tanımlanmamışsa varsayılan olarak izin ver
        if not allowed_bias or allowed_bias in ["NEUTRAL_ALL", "ALL"]:
            return True, f"Makro Rejim ({regime}) nötr; işleme izin verildi."

        if allowed_bias == "NEUTRAL_RANGE":
            return True, f"Makro Rejim ({regime}) {sym_key} için NEUTRAL_RANGE (Enerji / Dış Ticaret Hadleri Kısıtı); kontrollü bant işlemine izin verildi."

        if allowed_bias == "NO_TRADE":
            return False, f"Makro Stratejist {sym_key} için NO_TRADE rejiminde."

        if allowed_bias == "DEFENSIVE_HOLD":
            return False, f"Makro Rejim ({regime}) {sym_key} için DEFENSIVE_HOLD (Sermaye Koruma Modu); yeni yönlü pozisyon açılışı engellendi."

        if allowed_bias == "REDUCE_ONLY":
            return False, f"Makro Rejim ({regime}) {sym_key} için REDUCE_ONLY (Yüksek Risk); yeni risk açılması engellendi."

        req_upper = requested_action.upper()
        if allowed_bias == "LONG_ONLY" and req_upper == "SELL":
            return False, f"Makro Rejim ({regime}) {sym_key} için LONG_ONLY; SELL işlemi engellendi."

        if allowed_bias == "SHORT_ONLY" and req_upper == "BUY":
            return False, f"Makro Rejim ({regime}) {sym_key} için SHORT_ONLY; BUY işlemi engellendi."

        return True, f"İşlem yönü ({requested_action}) makro rejimle ({allowed_bias}) tam uyumlu."

    def get_risk_profile(self) -> Dict[str, Any]:
        """Sermaye koruma modu ve önerilen risk çarpanını döndürür."""
        data = self.load_gate_data()
        return {
            "capital_preservation_mode": data.get("capital_preservation_mode", False),
            "recommended_risk_multiplier": data.get("recommended_risk_multiplier", 1.0),
            "volatility_risk_score": data.get("volatility_risk_score", 0.5),
            "primary_regime": data.get("primary_regime", "Neutral")
        }
