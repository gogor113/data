//+------------------------------------------------------------------+
//|                                              SmartRiskManager.mq5|
//|                                  Copyright 2026, Gogor   v29.00  |
//|STRATEGI POLA N ZZ - ENTRY SETELAH PENEMBUSAN TITIK ZZ PERMANEN   |
//|           LOGIKA WAJIB KONFIRMASI STRUKTUR N SEBELUM EKSEKUSI    |
//+------------------------------------------------------------------+
#property version   "29.00" // Update: Self-Healing & Daily Research Mode
#property strict           
#property copyright "STRATEGY N-PATTERN ZZ V1"
#property description "WAJIB UJICOBA DI DEMO_KAMI TIDAK BERTANGGUNGJAWAB ATAS SEGALA KERUGIAN"
#property description "https://www.facebook.com/andry.tambak "
#property description "t.me/andrianto13"

//--- [Parameter Input Operasional - User Definable] ---
input double   InpRiskAmount     = 1.0;     // 1. Risiko per transaksi (USD)
input double   InpMaxRiskUSD     = 1.1;     // 2. Batas floating loss per tiket
input int      InpMaxSpread      = 500;     // 3. Max Spread allowed
input double   InpDailyTargetUSD = 5.0;  // 4. Target Profit Harian
input double   InpDailyLossUSD   = 100.0; // 5. Batas Loss Harian 
input double   InpMinEquity      = 5.0;    // 6. Minimal Equity Operasional

//--- [Parameter Permanen - Hardcoded (Internal Variables)] ---
const double   InpBufferPercent  = 10.0;    // Margin pengaman SL dari ZigZag (%)
const double   InpRewardRatio    = 2.0;     // Rasio RR (1:2)
const long     InpMagicNumber    = 130806;  // Magic Number
const bool     InpAutoEntry      = true;    // Full Otomatis

//--- [Parameter Indikator ZigZag Permanen] ---
const int      InpZZDepth        = 5;       // ZZ Depth
const int      InpZZDev          = 5;       // ZZ Deviation
const int      InpZZStep         = 3;       // ZZ Step

//--- [Pengaturan Visual Dashboard Permanen] ---
const int      InpStartX         = 20;      
const int      InpStartY         = 30;      
const int      InpRowStep        = 22;      
const int      InpColumnX        = 120;     
const color    InpMainColor      = clrYellow; 
const color    InpValColor       = clrAqua;   
const color    InpPosColor       = clrLime;    
const color    InpNegColor       = clrRed;     

#include <Trade\Trade.mqh>           
#include <Trade\PositionInfo.mqh>    

//--- Variabel Global ---
CTrade         trade;                // Instance eksekusi trade (v29.00)
CPositionInfo  posInfo;              // Info posisi aktif (v29.00)
string         prefix = "SRM_Pro_";  // Prefix objek visual
datetime       EXPIRED_DATE = D'2026.12.31 23:59'; // Masa aktif sistem
int            hZZ = INVALID_HANDLE;                // Handle indikator ZigZag

//--- Cache Operasional (Anti-Freeze) ---
double         lastZZH = 0, lastZZL = 0;            // Cache harga ZZ terakhir
datetime       lastEntryZZTimeH = 0;                // Mencegah double entry di titik High yang sama
datetime       lastEntryZZTimeL = 0;                // Mencegah double entry di titik Low yang sama
datetime       lastRefreshTime = 0;                 // Flag pembersihan data harian
datetime       lastCandleTime = 0;                  // Tracker pergantian bar
datetime       lastSelfHealing = 0;                 // Tracker pemulihan mandiri
string         g_LastErrorMessage = "System Ready"; // Status sistem di dashboard
bool           g_IsSystemHalted   = false;          // Status penghentian sistem
bool           g_DailyLimitHit    = false;          // Status batas harian
bool           g_MarketClosed     = false;          // Status pasar
bool           g_LowBalance       = false;          // Status margin/equity

