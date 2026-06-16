//+------------------------------------------------------------------+
//|                                              SmartRiskManager.mq5|
//|                                  Copyright 2026, Gogor   v27.06  |
//|                                        Strategi Agresif Struktur |
//+------------------------------------------------------------------+
#property version   "27.06" // Perbaikan Bug: Undeclared identifier 'originalSL' pada sinkronisasi struktur
#property strict           
#property description "STRATEGI EMA+ RSI+STOC+ADX+ATR MULTI-ENTRY DENGAN KONFIRMASI CANDLE"
#property description "DILENGKAPI ANTI-FREEZE MEMORY & REAL-TIME SINKRONISASI"
#property description "KAMI TIDAK BERTANGGUNGJAWAB ATAS SEGALA KERUGIAN"
#property copyright "wa 081392656613"

//--- [Parameter Input Utama] ---
input double   InpRiskAmount     = 5.0;     // 1. Risiko per transaksi (USD)
input double   InpMaxRiskUSD     = 5.1;     // 2. Batas floating loss per tiket (Auto Cut)
input double   InpBufferPercent  = 20.0;    // 3. Margin pengaman SL dari ZigZag (%)
input double   InpRewardRatio    = 2.0;     // 4. Rasio RR (1:2)
input long     InpMagicNumber    = 130806;  // 5. Magic Number
input bool     InpAutoEntry      = true;    // 6. Full Otomatis
input int      InpMaxSpread      = 500;     // 7. Max Spread allowed
input int      InpMaxSlippageOut = 10;      // 8. Max Slippage

//--- [Target & Batas Harian] ---
input double   InpDailyTargetUSD = 1000.0;  // 9. Target Profit Harian
input double   InpDailyLossUSD   = 10000.0; // 10. Batas Loss Harian 
input double   InpMinEquity      = 10.0;    // 11. Minimal Equity Operasional

//--- [Parameter Indikator ZigZag] ---
input int      InpZZDepth        = 5;       // 12. ZZ Depth
input int      InpZZDev          = 5;       // 13. ZZ Deviation
input int      InpZZStep         = 2;       // 14. ZZ Step

//--- [Parameter Indikator Konfluensi] ---
input int      InpEMA_Period     = 50;      // 15. EMA Period (Trend Filter)
input int      InpRSI_Period     = 14;      // 16. RSI Period
input double   InpRSI_Upper      = 60.0;    // 17. RSI Upper Limit
input double   InpRSI_Lower      = 40.0;    // 18. RSI Lower Limit
input int      InpSto_K          = 5;       // 19. Sto K
input int      InpSto_D          = 3;       // 20. Sto D
input int      InpSto_Slow       = 3;       // 21. Sto Slowing
input int      InpADX_Period     = 10;      // 22. ADX Period
input double   InpADX_MinLevel   = 20.0;    // 23. ADX Min Strength
input int      InpATR_Period     = 14;      // 24. ATR Period

//--- [Pengaturan Visual Dashboard] ---
input int      InpStartX         = 20;      
input int      InpStartY         = 30;      
input int      InpRowStep        = 22;      
input int      InpColumnX        = 120;     
input color    InpMainColor      = clrYellow; 
input color    InpValColor       = clrAqua;   
input color    InpPosColor       = clrLime;    
input color    InpNegColor       = clrRed;     

#include <Trade\Trade.mqh>           
#include <Trade\PositionInfo.mqh>    

//--- Variabel Global ---
CTrade         trade;                
CPositionInfo  posInfo;              
string         prefix = "SRM_Pro_";  
datetime       EXPIRED_DATE = D'2026.12.31 23:59'; 
int            hEMA, hRSI, hSto, hZZ, hADX, hATR; 

datetime       lastZZTime = 0;       
double         lastZZPrice = 0;      
string         g_LastErrorMessage = "System Ready"; 
bool           g_IsSystemHalted   = false;      
bool           g_DailyLimitHit    = false;      
bool           g_MarketClosed     = false;      
bool           g_LowBalance       = false;      

//+------------------------------------------------------------------+
//| OnInit: Inisialisasi awal sistem                                 |
//+------------------------------------------------------------------+
int OnInit()
{
   trade.SetExpertMagicNumber(InpMagicNumber); // Set Magic Number untuk identifikasi transaksi
   trade.SetTypeFillingBySymbol(_Symbol);      // Set tipe filling sesuai simbol
   
   if(!InitializeHandles()) return(INIT_FAILED); // Inisialisasi indikator

   ObjectsDeleteAll(0, prefix); // Bersihkan dashboard lama
   CreateDashboard();           // Gambar dashboard baru
   EventSetTimer(1);            // Aktifkan timer update per detik
   return(INIT_SUCCEEDED);      
}

