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

        req_upper = requested_action.upper()
        if allowed_bias == "LONG_ONLY":
            if req_upper in ["BUY", "LONG"]:
                return True, f"İşlem yönü ({requested_action}) makro rejimle ({allowed_bias}) doğru orantılı ve tam uyumlu."
            return False, f"Makro Rejim ({regime}) {sym_key} için LONG_ONLY; {requested_action} işlemi engellendi (Ters orantılı)."

        if allowed_bias == "SHORT_ONLY":
            if req_upper in ["SELL", "SHORT"]:
                return True, f"İşlem yönü ({requested_action}) makro rejimle ({allowed_bias}) doğru orantılı ve tam uyumlu."
            return False, f"Makro Rejim ({regime}) {sym_key} için SHORT_ONLY; {requested_action} işlemi engellendi (Ters orantılı)."

        if allowed_bias in ["DEFENSIVE_HOLD", "NO_TRADE", "REDUCE_ONLY"]:
            return False, f"Makro Rejim ({regime}) {sym_key} için {allowed_bias} (Savunma Modu); yeni işlem açılamaz."

        if allowed_bias in ["NEUTRAL_RANGE", "NEUTRAL_ALL", "ALL"] or not allowed_bias:
            return False, f"Makro Rejim ({regime}) {sym_key} için nötr / yönsüzdür ({allowed_bias or 'TANIMSIZ'}). Yalnızca makro ile doğru orantılı işlemlere izin verilir."

        return False, f"Makro kapı kısıtı ({allowed_bias}) nedeniyle işlem engellendi."

    def get_risk_profile(self) -> Dict[str, Any]:
        """Sermaye koruma modu ve önerilen risk çarpanını döndürür."""
        data = self.load_gate_data()
        return {
            "capital_preservation_mode": data.get("capital_preservation_mode", False),
            "recommended_risk_multiplier": data.get("recommended_risk_multiplier", 1.0),
            "volatility_risk_score": data.get("volatility_risk_score", 0.5),
            "primary_regime": data.get("primary_regime", "Neutral")
        }