//+------------------------------------------------------------------+
//| OnInit: Inisialisasi Sistem v29.00                               |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber); // Set identitas robot v29.00
   trade.SetTypeFillingBySymbol(_Symbol);      // Set eksekusi filling sesuai broker
   
   if(!InitializeZZHandler()) return(INIT_FAILED); // Load ZigZag dengan verifikasi
   
   lastRefreshTime = iTime(_Symbol, PERIOD_D1, 0); // Set waktu reset pada awal hari ini
   ObjectsDeleteAll(0, prefix);     // Bersihkan chart dari objek lama
   CreateDashboard();               // Gambar UI UI v29.00
   EventSetTimer(1);                // Timer per detik untuk responsivitas
   return(INIT_SUCCEEDED);          
}

//+------------------------------------------------------------------+
//| InitializeZZHandler: Load Indikator & Verifikasi Handle          |
//+------------------------------------------------------------------+
bool InitializeZZHandler()
{
   if(hZZ != INVALID_HANDLE) IndicatorRelease(hZZ); // Release jika ada handle lama
   hZZ = iCustom(_Symbol, _Period, "Examples\\ZigZag", InpZZDepth, InpZZDev, InpZZStep); // Load ZZ Standard
   if(hZZ == INVALID_HANDLE) { 
      g_LastErrorMessage = "CRITICAL: ZZ Handle Fail (" + (string)GetLastError() + ")"; 
      return false; 
   }
   return true; 
}

//+------------------------------------------------------------------+
//| OnDeinit: Cleanup Memori                                         |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) 
{ 
   EventKillTimer(); // Hentikan timer sistem
   if(hZZ != INVALID_HANDLE) IndicatorRelease(hZZ); // Hapus handle indikator
   ObjectsDeleteAll(0, prefix); // Bersihkan dashboard visual
}

//+------------------------------------------------------------------+
//| OnTick: Logika Utama dengan Self-Healing Engine                  |
//+------------------------------------------------------------------+
void OnTick()
{
   // 1. Prosedur Keamanan & Kesehatan Akun
   CheckAccountAndMarket(); 
   MonitorAndResetSystem(); // Reset harian & Self-healing
   
   if(g_IsSystemHalted) return; // Stop jika expired
   
   // 2. Deteksi Koneksi & Handle (Self-Healing Trigger)
   if(!TerminalInfoInteger(TERMINAL_CONNECTED)) { g_LastErrorMessage = "Err: Reconnecting..."; return; }
   if(hZZ == INVALID_HANDLE) { PerformSystemSelfHealing(); return; } 

   // 3. Kalkulasi Target Harian
   double dailyProfit = GetDailyRealizedProfit(); 
   g_DailyLimitHit = (dailyProfit >= InpDailyTargetUSD || dailyProfit <= -InpDailyLossUSD); 
   if(g_DailyLimitHit) g_LastErrorMessage = "Daily Goal/Loss Reached";

   // 4. Proteksi Integritas Order (Anti-Manual & SL/TP Sync)
   AntiManualOrderFilter();     
   RestoreIntegritySLTP();      
   CheckSlippageAndProtection(); 
   
   // 5. Update Data ZigZag tiap Bar Baru
   datetime currentBarTime = iTime(_Symbol, _Period, 0); 
   if(currentBarTime != lastCandleTime) { 
      SyncToLatestZZ(); 
      lastCandleTime = currentBarTime; 
   }
   
   // 6. Eksekusi Market Momentum (Logika Pola N)
   if(InpAutoEntry && !g_DailyLimitHit && !g_MarketClosed && !g_LowBalance && !g_IsSystemHalted) { 
      if(MQLInfoInteger(MQL_TRADE_ALLOWED) && AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)) {
         ExecuteMarketZZ(); 
      } else {
         g_LastErrorMessage = "Err: AutoTrade Disabled";
      }
   }
   
   UpdateDashboard(); // Refresh UI visual
}