//+------------------------------------------------------------------+
//| InitializeHandles: Inisialisasi handle indikator                 |
//+------------------------------------------------------------------+
bool InitializeHandles()
{
   // Inisialisasi handle indikator standar MT5
   hEMA = iMA(_Symbol, _Period, InpEMA_Period, 0, MODE_EMA, PRICE_CLOSE); 
   hRSI = iRSI(_Symbol, _Period, InpRSI_Period, PRICE_CLOSE); 
   hSto = iStochastic(_Symbol, _Period, InpSto_K, InpSto_D, InpSto_Slow, MODE_SMA, STO_LOWHIGH); 
   hZZ  = iCustom(_Symbol, _Period, "Examples\\ZigZag", InpZZDepth, InpZZDev, InpZZStep); 
   hADX = iADX(_Symbol, _Period, InpADX_Period); 
   hATR = iATR(_Symbol, _Period, InpATR_Period); 

   // Validasi keberhasilan handle
   if(hEMA == INVALID_HANDLE || hRSI == INVALID_HANDLE || hSto == INVALID_HANDLE || 
      hZZ == INVALID_HANDLE || hADX == INVALID_HANDLE || hATR == INVALID_HANDLE) { 
      g_LastErrorMessage = "FATAL: Handle Error"; 
      return false; 
   }
   return true; 
}

//+------------------------------------------------------------------+
//| OnDeinit: Pembersihan sistem                                     |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer(); // Matikan timer
   // Lepas handle indikator untuk optimasi memori
   IndicatorRelease(hEMA); IndicatorRelease(hRSI); 
   IndicatorRelease(hSto); IndicatorRelease(hZZ); 
   IndicatorRelease(hADX); IndicatorRelease(hATR); 
   ObjectsDeleteAll(0, prefix); // Hapus objek visual
}

//+------------------------------------------------------------------+
//| OnTick: Eksekusi Market Utama                                    |
//+------------------------------------------------------------------+
void OnTick()
{
   if(g_IsSystemHalted) return; // Stop jika sistem expired atau error fatal
   
   // 1. Cek Target Harian (Realized Profit)
   double dailyProfit = GetDailyRealizedProfit(); 
   if(dailyProfit >= InpDailyTargetUSD || dailyProfit <= -InpDailyLossUSD) { 
      g_DailyLimitHit = true; 
      g_LastErrorMessage = (dailyProfit >= InpDailyTargetUSD) ? "Target Done" : "Loss Limit Hit"; 
   } else {
      g_DailyLimitHit = false; 
   }

   // 2. Proteksi & Sinkronisasi
   CheckAccountAndMarket();         // Validasi akun dan status market
   AntiManualOrderFilter();         // Hapus order manual (integritas magic number)
   CheckSlippageAndProtection();    // Proteksi floating loss per tiket
   AntiManualModificationSLTP();    // Paksa SL/TP sinkron dengan struktur ZigZag
   
   // 3. Logika Entry
   if(InpAutoEntry && !g_DailyLimitHit && !g_MarketClosed && !g_LowBalance) { 
      CheckAgresifZZEntry(); 
   }
   
   // 4. Update Visual Per Tick
   UpdateDashboard();
}