//+------------------------------------------------------------------+
//| PerformSystemSelfHealing: Pemulihan Mandiri Tanpa Manual Reset   |
//+------------------------------------------------------------------+
void PerformSystemSelfHealing()
{
   datetime now = TimeCurrent();
   if(now - lastSelfHealing < 10) return; // Hindari loop healing terlalu cepat (min 10 detik)
   
   g_LastErrorMessage = "Self-Healing: Repairing Handle...";
   if(InitializeZZHandler()) {
      g_LastErrorMessage = "System Recovered Successfully";
   } else {
      g_LastErrorMessage = "Repair Failed. Retrying...";
   }
   lastSelfHealing = now;
}

//+------------------------------------------------------------------+
//| MonitorAndResetSystem: Reset Harian Tanpa Menutup Posisi Aktif   |
//+------------------------------------------------------------------+
void MonitorAndResetSystem()
{
   datetime todayStart = iTime(_Symbol, PERIOD_D1, 0); 
   
   // Jika waktu sekarang sudah masuk hari baru dibanding lastRefreshTime
   if(todayStart > lastRefreshTime) { 
      // Reset momentum cache agar mencari peluang baru di struktur hari ini
      lastEntryZZTimeH = 0; 
      lastEntryZZTimeL = 0; 
      lastRefreshTime = todayStart; 
      
      g_LastErrorMessage = "Daily Refresh: Data Cleared";
      Print("SRM v29.00: Daily Research Data Refreshed. Positions kept active.");
      ChartRedraw(0); 
   }
   
   // Verifikasi Handle secara periodik jika terjadi freeze tersembunyi
   if(hZZ != INVALID_HANDLE) {
      double checkBuf[];
      if(CopyBuffer(hZZ, 0, 0, 1, checkBuf) <= 0) {
         PerformSystemSelfHealing(); // Trigger healing jika buffer tidak terbaca
      }
   }
}

//+------------------------------------------------------------------+
//| ExecuteMarketZZ: Logika Pola N (Breakout ZZ Permanen) v29.00     |
//+------------------------------------------------------------------+
void ExecuteMarketZZ()
{
   int currentSpread = (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD); 
   if(currentSpread > InpMaxSpread || currentSpread < 0) {
      g_LastErrorMessage = "Wait: High Spread (" + (string)currentSpread + ")";
      return; 
   }

   double zzH, zzL; datetime tH, tL; 
   GetLatestZZData(zzH, zzL, tH, tL); // Ambil titik ZZ terbaru hasil filter
   
   if(zzH <= 0 || zzL <= 0) {
      g_LastErrorMessage = "Scanning Market Structure...";
      return; 
   }

   // --- VALIDASI TITIK PERMANEN (Zero-Freeze Logic) ---
   if(tH >= iTime(_Symbol, _Period, 0) || tL >= iTime(_Symbol, _Period, 0)) return; 

   double priceClose0 = iClose(_Symbol, _Period, 0); 
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK); 
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID); 
   int dig = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS); 
   
   // --- LOGIKA ENTRY BUY (POLA N) ---
   if(priceClose0 > zzH && tH != lastEntryZZTimeH) { 
      double sl = NormalizeDouble(zzL - (MathAbs(zzH-zzL)*(InpBufferPercent/100.0)), dig); 
      double tp = NormalizeDouble(ask + (MathAbs(ask-sl)*InpRewardRatio), dig); 
      double lot = CalculatePreciseLot(ask, sl); 

      if(lot >= SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN) && CheckMarginSafe(ORDER_TYPE_BUY, lot)) { 
         if(trade.Buy(lot, _Symbol, ask, sl, tp, "ZZ_N_BUY_v29")) { 
            lastEntryZZTimeH = tH; 
            g_LastErrorMessage = "Trade: Buy Pattern N Confirmed"; 
         } else {
            g_LastErrorMessage = "Buy Error: " + (string)trade.ResultRetcode();
         }
      }
   }
   
   // --- LOGIKA ENTRY SELL (POLA N TERBALIK) ---
   else if(priceClose0 < zzL && tL != lastEntryZZTimeL) { 
      double sl = NormalizeDouble(zzH + (MathAbs(zzH-zzL)*(InpBufferPercent/100.0)), dig); 
      double tp = NormalizeDouble(bid - (MathAbs(sl-bid)*InpRewardRatio), dig); 
      double lot = CalculatePreciseLot(bid, sl); 

      if(lot >= SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN) && CheckMarginSafe(ORDER_TYPE_SELL, lot)) { 
         if(trade.Sell(lot, _Symbol, bid, sl, tp, "ZZ_N_SELL_v29")) { 
            lastEntryZZTimeL = tL; 
            g_LastErrorMessage = "Trade: Sell Inv-N Confirmed"; 
         } else {
            g_LastErrorMessage = "Sell Error: " + (string)trade.ResultRetcode();
         }
      }
   }
}

//+------------------------------------------------------------------+
//| GetLatestZZData: Mencari Titik ZZ Terakhir dengan Validasi Buffer|
//+------------------------------------------------------------------+
void GetLatestZZData(double &zzH, double &zzL, datetime &timeH, datetime &timeL) {
   double zzBuf[]; ArraySetAsSeries(zzBuf, true); 
   zzH = 0; zzL = 0; timeH = 0; timeL = 0; 
   int copied = CopyBuffer(hZZ, 0, 0, 1000, zzBuf); // Ambil 1000 bar data untuk kedalaman analisa
   if(copied > 0) { 
      // Cari High ZZ terakhir (Looping presisi tinggi)
      for(int i = 1; i < copied; i++) { 
         if(zzBuf[i] > 0 && zzBuf[i] < EMPTY_VALUE) { 
            if(MathAbs(zzBuf[i] - iHigh(_Symbol, _Period, i)) < _Point * 10) { 
               zzH = zzBuf[i]; timeH = iTime(_Symbol, _Period, i); break; 
            }
         }
      }
      // Cari Low ZZ terakhir
      for(int i = 1; i < copied; i++) { 
         if(zzBuf[i] > 0 && zzBuf[i] < EMPTY_VALUE) { 
            if(MathAbs(zzBuf[i] - iLow(_Symbol, _Period, i)) < _Point * 10) { 
               zzL = zzBuf[i]; timeL = iTime(_Symbol, _Period, i); break; 
            }
         }
      }
   }
   ArrayFree(zzBuf); 
}

//+------------------------------------------------------------------+
//| RestoreIntegritySLTP: Memastikan Keamanan Posisi Tanpa Celah     |
//+------------------------------------------------------------------+
void RestoreIntegritySLTP() {
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED)) return;
   for(int i = PositionsTotal() - 1; i >= 0; i--) { 
      if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber) { 
         int dig = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS); 
         // Paksa modifikasi jika posisi terbuka tanpa SL atau TP (mencegah risiko fatal)
         if(posInfo.StopLoss() <= 0 || posInfo.TakeProfit() <= 0) { 
            double zzH, zzL; datetime tH, tL; GetLatestZZData(zzH, zzL, tH, tL); 
            if(zzH <= 0 || zzL <= 0) continue; 
            double targetSL = 0, targetTP = 0; 
            if(posInfo.PositionType() == POSITION_TYPE_BUY) { 
               targetSL = NormalizeDouble(zzL - (MathAbs(zzH-zzL)*(InpBufferPercent/100.0)), dig); 
               targetTP = NormalizeDouble(posInfo.PriceOpen() + (MathAbs(posInfo.PriceOpen()-targetSL)*InpRewardRatio), dig); 
            } else { 
               targetSL = NormalizeDouble(zzH + (MathAbs(zzH-zzL)*(InpBufferPercent/100.0)), dig); 
               targetTP = NormalizeDouble(posInfo.PriceOpen() - (MathAbs(targetSL-posInfo.PriceOpen())*InpRewardRatio), dig); 
            }
            if(!trade.PositionModify(posInfo.Ticket(), targetSL, targetTP)) {
               g_LastErrorMessage = "Repair Fail: SL/TP Integrity";
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| CalculatePreciseLot: Money Management Berbasis Risiko USD        |
//+------------------------------------------------------------------+
double CalculatePreciseLot(double entry, double sl) {
   double dist = MathAbs(entry - sl); if(dist < _Point) return SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN); 
   double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE), ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);  
   if(ts <= 0 || tv <= 0) return SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN); 
   double rawLot = InpRiskAmount / ((dist / ts) * tv); 
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP), minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN), maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX); 
   double finalLot = NormalizeDouble(MathMax(MathFloor(rawLot / step) * step, minLot), 2); 
   return (finalLot > maxLot) ? maxLot : finalLot; 
}