//+------------------------------------------------------------------+
//| CheckAgresifZZEntry: Logika Inti Entry Agresif                   |
//+------------------------------------------------------------------+
void CheckAgresifZZEntry()
{
   // Filter Spread
   if((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > InpMaxSpread) {
      g_LastErrorMessage = "Spread High";
      return;
   }

   double zzH, zzL; datetime timeH, timeL; 
   GetLatestZZData(zzH, zzL, timeH, timeL); // Ambil data struktur terakhir
   
   int signal = GetConfluenceSignal(); // Cek konfirmasi indikator
   if(signal == 0) return; 

   double currentZZPriceID = (signal == 1) ? zzL : zzH; 
   datetime currentZZTimeID = (signal == 1) ? timeL : timeH; 

   // Cek apakah ada struktur baru atau update harga struktur
   if(currentZZPriceID != lastZZPrice || currentZZTimeID != lastZZTime) 
   {
      // Pastikan tidak double entry di struktur yang sama
      if(IsStrukturSudahAdaPosisi(currentZZPriceID, currentZZTimeID)) return; 

      double sl, tp, entry, lot; 
      int dig = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS); 
      double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT); 
      double stopLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * point; 
      
      entry = (signal == 1) ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID); 
      
      // Kalkulasi SL/TP berdasarkan Buffer % dari Struktur
      if(signal == 1) { 
         double dist = entry - zzL; 
         sl = NormalizeDouble(zzL - (dist * (InpBufferPercent/100.0)), dig); 
         if(entry - sl < stopLevel) sl = NormalizeDouble(entry - stopLevel - (10 * point), dig); 
         tp = NormalizeDouble(entry + ((entry - sl) * InpRewardRatio), dig); 
      } else { 
         double dist = zzH - entry; 
         sl = NormalizeDouble(zzH + (dist * (InpBufferPercent/100.0)), dig); 
         if(sl - entry < stopLevel) sl = NormalizeDouble(entry + stopLevel + (10 * point), dig); 
         tp = NormalizeDouble(entry - ((sl - entry) * InpRewardRatio), dig); 
      }

      lot = CalculatePreciseLot(entry, sl); // Money Management Presisi

      if(lot >= SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN)) { 
         string comment = "ZZID:" + TimeToString(currentZZTimeID); 
         if(trade.PositionOpen(_Symbol, (signal==1?ORDER_TYPE_BUY:ORDER_TYPE_SELL), lot, entry, sl, tp, comment)) { 
            lastZZPrice = currentZZPriceID; 
            lastZZTime = currentZZTimeID; 
            g_LastErrorMessage = "Order Executed"; 
         }
      }
   }
}

//+------------------------------------------------------------------+
//| GetConfluenceSignal: Filter Konfirmasi Multi-Indikator           |
//+------------------------------------------------------------------+
int GetConfluenceSignal() {
   double bEMA[], bRSI[], bStoK[], bStoD[], bADX[]; 
   ArraySetAsSeries(bEMA, true); ArraySetAsSeries(bRSI, true);
   ArraySetAsSeries(bStoK, true); ArraySetAsSeries(bStoD, true); ArraySetAsSeries(bADX, true); 

   if(CopyBuffer(hEMA, 0, 1, 1, bEMA) <= 0 || CopyBuffer(hRSI, 0, 1, 1, bRSI) <= 0 || CopyBuffer(hADX, 0, 0, 1, bADX) <= 0) {
      ArrayFree(bEMA); ArrayFree(bRSI); ArrayFree(bStoK); ArrayFree(bStoD); ArrayFree(bADX);
      return 0;
   }
   CopyBuffer(hSto, 0, 1, 1, bStoK); CopyBuffer(hSto, 1, 1, 1, bStoD);
   
   // Filter Kekuatan Tren ADX
   if(bADX[0] < InpADX_MinLevel) { 
      ArrayFree(bEMA); ArrayFree(bRSI); ArrayFree(bStoK); ArrayFree(bStoD); ArrayFree(bADX);
      return 0;
   }
   
   double close1 = iClose(_Symbol, _Period, 1); 
   double open1  = iOpen(_Symbol, _Period, 1);  
   int sig = 0;
   
   // Logika Konfirmasi Candle + EMA + RSI + Stochastic
   if(close1 > bEMA[0] && bRSI[0] > InpRSI_Lower && bStoK[0] > bStoD[0] && close1 > open1) sig = 1;
   else if(close1 < bEMA[0] && bRSI[0] < InpRSI_Upper && bStoK[0] < bStoD[0] && close1 < open1) sig = -1;
   
   ArrayFree(bEMA); ArrayFree(bRSI); ArrayFree(bStoK); ArrayFree(bStoD); ArrayFree(bADX); 
   return sig;
}