//+------------------------------------------------------------------+
//| CheckMarginSafe: Verifikasi Kecukupan Margin Sebelum Entry       |
//+------------------------------------------------------------------+
bool CheckMarginSafe(ENUM_ORDER_TYPE type, double lot) {
   double marginReq = 0; if(!OrderCalcMargin(type, _Symbol, lot, SymbolInfoDouble(_Symbol, (type == ORDER_TYPE_BUY ? SYMBOL_ASK : SYMBOL_BID)), marginReq)) return false; 
   return (AccountInfoDouble(ACCOUNT_MARGIN_FREE) > marginReq); 
}

void SyncToLatestZZ() { double zzH, zzL; datetime tH, tL; GetLatestZZData(zzH, zzL, tH, tL); lastZZH = zzH; lastZZL = zzL; }

//+------------------------------------------------------------------+
//| AntiManualOrderFilter: Menghapus Gangguan Order Luar Sistem      |
//+------------------------------------------------------------------+
void AntiManualOrderFilter() {
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() != InpMagicNumber) trade.PositionClose(posInfo.Ticket()); 
   for(int i = OrdersTotal() - 1; i >= 0; i--) { ulong t = OrderGetTicket(i); if(OrderSelect(t) && OrderGetInteger(ORDER_MAGIC) != InpMagicNumber) trade.OrderDelete(t); } 
}

double GetDailyRealizedProfit() {
   double p = 0; HistorySelect(iTime(_Symbol, PERIOD_D1, 0), TimeCurrent()); 
   for(int i=HistoryDealsTotal()-1; i>=0; i--) { 
      ulong t = HistoryDealGetTicket(i); if(HistoryDealGetInteger(t, DEAL_MAGIC) == InpMagicNumber && HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_OUT) p += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_SWAP); 
   }
   return p; 
}

double GetDailyWinRate() {
   int total = 0, win = 0; HistorySelect(iTime(_Symbol, PERIOD_D1, 0), TimeCurrent()); 
   for(int i=HistoryDealsTotal()-1; i>=0; i--) { 
      ulong t = HistoryDealGetTicket(i); if(HistoryDealGetInteger(t, DEAL_MAGIC) == InpMagicNumber && HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_OUT) { total++; if(HistoryDealGetDouble(t, DEAL_PROFIT) > 0) win++; }
   }
   return (total > 0) ? NormalizeDouble(((double)win/(double)total)*100.0, 1) : 0.0; 
}

void CheckAccountAndMarket() {
   if(AccountInfoDouble(ACCOUNT_EQUITY) < InpMinEquity) { g_LowBalance = true; g_LastErrorMessage = "ALERT: Low Equity!"; } else g_LowBalance = false; 
   g_MarketClosed = (SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED); 
   if(g_MarketClosed) g_LastErrorMessage = "Market Closed";
}

void CheckSlippageAndProtection() {
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber) {
      if((posInfo.Profit() + posInfo.Swap() + posInfo.Commission()) <= -InpMaxRiskUSD) {
         trade.PositionClose(posInfo.Ticket()); 
         g_LastErrorMessage = "Protection: Max Risk Hit";
      }
   }
}

int GetActivePositionsCount() {
   int c=0; for(int i=PositionsTotal()-1; i>=0; i--) if(posInfo.SelectByIndex(i) && posInfo.Symbol()==_Symbol && posInfo.Magic()==InpMagicNumber) c++; return c; 
}

//+------------------------------------------------------------------+
//| Dashboard UI System - Updated v29.00                             |
//+------------------------------------------------------------------+
void OnTimer() { UpdateDashboard(); } 

void UpdateDashboard() {
   datetime cur = TimeCurrent(); double dPL = GetDailyRealizedProfit(), dWR = GetDailyWinRate(); 
   int aPos = GetActivePositionsCount();
   int currentSpread = (int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);

   UpdateLabel("ValTime", ": " + TimeToString(cur, TIME_SECONDS)); 
   UpdateLabel("ValActive", ": " + IntegerToString(aPos), (aPos > 0 ? InpPosColor : clrWhite)); 
   UpdateLabel("ValExp", ": " + TimeToString(EXPIRED_DATE, TIME_DATE)); 
   
   if(cur >= EXPIRED_DATE) { 
      g_IsSystemHalted = true; 
      g_LastErrorMessage = "EXPIRED: Update Required"; 
   } 
   
   color sCol = clrLime; string sTxt = ": OPERATIONAL"; 
   if(g_IsSystemHalted) { sCol = clrRed; sTxt = ": HALTED"; } 
   else if(g_DailyLimitHit) { sCol = clrOrange; sTxt = ": DAILY LIMIT"; } 
   else if(g_LowBalance) { sCol = clrRed; sTxt = ": LOW MARGIN"; } 
   else if(g_MarketClosed) { sCol = clrYellow; sTxt = ": CLOSED"; } 
   
   UpdateLabel("ValStat", sTxt, sCol); 
   UpdateLabel("ValErr", ": " + g_LastErrorMessage, (g_LastErrorMessage == "System Ready" ? clrGray : InpMainColor)); 
   UpdateLabel("ValDaily", ": " + DoubleToString(dPL, 2) + " USD", (dPL >= 0 ? clrLime : clrRed)); 
   UpdateLabel("ValWR", ": " + DoubleToString(dWR, 1) + " %", (dWR >= 50.0 ? clrLime : clrYellow)); 
   UpdateLabel("ValBal", ": " + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)); 
   UpdateLabel("ValEqt", ": " + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)); 

   UpdateLabel("ValTargetP", ": " + DoubleToString(InpDailyTargetUSD, 2) + " USD", clrLime); 
   UpdateLabel("ValTargetL", ": " + DoubleToString(InpDailyLossUSD, 2) + " USD", clrRed); 
   UpdateLabel("ValSpread", ": " + IntegerToString(currentSpread), (currentSpread <= InpMaxSpread ? clrAqua : clrRed)); 

   double tPL = 0; 
   for(int i = PositionsTotal()-1; i >= 0; i--) if(posInfo.SelectByIndex(i) && posInfo.Magic() == InpMagicNumber) tPL += posInfo.Profit() + posInfo.Swap() + posInfo.Commission(); 
   UpdateLabel("ValPL", DoubleToString(tPL, 2) + " USD", (tPL >= 0 ? InpPosColor : InpNegColor)); 
}

void CreateLabel(string n, string t, int x, int y, color c, int s, string f="Arial") {
   if(ObjectFind(0, prefix+n) < 0) ObjectCreate(0, prefix+n, OBJ_LABEL, 0, 0, 0); 
   ObjectSetInteger(0, prefix+n, OBJPROP_XDISTANCE, x); ObjectSetInteger(0, prefix+n, OBJPROP_YDISTANCE, y); 
   ObjectSetInteger(0, prefix+n, OBJPROP_COLOR, c); ObjectSetInteger(0, prefix+n, OBJPROP_FONTSIZE, s); 
   ObjectSetString(0, prefix+n, OBJPROP_TEXT, t); ObjectSetString(0, prefix+n, OBJPROP_FONT, f); 
   ObjectSetInteger(0, prefix+n, OBJPROP_SELECTABLE, false); 
}

void UpdateLabel(string n, string t, color c = clrNONE) { if(ObjectFind(0, prefix+n) >= 0) { ObjectSetString(0, prefix+n, OBJPROP_TEXT, t); if(c != clrNONE) ObjectSetInteger(0, prefix+n, OBJPROP_COLOR, c); } }