//+------------------------------------------------------------------+
//| GetLatestZZData: Mencari Titik Struktur ZigZag Terbaru           |
//+------------------------------------------------------------------+
void GetLatestZZData(double &zzH, double &zzL, datetime &timeH, datetime &timeL) {
   double zzBuf[]; 
   ArraySetAsSeries(zzBuf, true); 
   zzH = 0; zzL = 0; 
   if(CopyBuffer(hZZ, 0, 0, 500, zzBuf) > 0) { 
      for(int i=1; i<500; i++) { 
         if(zzBuf[i] > 0 && zzBuf[i] < EMPTY_VALUE) { 
            // Cari High terakhir dan Low terakhir dari ZigZag
            if(zzH == 0 && zzBuf[i] >= iHigh(_Symbol, _Period, i)) { zzH = zzBuf[i]; timeH = iTime(_Symbol, _Period, i); } 
            if(zzL == 0 && zzBuf[i] <= iLow(_Symbol, _Period, i)) { zzL = zzBuf[i]; timeL = iTime(_Symbol, _Period, i); } 
         }
         if(zzH > 0 && zzL > 0) break; 
      }
   }
   ArrayFree(zzBuf); 
}

//+------------------------------------------------------------------+
//| AntiManualModificationSLTP: Sinkronisasi SL/TP ke ID Struktur    |
//+------------------------------------------------------------------+
void AntiManualModificationSLTP()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--) 
   {
      if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber)
      {
         ulong  ticket = posInfo.Ticket();
         double currentSL = posInfo.StopLoss();
         double currentTP = posInfo.TakeProfit();
         double entryPrice = posInfo.PriceOpen();
         ENUM_POSITION_TYPE type = (ENUM_POSITION_TYPE)posInfo.PositionType();
         
         string comment = posInfo.Comment(); 
         if(StringFind(comment, "ZZID:") < 0) continue; 
         
         string timeStr = StringSubstr(comment, 5);
         datetime zzTime = StringToTime(timeStr); 
         
         double zzPrice = 0; 
         double zzBuf[];
         ArraySetAsSeries(zzBuf, true); 
         if(CopyBuffer(hZZ, 0, 0, 500, zzBuf) > 0)
         {
            int shift = iBarShift(_Symbol, _Period, zzTime); 
            if(shift >= 0 && shift < 500) zzPrice = zzBuf[shift]; 
         }
         
         if(zzPrice <= 0 || zzPrice >= EMPTY_VALUE) { ArrayFree(zzBuf); continue; }

         double origSL = 0, origTP = 0;
         int dig = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
         double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
         double stopLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * point;

         if(type == POSITION_TYPE_BUY) {
            double dist = entryPrice - zzPrice;
            origSL = NormalizeDouble(zzPrice - (dist * (InpBufferPercent/100.0)), dig);
            if(entryPrice - origSL < stopLevel) origSL = NormalizeDouble(entryPrice - stopLevel - (10 * point), dig);
            // REVISI v27.06: Memperbaiki undeclared identifier 'originalSL' menjadi 'origSL'
            origTP = NormalizeDouble(entryPrice + ((entryPrice - origSL) * InpRewardRatio), dig);
         } else if(type == POSITION_TYPE_SELL) {
            double dist = zzPrice - entryPrice;
            origSL = NormalizeDouble(zzPrice + (dist * (InpBufferPercent/100.0)), dig);
            if(origSL - entryPrice < stopLevel) origSL = NormalizeDouble(entryPrice + stopLevel + (10 * point), dig);
            origTP = NormalizeDouble(entryPrice - ((origSL - entryPrice) * InpRewardRatio), dig);
         }

         // Sinkronisasi paksa jika ada perbedaan harga yang signifikan (lebih dari 1 point)
         if(MathAbs(currentSL - origSL) > point || MathAbs(currentTP - origTP) > point) {
            if(trade.PositionModify(ticket, origSL, origTP)) g_LastErrorMessage = "SL/TP Synced";
         }
         ArrayFree(zzBuf); 
      }
   }
}

//--- FUNGSI PENDUKUNG INTEGRITAS ---
void CheckAccountAndMarket() {
   if(AccountInfoDouble(ACCOUNT_EQUITY) < InpMinEquity) { g_LowBalance = true; g_LastErrorMessage = "Low Equity!"; } else g_LowBalance = false; 
   g_MarketClosed = (SymbolInfoInteger(_Symbol, SYMBOL_TRADE_MODE) == SYMBOL_TRADE_MODE_DISABLED); 
   if(g_MarketClosed) g_LastErrorMessage = "Market Closed";
}

void AntiManualOrderFilter() {
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() == 0) {
      if(trade.PositionClose(posInfo.Ticket())) g_LastErrorMessage = "Manual Order Purged"; 
   }
}