void CreateDashboard() {
   int x=InpStartX, y=InpStartY, s=InpRowStep, col=InpColumnX; 
   CreateLabel("Title", " GOGOR V29.00  N", x, y, InpMainColor, 12, "Arial Black"); y+=40; 
   
   CreateLabel("CatHlt", "CORE MONITORING", x, y, InpMainColor, 9, "Arial Bold"); 
   CreateLabel("ValTime", ": 00:00:00", x+col, y+s, clrAqua, 10); CreateLabel("LblTime", "S Time", x, y+s, clrWhite, 10); 
   CreateLabel("ValStat", ": Active", x+col, y+(s*2), clrLime, 10); CreateLabel("LblStat", "Status", x, y+(s*2), clrWhite, 10); 
   CreateLabel("ValExp", ": 00.00.00", x+col, y+(s*3), clrYellow, 10); CreateLabel("LblExp", "Expiry", x, y+(s*3), clrWhite, 10); 
   CreateLabel("ValErr", ": System OK", x+col, y+(s*4), clrGray, 9); CreateLabel("LblErr", "Check", x, y+(s*4), clrWhite, 10); 
   CreateLabel("ValActive", ": 0", x+col, y+(s*5), clrYellow, 10); CreateLabel("LblActive", "P. aktif", x, y+(s*5), clrWhite, 10); 
   
   y+=(s*7); CreateLabel("Cat1", "ACCOUNT METRICS", x, y, InpMainColor, 9, "Arial Bold"); 
   CreateLabel("ValDaily", ": 0.00 USD", x+col, y+s, InpValColor, 10); CreateLabel("LblDaily", "Daily P/L", x, y+s, clrWhite, 10); 
   CreateLabel("ValWR", ": 0.0 %", x+col, y+(s*2), InpValColor, 10); CreateLabel("LblWR", "Win Rate", x, y+(s*2), clrWhite, 10); 
   CreateLabel("ValBal", ": 0.00", x+col, y+(s*3), InpValColor, 10); CreateLabel("LblBal", "Balance", x, y+(s*3), clrWhite, 10); 
   CreateLabel("ValEqt", ": 0.00", x+col, y+(s*4), InpValColor, 10); CreateLabel("LblEqt", "Equity", x, y+(s*4), clrWhite, 10); 
   
   y+=(s*6); CreateLabel("CatSig", "LIMITS & SPREAD", x, y, InpMainColor, 10, "Arial Bold"); 
   CreateLabel("ValTargetP", ": 0.00 USD", x+col, y+s, clrLime, 10); CreateLabel("LblTargetP", "T Prof", x, y+s, clrWhite, 10); 
   CreateLabel("ValTargetL", ": 0.00 USD", x+col, y+(s*2), clrRed, 10); CreateLabel("LblTargetL", "L Loss", x, y+(s*2), clrWhite, 10); 
   CreateLabel("ValSpread", ": 0", x+col, y+(s*3), clrAqua, 10); CreateLabel("LblSpread", "Spread", x, y+(s*3), clrWhite, 10); 
   
   y+=(s*5); CreateLabel("Cat2", "FLOATING P/L", x, y, InpMainColor, 10, "Arial Bold"); 
   CreateLabel("ValPL", "0.00 USD", x, y+s, clrWhite, 16, "Impact"); 
   
   if(ObjectFind(0, prefix+"BtnClose") < 0) { 
      ObjectCreate(0, prefix+"BtnClose", OBJ_BUTTON, 0, 0, 0); 
      ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_XDISTANCE, x); ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_YDISTANCE, y+(s*4));
      ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_XSIZE, 220); ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_YSIZE, 35);
      ObjectSetString(0, prefix+"BtnClose", OBJPROP_TEXT, "CLOSE ALL");
      ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_BGCOLOR, clrFireBrick); ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_COLOR, clrWhite);
   }
}

//+------------------------------------------------------------------+
//| OnChartEvent: Interaksi UI v29.00                                |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam) {
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == prefix+"BtnClose") { 
      g_LastErrorMessage = "Action: Force Closing All...";
      for(int i = PositionsTotal()-1; i >= 0; i--) {
         if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber) {
            trade.PositionClose(posInfo.Ticket()); 
         }
      }
      ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_STATE, false); 
      lastEntryZZTimeH = 0; lastEntryZZTimeL = 0; 
   }
}