void CheckSlippageAndProtection() {
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber) {
      if((posInfo.Profit() + posInfo.Swap() + posInfo.Commission()) <= -InpMaxRiskUSD) {
         if(trade.PositionClose(posInfo.Ticket())) g_LastErrorMessage = "Auto Cut Ticket"; 
      }
   }
}

double CalculatePreciseLot(double entry, double sl) {
   double dist = MathAbs(entry - sl); if(dist < SymbolInfoDouble(_Symbol, SYMBOL_POINT)) return 0; 
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE); 
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE); 
   if(tickSize <= 0 || tickValue <= 0) return 0; 
   double lot = InpRiskAmount / ((dist / tickSize) * tickValue); 
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP); 
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN); 
   return NormalizeDouble(MathMax(MathFloor(lot/step)*step, minLot), 2); 
}

double GetDailyRealizedProfit() {
   double p = 0; HistorySelect(iTime(_Symbol, PERIOD_D1, 0), TimeCurrent()); 
   for(int i=HistoryDealsTotal()-1; i>=0; i--) {
      ulong t = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(t, DEAL_MAGIC) == InpMagicNumber && HistoryDealGetInteger(t, DEAL_ENTRY) == DEAL_ENTRY_OUT)
         p += HistoryDealGetDouble(t, DEAL_PROFIT) + HistoryDealGetDouble(t, DEAL_COMMISSION) + HistoryDealGetDouble(t, DEAL_SWAP); 
   }
   return p;
}

double CalculateDailyWinRate() {
   int t=0, w=0; HistorySelect(iTime(_Symbol, PERIOD_D1, 0), TimeCurrent());
   for(int i=HistoryDealsTotal()-1; i>=0; i--) {
      ulong tk = HistoryDealGetTicket(i);
      if(HistoryDealGetInteger(tk, DEAL_MAGIC) == InpMagicNumber && HistoryDealGetInteger(tk, DEAL_ENTRY) == DEAL_ENTRY_OUT) {
         t++; if(HistoryDealGetDouble(tk, DEAL_PROFIT) > 0) w++;
      }
   }
   return (t==0)?0:NormalizeDouble(((double)w/t)*100, 1); 
}

int GetActivePositionsCount() {
   int c=0; for(int i=PositionsTotal()-1; i>=0; i--) if(posInfo.SelectByIndex(i) && posInfo.Symbol()==_Symbol && posInfo.Magic()==InpMagicNumber) c++;
   return c; 
}

bool IsStrukturSudahAdaPosisi(double zzPrice, datetime zzTime) {
   string checkID = "ZZID:" + TimeToString(zzTime); 
   for(int i = PositionsTotal() - 1; i >= 0; i--) if(posInfo.SelectByIndex(i) && posInfo.Magic() == InpMagicNumber && posInfo.Comment() == checkID) return true; 
   return false; 
}

//--- MANAJEMEN DASHBOARD UI ---
void OnTimer() { UpdateDashboard(); } 

void UpdateDashboard()
{
   datetime currentTime = TimeCurrent(); 
   double dailyPL = GetDailyRealizedProfit(); 
   double dailyWin = CalculateDailyWinRate();
   int activePos = GetActivePositionsCount();
   int dig = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   UpdateLabel("ValTime", ": " + TimeToString(currentTime, TIME_SECONDS));
   UpdateLabel("ValActive", ": " + IntegerToString(activePos), (activePos > 0 ? InpPosColor : clrWhite));
   UpdateLabel("ValExp", ": " + TimeToString(EXPIRED_DATE, TIME_DATE));

   if(currentTime >= EXPIRED_DATE) { g_IsSystemHalted = true; g_LastErrorMessage = "EXPIRED SYSTEM"; } 
   
   color statColor = clrLime; string statusTxt = ": ACTIVE";
   if(g_IsSystemHalted) { statColor = clrRed; statusTxt = ": HALTED"; }
   else if(g_DailyLimitHit) { statColor = clrOrange; statusTxt = ": LIMIT REACHED"; }
   else if(g_LowBalance) { statColor = clrRed; statusTxt = ": LOW BALANCE"; }
   else if(g_MarketClosed) { statColor = clrYellow; statusTxt = ": MARKET CLOSED"; }

   UpdateLabel("ValStat", statusTxt, statColor);
   UpdateLabel("ValErr", ": " + g_LastErrorMessage, (g_LastErrorMessage == "System Ready" ? clrGray : InpMainColor));
   UpdateLabel("ValDaily", ": " + DoubleToString(dailyPL, 2) + " USD", (dailyPL >= 0 ? clrLime : clrRed));
   UpdateLabel("ValWin", ": " + DoubleToString(dailyWin, 1) + " %");
   UpdateLabel("ValBal", ": " + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2));
   UpdateLabel("ValEqt", ": " + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2));
   UpdateLabel("ValSpr", ": " + IntegerToString((int)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD)));

   double bEMA[], bRSI[], bStoK[], bStoD[], bADX[], bATR[];
   ArraySetAsSeries(bEMA, true); ArraySetAsSeries(bRSI, true); ArraySetAsSeries(bStoK, true);
   ArraySetAsSeries(bStoD, true); ArraySetAsSeries(bADX, true); ArraySetAsSeries(bATR, true);

   if(CopyBuffer(hEMA, 0, 0, 1, bEMA) > 0) UpdateLabel("ValEMA", (SymbolInfoDouble(_Symbol, SYMBOL_BID) > bEMA[0] ? ": BULLISH" : ": BEARISH"), (SymbolInfoDouble(_Symbol, SYMBOL_BID) > bEMA[0] ? InpPosColor : InpNegColor));
   if(CopyBuffer(hRSI, 0, 0, 1, bRSI) > 0) UpdateLabel("ValRSI", ": " + DoubleToString(bRSI[0], 2), (bRSI[0] >= 50 ? InpPosColor : InpNegColor));
   if(CopyBuffer(hSto, 0, 0, 1, bStoK) > 0 && CopyBuffer(hSto, 1, 0, 1, bStoD) > 0) UpdateLabel("ValSto", (bStoK[0] > bStoD[0] ? ": UP" : ": DOWN"), (bStoK[0] > bStoD[0] ? InpPosColor : InpNegColor));
   if(CopyBuffer(hADX, 0, 0, 1, bADX) > 0) UpdateLabel("ValADX", ": " + DoubleToString(bADX[0], 1), (bADX[0] >= InpADX_MinLevel ? InpPosColor : clrOrange));
   if(CopyBuffer(hATR, 0, 0, 1, bATR) > 0) UpdateLabel("ValATR", ": " + DoubleToString(bATR[0], dig));

   ArrayFree(bEMA); ArrayFree(bRSI); ArrayFree(bStoK); ArrayFree(bStoD); ArrayFree(bADX); ArrayFree(bATR); 

   double totalPL = 0; 
   for(int i = PositionsTotal()-1; i >= 0; i--) {
      if(posInfo.SelectByIndex(i) && posInfo.Symbol() == _Symbol && posInfo.Magic() == InpMagicNumber)
         totalPL += posInfo.Profit() + posInfo.Swap() + posInfo.Commission();
   }
   UpdateLabel("ValPL", DoubleToString(totalPL, 2) + " USD", (totalPL >= 0 ? InpPosColor : InpNegColor));
}

void CreateLabel(string name, string text, int x, int y, color col, int size, string font="Arial") {
   if(ObjectFind(0, prefix+name) < 0) ObjectCreate(0, prefix+name, OBJ_LABEL, 0, 0, 0); 
   ObjectSetInteger(0, prefix+name, OBJPROP_XDISTANCE, x); ObjectSetInteger(0, prefix+name, OBJPROP_YDISTANCE, y); 
   ObjectSetInteger(0, prefix+name, OBJPROP_COLOR, col); ObjectSetInteger(0, prefix+name, OBJPROP_FONTSIZE, size); 
   ObjectSetString(0, prefix+name, OBJPROP_TEXT, text); ObjectSetString(0, prefix+name, OBJPROP_FONT, font); 
}
void CreateLabel(string name, string text, color col, int x, int y, int size) { CreateLabel(name, text, x, y, col, size); }
void UpdateLabel(string name, string text, color col = clrNONE) { 
   if(ObjectFind(0, prefix+name) >= 0) {
      ObjectSetString(0, prefix+name, OBJPROP_TEXT, text); if(col != clrNONE) ObjectSetInteger(0, prefix+name, OBJPROP_COLOR, col); 
   }
}

void CreateDashboard() {
   int x=InpStartX, y=InpStartY, s=InpRowStep, col=InpColumnX;
   CreateLabel("Title", " GOGOR V27.06 ", x, y, InpMainColor, 12, "Arial Black"); y+=40;
   CreateLabel("CatHlt", "SYSTEM MONITORING", x, y, InpMainColor, 9, "Arial Bold");
   CreateLabel("ValTime", ": 00:00:00", x+col, y+s, clrAqua, 10); CreateLabel("LblTime", "Server", x, y+s, clrWhite, 10);
   CreateLabel("ValStat", ": Active", x+col, y+(s*2), clrLime, 10); CreateLabel("LblStat", "Status", x, y+(s*2), clrWhite, 10);
   CreateLabel("ValExp", ": 00.00.00", x+col, y+(s*3), clrYellow, 10); CreateLabel("LblExp", "Expired", x, y+(s*3), clrWhite, 10);
   CreateLabel("ValErr", ": System OK", x+col, y+(s*4), clrGray, 9); CreateLabel("LblErr", "Last Msg", x, y+(s*4), clrWhite, 10);
   CreateLabel("ValActive", ": 0", x+col, y+(s*5), clrYellow, 10); CreateLabel("LblActive", "Active", x, y+(s*5), clrWhite, 10);
   y+=(s*7); CreateLabel("Cat1", "ACCOUNT METRICS", x, y, InpMainColor, 9, "Arial Bold");
   CreateLabel("ValDaily", ": 0.00 USD", x+col, y+s, InpValColor, 10); CreateLabel("LblDaily", "Daily P/L", x, y+s, clrWhite, 10);
   CreateLabel("ValBal", ": 0.00", x+col, y+(s*2), InpValColor, 10); CreateLabel("LblBal", "Balance", x, y+(s*2), clrWhite, 10);
   CreateLabel("ValEqt", ": 0.00", x+col, y+(s*3), InpValColor, 10); CreateLabel("LblEqt", "Equity", x, y+(s*3), clrWhite, 10);
   CreateLabel("ValWin", ": 0.0 %", x+col, y+(s*4), clrYellow, 10); CreateLabel("LblWin", "WinRate", x, y+(s*4), clrWhite, 10);
   y+=(s*6); CreateLabel("CatSig", "SIGNAL STATUS", x, y, InpMainColor, 10, "Arial Bold");
   CreateLabel("ValEMA", ": Waiting...", x+col, y+s, InpValColor, 10); CreateLabel("LblEMA", "EMA", x, y+s, clrWhite, 10);
   CreateLabel("ValRSI", ": Waiting...", x+col, y+(s*2), InpValColor, 10); CreateLabel("LblRSI", "RSI", x, y+(s*2), clrWhite, 10);
   CreateLabel("ValSto", ": Waiting...", x+col, y+(s*3), InpValColor, 10); CreateLabel("LblSto", "Sto Cros", x, y+(s*3), clrWhite, 10);
   CreateLabel("ValADX", ": Waiting...", x+col, y+(s*4), InpValColor, 10); CreateLabel("LblADX", "Power", x, y+(s*4), clrWhite, 10);
   CreateLabel("ValATR", ": 0.00", x+col, y+(s*5), InpValColor, 10); CreateLabel("LblATR", "ATR", x, y+(s*5), clrWhite, 10);
   CreateLabel("ValSpr", ": 0", x+col, y+(s*6), InpValColor, 10); CreateLabel("LblSpr", "Spread", x, y+(s*6), clrWhite, 10);
   y+=(s*8); CreateLabel("Cat2", "PERFORMANCE", x, y, InpMainColor, 10, "Arial Bold");
   CreateLabel("ValPL", "0.00 USD", x, y+s, clrWhite, 16, "Impact");
   
   if(ObjectFind(0, prefix+"BtnClose") < 0) ObjectCreate(0, prefix+"BtnClose", OBJ_BUTTON, 0, 0, 0); 
   ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_XDISTANCE, x); ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_YDISTANCE, y+(s*4));
   ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_XSIZE, 220); ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_YSIZE, 35);
   ObjectSetString(0, prefix+"BtnClose", OBJPROP_TEXT, "CLOSE ALL");
   ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_BGCOLOR, clrFireBrick); ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_COLOR, clrWhite);
}

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam) {
   if(id == CHARTEVENT_OBJECT_CLICK && sparam == prefix+"BtnClose") {
      for(int i = PositionsTotal()-1; i >= 0; i--) if(posInfo.SelectByIndex(i) && posInfo.Magic() == InpMagicNumber) {
         trade.PositionClose(posInfo.Ticket());
      }
      ObjectSetInteger(0, prefix+"BtnClose", OBJPROP_STATE, false); 
   }
}
