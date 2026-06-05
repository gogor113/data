// ==================== BON WARUNG v36.0 - COMPLETE CLOUD BACKEND ====================
// Versi: 36.0 (Fully Compatible with BON_V36.html)
// Nama File: Code.gs
// Fitur: Auto Clean Lunas, Multi Device Sync, Enhanced Merge, Real-time Sync
// ==============================================================================

// ==================== KONFIGURASI SPREADSHEET ====================
const SPREADSHEET_ID = '1s9V_pY5FEp5NVaZoUSPViOT-XBiHnTMjdUQ9BS_xeK8/edit?gid=0#gid=0';

// Nama-nama sheet
const SHEET_USERS = 'Users_v36';
const SHEET_BONS = 'Bons_v36';
const SHEET_PAYMENTS = 'Payments_v36';
const SHEET_DRAWINGS = 'Drawings_v36';
const SHEET_AUDIT_LOG = 'AuditLog_v36';
const SHEET_BACKUP = 'Backup_v36';
const SHEET_SYNC_QUEUE = 'SyncQueue_v36';
const SHEET_CLEANUP_LOG = 'CleanupLog_v36';

// ==================== DO POST - MAIN ENTRY POINT ====================
function doPost(e) {
  const response = {
    success: false,
    message: '',
    data: null,
    timestamp: new Date().toISOString(),
    version: '36.0'
  };
  
  try {
    if (!e || !e.parameter) {
      response.message = 'No parameters provided';
      return sendJsonResponse(response, 400);
    }
    
    const action = e.parameter.action;
    const dataParam = e.parameter.data || '{}';
    
    Logger.log(`[v36.0] ${new Date().toISOString()} - Action: ${action}`);
    
    switch(action) {
      // ========== TEST CONNECTION ==========
      case 'testConnection':
        response.success = true;
        response.message = 'Cloud Backup v36.0 siap dan berfungsi!';
        response.data = { 
          serverTime: new Date().toISOString(),
          version: '36.0',
          features: ['AUTO_CLEAN_LUNAS', 'MULTI_DEVICE_SYNC', 'MERGE_V36', 'REAL_TIME_SYNC']
        };
        break;
      
      // ========== USER AUTHENTICATION v36.0 ==========
      case 'getUserAuth':
        const username = e.parameter.username;
        if (!username) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        const userData = getUserFromSheet(username);
        if (userData) {
          response.success = true;
          response.userData = userData;
        } else {
          response.success = false;
          response.message = 'User not found';
        }
        break;
        
      case 'syncUserAuth':
        const syncUserData = JSON.parse(dataParam);
        const targetUsername = syncUserData.username;
        const userInfo = syncUserData.userData;
        const deviceId = syncUserData.deviceId || '';
        
        if (!targetUsername || !userInfo) {
          response.message = 'Username and userData required';
          return sendJsonResponse(response, 400);
        }
        
        const saveResult = saveUserToSheet(targetUsername, userInfo, deviceId);
        if (saveResult) {
          response.success = true;
          response.message = 'User synced successfully';
          auditLog(targetUsername, 'USER_SYNC', 'User authentication synced v36.0', deviceId);
        } else {
          response.success = false;
          response.message = 'Failed to save user data';
        }
        break;
      
      // ========== VERSI 36.0 - RESTORE DATA ==========
      case 'restoreV36':
        const restoreUsername = e.parameter.username;
        
        if (!restoreUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        const userBons = getBonsFromSheet(restoreUsername);
        const userPayments = getPaymentsFromSheet(restoreUsername);
        const userDrawings = getAllDrawingsFromSheet(restoreUsername);
        
        // Filter hanya data yang belum dihapus
        const activeBons = userBons.filter(bon => !bon.isDeleted);
        const activePayments = userPayments.filter(payment => !payment.isDeleted);
        
        response.success = true;
        response.semuaBon = activeBons;
        response.pembayaran = activePayments;
        response.gambar = userDrawings;
        response.deletedBons = userBons.filter(bon => bon.isDeleted);
        response.deletedPayments = userPayments.filter(payment => payment.isDeleted);
        response.lastModified = new Date().toISOString();
        response.serverTimestamp = new Date().toISOString();
        response.version = '36.0';
        break;
      
      // ========== VERSI 36.0 - MERGE BACKUP (AUTO CLEAN LUNAS) ==========
      case 'mergeBackupV36':
        const backupData = JSON.parse(dataParam);
        const backupUsername = backupData.username;
        const deviceIdBackup = backupData.deviceId || '';
        
        if (!backupUsername) {
          response.message = 'Username required in backup data';
          return sendJsonResponse(response, 400);
        }
        
        // Ambil data existing dari sheet
        const existingBons = getBonsFromSheet(backupUsername);
        const existingPayments = getPaymentsFromSheet(backupUsername);
        
        // Data dari client
        const clientBons = backupData.semuaBon || [];
        const clientPayments = backupData.pembayaran || [];
        const clientDrawings = backupData.gambar || [];
        
        // Merge dengan timestamp
        let mergedBons = mergeDataWithTimestamp(existingBons, clientBons, 'uniqueId');
        let mergedPayments = mergeDataWithTimestamp(existingPayments, clientPayments, 'uniqueId');
        
        // ========== FITUR AUTO CLEAN LUNAS v36.0 ==========
        const cleanupResult = performAutoCleanup(mergedBons, mergedPayments);
        mergedBons = cleanupResult.cleanedBons;
        mergedPayments = cleanupResult.cleanedPayments;
        
        if (cleanupResult.cleanedCount > 0) {
          auditLog(backupUsername, 'AUTO_CLEAN_LUNAS', `Cleaned ${cleanupResult.cleanedCount} lunas customers`, deviceIdBackup);
          response.autoCleaned = cleanupResult.cleanedCount;
          response.cleanedCustomers = cleanupResult.cleanedCustomers;
        }
        
        // Simpan ke sheet
        const bonsSaved = saveBonsToSheet(backupUsername, mergedBons, deviceIdBackup);
        const paymentsSaved = savePaymentsToSheet(backupUsername, mergedPayments, deviceIdBackup);
        
        // Simpan drawings
        for (const drawing of clientDrawings) {
          saveDrawingToSheet(backupUsername, drawing.drawingId || generateUniqueId(), drawing.drawingData, deviceIdBackup);
        }
        
        if (bonsSaved && paymentsSaved) {
          response.success = true;
          response.message = 'Merge backup v36.0 successful';
          response.bonsCount = mergedBons.length;
          response.paymentsCount = mergedPayments.length;
          response.drawingsCount = clientDrawings.length;
          response.mergeTimestamp = new Date().toISOString();
          auditLog(backupUsername, 'MERGE_BACKUP_V36', `Merged ${mergedBons.length} bons, ${mergedPayments.length} payments`, deviceIdBackup);
        } else {
          response.success = false;
          response.message = 'Failed to save merged data';
        }
        break;
      
      // ========== SYNC QUEUE PROCESSING ==========
      case 'processSyncQueue':
        const queueUsername = e.parameter.username;
        const queueData = JSON.parse(dataParam);
        const syncItems = queueData.items || [];
        
        if (!queueUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        let processedCount = 0;
        for (const item of syncItems) {
          if (item.action === 'sync_all_local') {
            const success = awaitProcessSyncItem(queueUsername, item);
            if (success) processedCount++;
          }
        }
        
        response.success = true;
        response.processedCount = processedCount;
        response.message = `Processed ${processedCount} sync items`;
        break;
      
      // ========== SINGLE BON SYNC ==========
      case 'syncBonV36':
        const syncBonUsername = e.parameter.username;
        const syncBonData = JSON.parse(dataParam);
        
        if (!syncBonUsername || !syncBonData) {
          response.message = 'Username and bonData required';
          return sendJsonResponse(response, 400);
        }
        
        const bonSaved = saveSingleBonToSheet(syncBonUsername, syncBonData);
        if (bonSaved) {
          response.success = true;
          response.message = 'Bon synced successfully';
        } else {
          response.success = false;
          response.message = 'Failed to sync bon';
        }
        break;
      
      // ========== SINGLE PAYMENT SYNC ==========
      case 'syncPaymentV36':
        const syncPaymentUsername = e.parameter.username;
        const syncPaymentData = JSON.parse(dataParam);
        
        if (!syncPaymentUsername || !syncPaymentData) {
          response.message = 'Username and paymentData required';
          return sendJsonResponse(response, 400);
        }
        
        const paymentSaved = saveSinglePaymentToSheet(syncPaymentUsername, syncPaymentData);
        if (paymentSaved) {
          response.success = true;
          response.message = 'Payment synced successfully';
        } else {
          response.success = false;
          response.message = 'Failed to sync payment';
        }
        break;
      
      // ========== BON CRUD OPERATIONS ==========
      case 'createBon':
        const createBonUsername = e.parameter.username;
        const createBonData = JSON.parse(dataParam);
        
        if (!createBonUsername || !createBonData) {
          response.message = 'Username and bonData required';
          return sendJsonResponse(response, 400);
        }
        
        const newBon = {
          ...createBonData,
          uniqueId: generateUniqueId(),
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          isDeleted: false,
          deletedAt: null,
          syncVersion: '36.0'
        };
        
        const createdBon = saveSingleBonToSheet(createBonUsername, newBon);
        if (createdBon) {
          response.success = true;
          response.message = 'Bon created successfully';
          response.data = newBon;
          auditLog(createBonUsername, 'BON_CREATE', `Created bon: ${newBon.uniqueId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to create bon';
        }
        break;
        
      case 'readBons':
        const readBonUsername = e.parameter.username;
        const includeDeleted = e.parameter.includeDeleted === 'true';
        
        if (!readBonUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        let bons = getBonsFromSheet(readBonUsername);
        if (!includeDeleted) {
          bons = bons.filter(bon => !bon.isDeleted);
        }
        
        response.success = true;
        response.data = bons;
        response.count = bons.length;
        break;
        
      case 'updateBon':
        const updateBonUsername = e.parameter.username;
        const updateBonData = JSON.parse(dataParam);
        const bonId = updateBonData.uniqueId;
        
        if (!updateBonUsername || !bonId) {
          response.message = 'Username and bon uniqueId required';
          return sendJsonResponse(response, 400);
        }
        
        const updatedBon = updateBonInSheet(updateBonUsername, bonId, updateBonData);
        if (updatedBon) {
          response.success = true;
          response.message = 'Bon updated successfully';
          response.data = updatedBon;
          auditLog(updateBonUsername, 'BON_UPDATE', `Updated bon: ${bonId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to update bon or bon not found';
        }
        break;
        
      case 'deleteBon':
        const deleteBonUsername = e.parameter.username;
        const deleteBonId = e.parameter.bonId;
        const permanentDelete = e.parameter.permanent === 'true';
        
        if (!deleteBonUsername || !deleteBonId) {
          response.message = 'Username and bonId required';
          return sendJsonResponse(response, 400);
        }
        
        let deleteResult;
        if (permanentDelete) {
          deleteResult = permanentlyDeleteBon(deleteBonUsername, deleteBonId);
          response.message = 'Bon permanently deleted';
        } else {
          deleteResult = softDeleteBon(deleteBonUsername, deleteBonId);
          response.message = 'Bon soft deleted';
        }
        
        if (deleteResult) {
          response.success = true;
          auditLog(deleteBonUsername, 'BON_DELETE', `Deleted bon: ${deleteBonId}, permanent: ${permanentDelete}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to delete bon';
        }
        break;
        
      case 'restoreBon':
        const restoreBonUsername = e.parameter.username;
        const restoreBonId = e.parameter.bonId;
        
        if (!restoreBonUsername || !restoreBonId) {
          response.message = 'Username and bonId required';
          return sendJsonResponse(response, 400);
        }
        
        const restoredBon = restoreBonFromSheet(restoreBonUsername, restoreBonId);
        if (restoredBon) {
          response.success = true;
          response.message = 'Bon restored successfully';
          response.data = restoredBon;
          auditLog(restoreBonUsername, 'BON_RESTORE', `Restored bon: ${restoreBonId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to restore bon';
        }
        break;
      
      // ========== PAYMENT CRUD OPERATIONS ==========
      case 'createPayment':
        const createPaymentUsername = e.parameter.username;
        const createPaymentData = JSON.parse(dataParam);
        
        if (!createPaymentUsername || !createPaymentData) {
          response.message = 'Username and paymentData required';
          return sendJsonResponse(response, 400);
        }
        
        const newPayment = {
          ...createPaymentData,
          uniqueId: generateUniqueId(),
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          isDeleted: false,
          deletedAt: null,
          syncVersion: '36.0'
        };
        
        const createdPayment = saveSinglePaymentToSheet(createPaymentUsername, newPayment);
        if (createdPayment) {
          response.success = true;
          response.message = 'Payment created successfully';
          response.data = newPayment;
          auditLog(createPaymentUsername, 'PAYMENT_CREATE', `Created payment: ${newPayment.uniqueId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to create payment';
        }
        break;
        
      case 'readPayments':
        const readPaymentUsername = e.parameter.username;
        const includeDeletedPayments = e.parameter.includeDeleted === 'true';
        
        if (!readPaymentUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        let payments = getPaymentsFromSheet(readPaymentUsername);
        if (!includeDeletedPayments) {
          payments = payments.filter(payment => !payment.isDeleted);
        }
        
        response.success = true;
        response.data = payments;
        response.count = payments.length;
        break;
        
      case 'updatePayment':
        const updatePaymentUsername = e.parameter.username;
        const updatePaymentData = JSON.parse(dataParam);
        const paymentId = updatePaymentData.uniqueId;
        
        if (!updatePaymentUsername || !paymentId) {
          response.message = 'Username and payment uniqueId required';
          return sendJsonResponse(response, 400);
        }
        
        const updatedPayment = updatePaymentInSheet(updatePaymentUsername, paymentId, updatePaymentData);
        if (updatedPayment) {
          response.success = true;
          response.message = 'Payment updated successfully';
          response.data = updatedPayment;
          auditLog(updatePaymentUsername, 'PAYMENT_UPDATE', `Updated payment: ${paymentId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to update payment';
        }
        break;
        
      case 'deletePayment':
        const deletePaymentUsername = e.parameter.username;
        const deletePaymentId = e.parameter.paymentId;
        const permanentDeletePayment = e.parameter.permanent === 'true';
        
        if (!deletePaymentUsername || !deletePaymentId) {
          response.message = 'Username and paymentId required';
          return sendJsonResponse(response, 400);
        }
        
        let deletePaymentResult;
        if (permanentDeletePayment) {
          deletePaymentResult = permanentlyDeletePayment(deletePaymentUsername, deletePaymentId);
          response.message = 'Payment permanently deleted';
        } else {
          deletePaymentResult = softDeletePayment(deletePaymentUsername, deletePaymentId);
          response.message = 'Payment soft deleted';
        }
        
        if (deletePaymentResult) {
          response.success = true;
          auditLog(deletePaymentUsername, 'PAYMENT_DELETE', `Deleted payment: ${deletePaymentId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to delete payment';
        }
        break;
        
      case 'restorePayment':
        const restorePaymentUsername = e.parameter.username;
        const restorePaymentId = e.parameter.paymentId;
        
        if (!restorePaymentUsername || !restorePaymentId) {
          response.message = 'Username and paymentId required';
          return sendJsonResponse(response, 400);
        }
        
        const restoredPayment = restorePaymentFromSheet(restorePaymentUsername, restorePaymentId);
        if (restoredPayment) {
          response.success = true;
          response.message = 'Payment restored successfully';
          response.data = restoredPayment;
          auditLog(restorePaymentUsername, 'PAYMENT_RESTORE', `Restored payment: ${restorePaymentId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to restore payment';
        }
        break;
      
      // ========== DRAWING OPERATIONS ==========
      case 'saveDrawing':
        const drawingUsername = e.parameter.username;
        const drawingData = e.parameter.drawingData;
        const drawingId = e.parameter.drawingId || generateUniqueId();
        const drawingDeviceId = e.parameter.deviceId || '';
        
        if (!drawingUsername || !drawingData) {
          response.message = 'Username and drawingData required';
          return sendJsonResponse(response, 400);
        }
        
        const savedDrawing = saveDrawingToSheet(drawingUsername, drawingId, drawingData, drawingDeviceId);
        if (savedDrawing) {
          response.success = true;
          response.message = 'Drawing saved successfully';
          response.data = { drawingId: drawingId };
          auditLog(drawingUsername, 'DRAWING_SAVE', `Saved drawing: ${drawingId}`, drawingDeviceId);
        } else {
          response.success = false;
          response.message = 'Failed to save drawing';
        }
        break;
        
      case 'getDrawing':
        const getDrawingUsername = e.parameter.username;
        const getDrawingId = e.parameter.drawingId;
        
        if (!getDrawingUsername || !getDrawingId) {
          response.message = 'Username and drawingId required';
          return sendJsonResponse(response, 400);
        }
        
        const drawing = getDrawingFromSheet(getDrawingUsername, getDrawingId);
        if (drawing) {
          response.success = true;
          response.data = drawing;
        } else {
          response.success = false;
          response.message = 'Drawing not found';
        }
        break;
        
      case 'getAllDrawings':
        const allDrawingsUsername = e.parameter.username;
        
        if (!allDrawingsUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        const drawings = getAllDrawingsFromSheet(allDrawingsUsername);
        response.success = true;
        response.data = drawings;
        response.count = drawings.length;
        break;
        
      case 'deleteDrawing':
        const deleteDrawingUsername = e.parameter.username;
        const deleteDrawingId = e.parameter.drawingId;
        
        if (!deleteDrawingUsername || !deleteDrawingId) {
          response.message = 'Username and drawingId required';
          return sendJsonResponse(response, 400);
        }
        
        const drawingDeleted = deleteDrawingFromSheet(deleteDrawingUsername, deleteDrawingId);
        if (drawingDeleted) {
          response.success = true;
          response.message = 'Drawing deleted successfully';
          auditLog(deleteDrawingUsername, 'DRAWING_DELETE', `Deleted drawing: ${deleteDrawingId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to delete drawing';
        }
        break;
      
      // ========== SEARCH OPERATIONS ==========
      case 'searchBons':
        const searchBonUsername = e.parameter.username;
        const searchKeyword = e.parameter.keyword || '';
        const searchField = e.parameter.field || 'all';
        
        if (!searchBonUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        const allUserBons = getBonsFromSheet(searchBonUsername).filter(bon => !bon.isDeleted);
        const searchResults = searchBonsData(allUserBons, searchKeyword, searchField);
        
        response.success = true;
        response.data = searchResults;
        response.count = searchResults.length;
        response.keyword = searchKeyword;
        break;
      
      // ========== STATISTICS ==========
      case 'getStats':
        const statsUsername = e.parameter.username;
        
        if (!statsUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        const statsBons = getBonsFromSheet(statsUsername).filter(bon => !bon.isDeleted);
        const statsPayments = getPaymentsFromSheet(statsUsername).filter(payment => !payment.isDeleted);
        
        // Hitung total per pelanggan
        const pelangganMap = new Map();
        for (const bon of statsBons) {
          const key = bon.namaPelanggan.toLowerCase();
          if (!pelangganMap.has(key)) {
            pelangganMap.set(key, { nama: bon.namaPelanggan, totalUtang: 0, totalBayar: 0 });
          }
          pelangganMap.get(key).totalUtang += bon.total;
        }
        for (const payment of statsPayments) {
          const key = payment.namaPelanggan.toLowerCase();
          if (pelangganMap.has(key)) {
            pelangganMap.get(key).totalBayar += payment.jumlah;
          }
        }
        
        const activePelanggan = Array.from(pelangganMap.values()).filter(p => p.totalUtang - p.totalBayar > 0);
        
        response.success = true;
        response.data = {
          totalBon: statsBons.length,
          totalPayment: statsPayments.length,
          totalUtang: statsBons.reduce((sum, bon) => sum + (bon.total || 0), 0),
          totalBayar: statsPayments.reduce((sum, payment) => sum + (payment.jumlah || 0), 0),
          activePelanggan: activePelanggan.length,
          lastUpdated: new Date().toISOString(),
          version: '36.0'
        };
        break;
      
      // ========== BACKUP & RESTORE ==========
      case 'createBackup':
        const backupUserUsername = e.parameter.username;
        
        if (!backupUserUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        const backupId = createFullBackup(backupUserUsername);
        if (backupId) {
          response.success = true;
          response.message = 'Backup created successfully';
          response.data = { backupId: backupId };
          auditLog(backupUserUsername, 'BACKUP_CREATE', `Created backup: ${backupId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to create backup';
        }
        break;
        
      case 'restoreFromBackup':
        const restoreBackupUsername = e.parameter.username;
        const restoreBackupId = e.parameter.backupId;
        
        if (!restoreBackupUsername || !restoreBackupId) {
          response.message = 'Username and backupId required';
          return sendJsonResponse(response, 400);
        }
        
        const restoredFromBackup = restoreFromBackup(restoreBackupUsername, restoreBackupId);
        if (restoredFromBackup) {
          response.success = true;
          response.message = 'Data restored from backup successfully';
          auditLog(restoreBackupUsername, 'RESTORE_BACKUP', `Restored from backup: ${restoreBackupId}`, '');
        } else {
          response.success = false;
          response.message = 'Failed to restore from backup';
        }
        break;
      
      // ========== CLEANUP UTAMA (Auto Clean Lunas) ==========
      case 'triggerCleanup':
        const cleanupUsername = e.parameter.username;
        const cleanupDeviceId = e.parameter.deviceId || '';
        
        if (!cleanupUsername) {
          response.message = 'Username required';
          return sendJsonResponse(response, 400);
        }
        
        const currentBons = getBonsFromSheet(cleanupUsername);
        const currentPayments = getPaymentsFromSheet(cleanupUsername);
        const cleanupExecResult = performAutoCleanup(currentBons, currentPayments);
        
        if (cleanupExecResult.cleanedCount > 0) {
          saveBonsToSheet(cleanupUsername, cleanupExecResult.cleanedBons, cleanupDeviceId);
          savePaymentsToSheet(cleanupUsername, cleanupExecResult.cleanedPayments, cleanupDeviceId);
          response.success = true;
          response.cleanedCount = cleanupExecResult.cleanedCount;
          response.cleanedCustomers = cleanupExecResult.cleanedCustomers;
          response.message = `Cleaned ${cleanupExecResult.cleanedCount} lunas customers`;
          auditLog(cleanupUsername, 'MANUAL_CLEANUP', `Cleaned ${cleanupExecResult.cleanedCount} customers`, cleanupDeviceId);
        } else {
          response.success = true;
          response.cleanedCount = 0;
          response.message = 'No lunas customers to clean';
        }
        break;
        
      default:
        response.message = `Unknown action: ${action}`;
        return sendJsonResponse(response, 400);
    }
    
    return sendJsonResponse(response);
    
  } catch(error) {
    Logger.log(`[v36.0 Error] ${error.toString()}\n${error.stack}`);
    response.success = false;
    response.message = `Server error: ${error.toString()}`;
    response.errorStack = error.stack;
    return sendJsonResponse(response, 500);
  }
}

// ==================== DO GET ====================
function doGet() {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bon Warung Cloud Backup v36.0</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; }
        .container { max-width: 1200px; margin: auto; background: white; padding: 30px; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        h1 { color: #667eea; margin-bottom: 10px; }
        .version-badge { background: linear-gradient(135deg, #48bb78, #38a169); color: white; padding: 4px 12px; border-radius: 20px; font-size: 14px; display: inline-block; margin-left: 10px; }
        .status { color: #38a169; font-weight: bold; background: #c6f6d5; padding: 5px 10px; border-radius: 20px; display: inline-block; }
        .info { background: #ebf8ff; padding: 15px; border-radius: 10px; margin: 20px 0; }
        .feature-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 15px; margin: 20px 0; }
        .feature-card { background: #f7fafc; padding: 15px; border-radius: 10px; border-left: 4px solid #667eea; }
        .feature-card h4 { color: #2d3748; margin-bottom: 8px; }
        .feature-card p { color: #718096; font-size: 12px; }
        .badge { background: #e2e8f0; padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-left: 10px; }
        .feature-list { display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0; }
        .feature { background: #e6fffa; padding: 5px 12px; border-radius: 15px; font-size: 12px; color: #234e52; }
        .highlight { background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 15px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #f6ad55; }
        hr { margin: 20px 0; border-color: #e2e8f0; }
        .footer { text-align: center; margin-top: 20px; color: #718096; font-size: 12px; }
        code { background: #edf2f7; padding: 2px 6px; border-radius: 6px; font-family: monospace; font-size: 13px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>☁️ Bon Warung Cloud Backup <span class="version-badge">v36.0</span></h1>
        <p><span class="status">✅ ONLINE & SIAP</span> <span class="badge">Production Ready</span></p>
        <p>Server Time: ${new Date().toLocaleString('id-ID')}</p>
        
        <div class="highlight">
          <strong>🔄 FITUR UTAMA v36.0:</strong><br>
          ✨ <strong>Auto Clean Lunas</strong> - Pelanggan dengan utang lunas otomatis dihapus dari semua perangkat<br>
          ✨ <strong>Multi Device Sync</strong> - Sinkronisasi real-time antar semua perangkat<br>
          ✨ <strong>Enhanced Merge</strong> - Conflict resolution berdasarkan timestamp terbaru<br>
          ✨ <strong>Offline Support</strong> - Data tetap aman dan tersinkron saat online kembali
        </div>
        
        <div class="info">
          <strong>📊 Statistik Real-time:</strong><br>
          • Total Users: <span id="totalUsers">-</span><br>
          • Total Bons: <span id="totalBons">-</span><br>
          • Total Payments: <span id="totalPayments">-</span><br>
          • Server Version: <strong>36.0</strong>
        </div>
        
        <h3>✨ Fitur Lengkap v36.0:</h3>
        <div class="feature-list">
          <span class="feature">✅ Auto Clean Lunas</span>
          <span class="feature">✅ Multi Device Sync</span>
          <span class="feature">✅ Real-time Merge</span>
          <span class="feature">✅ Create Bon</span>
          <span class="feature">✅ Read Bons</span>
          <span class="feature">✅ Update Bon</span>
          <span class="feature">✅ Delete Bon</span>
          <span class="feature">✅ Restore Bon</span>
          <span class="feature">✅ Create Payment</span>
          <span class="feature">✅ Read Payments</span>
          <span class="feature">✅ Update Payment</span>
          <span class="feature">✅ Delete Payment</span>
          <span class="feature">✅ Restore Payment</span>
          <span class="feature">✅ Save Drawing</span>
          <span class="feature">✅ Search Data</span>
          <span class="feature">✅ Get Statistics</span>
          <span class="feature">✅ Create Backup</span>
          <span class="feature">✅ Restore Backup</span>
          <span class="feature">✅ Audit Log</span>
          <span class="feature">✅ Conflict Resolution</span>
        </div>
        
        <hr>
        
        <h3>📡 Available Actions (v36.0):</h3>
        <div class="feature-grid">
          <div class="feature-card"><h4>🔐 User Authentication</h4><p>getUserAuth, syncUserAuth</p></div>
          <div class="feature-card"><h4>📝 Bon CRUD</h4><p>createBon, readBons, updateBon, deleteBon, restoreBon, syncBonV36</p></div>
          <div class="feature-card"><h4>💰 Payment CRUD</h4><p>createPayment, readPayments, updatePayment, deletePayment, restorePayment, syncPaymentV36</p></div>
          <div class="feature-card"><h4>🔄 Merge & Sync v36</h4><p>restoreV36, mergeBackupV36, processSyncQueue</p></div>
          <div class="feature-card"><h4>🧹 Auto Cleanup</h4><p>triggerCleanup</p></div>
          <div class="feature-card"><h4>🎨 Drawing</h4><p>saveDrawing, getDrawing, getAllDrawings, deleteDrawing</p></div>
          <div class="feature-card"><h4>🔍 Search & Stats</h4><p>searchBons, getStats</p></div>
          <div class="feature-card"><h4>💾 Backup</h4><p>createBackup, restoreFromBackup</p></div>
          <div class="feature-card"><h4>🔧 Utility</h4><p>testConnection</p></div>
        </div>
        
        <hr>
        
        <h3>📖 Cara Deployment:</h3>
        <div class="info">
          <strong>📝 Langkah-langkah:</strong><br>
          1. Buka <code>https://script.google.com</code><br>
          2. Buat project baru atau buka project yang sudah ada<br>
          3. Copy semua kode ini ke editor Apps Script<br>
          4. Ganti <code>SPREADSHEET_ID</code> dengan ID spreadsheet Anda sendiri<br>
          5. Klik <strong>Deploy → New deployment</strong><br>
          6. Pilih type: <strong>Web app</strong><br>
          7. Execute as: <strong>Me</strong><br>
          8. Who has access: <strong>Anyone</strong><br>
          9. Klik <strong>Deploy</strong><br>
          10. Copy URL yang dihasilkan untuk digunakan di aplikasi<br><br>
          <strong>⚠️ Penting:</strong> Spreadsheet akan otomatis membuat sheet yang diperlukan saat pertama kali digunakan!
        </div>
        
        <div class="footer">
          Bon Warung v36.0 | Complete Cloud Backend | Auto Clean Lunas | Multi Device Sync
        </div>
      </div>
      
      <script>
        async function loadStats() {
          try {
            const response = await fetch(window.location.href, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: 'action=getSystemStats'
            });
            const data = await response.json();
            if (data.success) {
              document.getElementById('totalUsers').textContent = data.totalUsers || 0;
              document.getElementById('totalBons').textContent = data.totalBons || 0;
              document.getElementById('totalPayments').textContent = data.totalPayments || 0;
            }
          } catch(e) {
            console.log('Stats not available');
          }
        }
        loadStats();
      </script>
    </body>
    </html>
  `;
  return HtmlService.createHtmlOutput(html);
}

// ==================== SPREADSHEET UTILITIES ====================
function getOrCreateSheet(sheetName) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      Logger.log(`Created new sheet: ${sheetName}`);
    }
    return sheet;
  } catch(error) {
    Logger.log(`Error getting/creating sheet ${sheetName}: ${error.toString()}`);
    throw error;
  }
}

function ensureSheetHasHeaders(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  
  const range = sheet.getRange(1, 1, 1, headers.length);
  const currentHeaders = range.getValues()[0];
  
  let needsUpdate = false;
  for (let i = 0; i < headers.length; i++) {
    if (currentHeaders[i] !== headers[i]) {
      needsUpdate = true;
      break;
    }
  }
  
  if (needsUpdate) {
    range.setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

// ==================== USER MANAGEMENT v36.0 ====================
function getUserFromSheet(username) {
  try {
    const sheet = getOrCreateSheet(SHEET_USERS);
    const headers = ['username', 'userData', 'lastUpdated', 'deviceId', 'lastLogin', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower) {
        const userDataStr = data[i][1];
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          userData.lastSyncVersion = data[i][5] || '36.0';
          return userData;
        }
        return null;
      }
    }
    return null;
  } catch(error) {
    Logger.log(`getUserFromSheet error: ${error.toString()}`);
    return null;
  }
}

function saveUserToSheet(username, userData, deviceId) {
  try {
    const sheet = getOrCreateSheet(SHEET_USERS);
    const headers = ['username', 'userData', 'lastUpdated', 'deviceId', 'lastLogin', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    let rowToUpdate = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower) {
        rowToUpdate = i + 1;
        break;
      }
    }
    
    const now = new Date().toISOString();
    const userDataStr = JSON.stringify(userData);
    const lastLogin = userData.lastLogin || now;
    
    if (rowToUpdate !== -1) {
      sheet.getRange(rowToUpdate, 2, 1, 5).setValues([[userDataStr, now, deviceId, lastLogin, '36.0']]);
    } else {
      sheet.appendRow([usernameLower, userDataStr, now, deviceId, lastLogin, '36.0']);
    }
    
    return true;
  } catch(error) {
    Logger.log(`saveUserToSheet error: ${error.toString()}`);
    return false;
  }
}

// ==================== BONS MANAGEMENT v36.0 ====================
function getBonsFromSheet(username) {
  try {
    const sheet = getOrCreateSheet(SHEET_BONS);
    const headers = ['username', 'uniqueId', 'bonData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    const bons = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower) {
        const bonDataStr = data[i][2];
        if (bonDataStr) {
          try {
            const bon = JSON.parse(bonDataStr);
            bon.isDeleted = data[i][5] === true;
            bon.deletedAt = data[i][6];
            if (data[i][3]) bon.lastModified = data[i][3];
            if (data[i][7]) bon.syncVersion = data[i][7];
            bons.push(bon);
          } catch(e) {
            Logger.log(`Error parsing bon data: ${e.toString()}`);
          }
        }
      }
    }
    
    return bons;
  } catch(error) {
    Logger.log(`getBonsFromSheet error: ${error.toString()}`);
    return [];
  }
}

function saveBonsToSheet(username, bons, deviceId) {
  try {
    const sheet = getOrCreateSheet(SHEET_BONS);
    const headers = ['username', 'uniqueId', 'bonData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const usernameLower = username.toLowerCase();
    
    // Hapus semua data lama user
    const data = sheet.getDataRange().getValues();
    const rowsToDelete = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower) {
        rowsToDelete.push(i + 1);
      }
    }
    
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      sheet.deleteRow(rowsToDelete[i]);
    }
    
    // Simpan data baru
    for (const bon of bons) {
      const uniqueId = bon.uniqueId || generateUniqueId();
      const lastModified = bon.lastModified || new Date().toISOString();
      const isDeleted = bon.isDeleted || false;
      const deletedAt = bon.deletedAt || '';
      const bonToSave = { ...bon, uniqueId, lastModified };
      const bonDataStr = JSON.stringify(bonToSave);
      
      sheet.appendRow([usernameLower, uniqueId, bonDataStr, lastModified, deviceId || '', isDeleted, deletedAt, '36.0']);
    }
    
    return true;
  } catch(error) {
    Logger.log(`saveBonsToSheet error: ${error.toString()}`);
    return false;
  }
}

function saveSingleBonToSheet(username, bon) {
  try {
    const sheet = getOrCreateSheet(SHEET_BONS);
    const headers = ['username', 'uniqueId', 'bonData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const usernameLower = username.toLowerCase();
    const uniqueId = bon.uniqueId || generateUniqueId();
    const lastModified = bon.lastModified || new Date().toISOString();
    const deviceId = bon.deviceId || '';
    const isDeleted = bon.isDeleted || false;
    const deletedAt = bon.deletedAt || '';
    
    const data = sheet.getDataRange().getValues();
    let existingRow = -1;
    let existingLastModified = null;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === uniqueId) {
        existingRow = i + 1;
        existingLastModified = data[i][3];
        break;
      }
    }
    
    // Conflict resolution based on timestamp
    if (existingRow !== -1 && existingLastModified) {
      const existingTime = new Date(existingLastModified).getTime();
      const newTime = new Date(lastModified).getTime();
      if (newTime < existingTime) {
        return true; // Existing data is newer
      }
    }
    
    const bonToSave = { ...bon, uniqueId, lastModified };
    const bonDataStr = JSON.stringify(bonToSave);
    
    if (existingRow !== -1) {
      sheet.getRange(existingRow, 3, 1, 6).setValues([[bonDataStr, lastModified, deviceId, isDeleted, deletedAt, '36.0']]);
    } else {
      sheet.appendRow([usernameLower, uniqueId, bonDataStr, lastModified, deviceId, isDeleted, deletedAt, '36.0']);
    }
    
    return true;
  } catch(error) {
    Logger.log(`saveSingleBonToSheet error: ${error.toString()}`);
    return false;
  }
}

function updateBonInSheet(username, bonId, updatedData) {
  try {
    const sheet = getOrCreateSheet(SHEET_BONS);
    const headers = ['username', 'uniqueId', 'bonData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === bonId) {
        
        const existingBonData = JSON.parse(data[i][2]);
        const updatedBon = {
          ...existingBonData,
          ...updatedData,
          uniqueId: bonId,
          lastModified: new Date().toISOString()
        };
        
        const bonDataStr = JSON.stringify(updatedBon);
        const newLastModified = new Date().toISOString();
        const deviceId = updatedBon.deviceId || data[i][4] || '';
        const isDeleted = updatedBon.isDeleted !== undefined ? updatedBon.isDeleted : (data[i][5] || false);
        const deletedAt = updatedBon.deletedAt || data[i][6] || '';
        
        sheet.getRange(i + 1, 3, 1, 6).setValues([[bonDataStr, newLastModified, deviceId, isDeleted, deletedAt, '36.0']]);
        
        return updatedBon;
      }
    }
    
    return null;
  } catch(error) {
    Logger.log(`updateBonInSheet error: ${error.toString()}`);
    return null;
  }
}

function softDeleteBon(username, bonId) {
  try {
    const sheet = getOrCreateSheet(SHEET_BONS);
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === bonId) {
        
        sheet.getRange(i + 1, 6, 1, 2).setValues([[true, new Date().toISOString()]]);
        
        const bonData = JSON.parse(data[i][2]);
        bonData.isDeleted = true;
        bonData.deletedAt = new Date().toISOString();
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(bonData));
        
        return true;
      }
    }
    
    return false;
  } catch(error) {
    Logger.log(`softDeleteBon error: ${error.toString()}`);
    return false;
  }
}

function permanentlyDeleteBon(username, bonId) {
  try {
    const sheet = getOrCreateSheet(SHEET_BONS);
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === bonId) {
        sheet.deleteRow(i + 1);
        return true;
      }
    }
    
    return false;
  } catch(error) {
    Logger.log(`permanentlyDeleteBon error: ${error.toString()}`);
    return false;
  }
}

function restoreBonFromSheet(username, bonId) {
  try {
    const sheet = getOrCreateSheet(SHEET_BONS);
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === bonId) {
        
        sheet.getRange(i + 1, 6, 1, 2).setValues([[false, '']]);
        
        const bonData = JSON.parse(data[i][2]);
        bonData.isDeleted = false;
        bonData.deletedAt = null;
        bonData.lastModified = new Date().toISOString();
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(bonData));
        
        return bonData;
      }
    }
    
    return null;
  } catch(error) {
    Logger.log(`restoreBonFromSheet error: ${error.toString()}`);
    return null;
  }
}

// ==================== PAYMENTS MANAGEMENT v36.0 ====================
function getPaymentsFromSheet(username) {
  try {
    const sheet = getOrCreateSheet(SHEET_PAYMENTS);
    const headers = ['username', 'uniqueId', 'paymentData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    const payments = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower) {
        const paymentDataStr = data[i][2];
        if (paymentDataStr) {
          try {
            const payment = JSON.parse(paymentDataStr);
            payment.isDeleted = data[i][5] === true;
            payment.deletedAt = data[i][6];
            if (data[i][3]) payment.lastModified = data[i][3];
            if (data[i][7]) payment.syncVersion = data[i][7];
            payments.push(payment);
          } catch(e) {
            Logger.log(`Error parsing payment data: ${e.toString()}`);
          }
        }
      }
    }
    
    return payments;
  } catch(error) {
    Logger.log(`getPaymentsFromSheet error: ${error.toString()}`);
    return [];
  }
}

function savePaymentsToSheet(username, payments, deviceId) {
  try {
    const sheet = getOrCreateSheet(SHEET_PAYMENTS);
    const headers = ['username', 'uniqueId', 'paymentData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const usernameLower = username.toLowerCase();
    
    const data = sheet.getDataRange().getValues();
    const rowsToDelete = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower) {
        rowsToDelete.push(i + 1);
      }
    }
    
    for (let i = rowsToDelete.length - 1; i >= 0; i--) {
      sheet.deleteRow(rowsToDelete[i]);
    }
    
    for (const payment of payments) {
      const uniqueId = payment.uniqueId || generateUniqueId();
      const lastModified = payment.lastModified || new Date().toISOString();
      const isDeleted = payment.isDeleted || false;
      const deletedAt = payment.deletedAt || '';
      const paymentToSave = { ...payment, uniqueId, lastModified };
      const paymentDataStr = JSON.stringify(paymentToSave);
      
      sheet.appendRow([usernameLower, uniqueId, paymentDataStr, lastModified, deviceId || '', isDeleted, deletedAt, '36.0']);
    }
    
    return true;
  } catch(error) {
    Logger.log(`savePaymentsToSheet error: ${error.toString()}`);
    return false;
  }
}

function saveSinglePaymentToSheet(username, payment) {
  try {
    const sheet = getOrCreateSheet(SHEET_PAYMENTS);
    const headers = ['username', 'uniqueId', 'paymentData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const usernameLower = username.toLowerCase();
    const uniqueId = payment.uniqueId || generateUniqueId();
    const lastModified = payment.lastModified || new Date().toISOString();
    const deviceId = payment.deviceId || '';
    const isDeleted = payment.isDeleted || false;
    const deletedAt = payment.deletedAt || '';
    
    const data = sheet.getDataRange().getValues();
    let existingRow = -1;
    let existingLastModified = null;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === uniqueId) {
        existingRow = i + 1;
        existingLastModified = data[i][3];
        break;
      }
    }
    
    if (existingRow !== -1 && existingLastModified) {
      const existingTime = new Date(existingLastModified).getTime();
      const newTime = new Date(lastModified).getTime();
      if (newTime < existingTime) {
        return true;
      }
    }
    
    const paymentToSave = { ...payment, uniqueId, lastModified };
    const paymentDataStr = JSON.stringify(paymentToSave);
    
    if (existingRow !== -1) {
      sheet.getRange(existingRow, 3, 1, 6).setValues([[paymentDataStr, lastModified, deviceId, isDeleted, deletedAt, '36.0']]);
    } else {
      sheet.appendRow([usernameLower, uniqueId, paymentDataStr, lastModified, deviceId, isDeleted, deletedAt, '36.0']);
    }
    
    return true;
  } catch(error) {
    Logger.log(`saveSinglePaymentToSheet error: ${error.toString()}`);
    return false;
  }
}

function updatePaymentInSheet(username, paymentId, updatedData) {
  try {
    const sheet = getOrCreateSheet(SHEET_PAYMENTS);
    const headers = ['username', 'uniqueId', 'paymentData', 'lastModified', 'deviceId', 'isDeleted', 'deletedAt', 'syncVersion'];
    ensureSheetHasHeaders(sheet, headers);
    
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === paymentId) {
        
        const existingPaymentData = JSON.parse(data[i][2]);
        const updatedPayment = {
          ...existingPaymentData,
          ...updatedData,
          uniqueId: paymentId,
          lastModified: new Date().toISOString()
        };
        
        const paymentDataStr = JSON.stringify(updatedPayment);
        const newLastModified = new Date().toISOString();
        const deviceId = updatedPayment.deviceId || data[i][4] || '';
        const isDeleted = updatedPayment.isDeleted !== undefined ? updatedPayment.isDeleted : (data[i][5] || false);
        const deletedAt = updatedPayment.deletedAt || data[i][6] || '';
        
        sheet.getRange(i + 1, 3, 1, 6).setValues([[paymentDataStr, newLastModified, deviceId, isDeleted, deletedAt, '36.0']]);
        
        return updatedPayment;
      }
    }
    
    return null;
  } catch(error) {
    Logger.log(`updatePaymentInSheet error: ${error.toString()}`);
    return null;
  }
}

function softDeletePayment(username, paymentId) {
  try {
    const sheet = getOrCreateSheet(SHEET_PAYMENTS);
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === paymentId) {
        
        sheet.getRange(i + 1, 6, 1, 2).setValues([[true, new Date().toISOString()]]);
        
        const paymentData = JSON.parse(data[i][2]);
        paymentData.isDeleted = true;
        paymentData.deletedAt = new Date().toISOString();
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(paymentData));
        
        return true;
      }
    }
    
    return false;
  } catch(error) {
    Logger.log(`softDeletePayment error: ${error.toString()}`);
    return false;
  }
}

function permanentlyDeletePayment(username, paymentId) {
  try {
    const sheet = getOrCreateSheet(SHEET_PAYMENTS);
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === paymentId) {
        sheet.deleteRow(i + 1);
        return true;
      }
    }
    
    return false;
  } catch(error) {
    Logger.log(`permanentlyDeletePayment error: ${error.toString()}`);
    return false;
  }
}

function restorePaymentFromSheet(username, paymentId) {
  try {
    const sheet = getOrCreateSheet(SHEET_PAYMENTS);
    const usernameLower = username.toLowerCase();
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === paymentId) {
        
        sheet.getRange(i + 1, 6, 1, 2).setValues([[false, '']]);
        
        const paymentData = JSON.parse(data[i][2]);
        paymentData.isDeleted = false;
        paymentData.deletedAt = null;
        paymentData.lastModified = new Date().toISOString();
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(paymentData));
        
        return paymentData;
      }
    }
    
    return null;
  } catch(error) {
    Logger.log(`restorePaymentFromSheet error: ${error.toString()}`);
    return null;
  }
}

// ==================== DRAWING MANAGEMENT ====================
function saveDrawingToSheet(username, drawingId, drawingData, deviceId) {
  try {
    const sheet = getOrCreateSheet(SHEET_DRAWINGS);
    const headers = ['username', 'drawingId', 'drawingData', 'lastModified', 'deviceId'];
    ensureSheetHasHeaders(sheet, headers);
    
    const usernameLower = username.toLowerCase();
    const lastModified = new Date().toISOString();
    const data = sheet.getDataRange().getValues();
    let existingRow = -1;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === drawingId) {
        existingRow = i + 1;
        break;
      }
    }
    
    if (existingRow !== -1) {
      sheet.getRange(existingRow, 3, 1, 3).setValues([[drawingData, lastModified, deviceId || '']]);
    } else {
      sheet.appendRow([usernameLower, drawingId, drawingData, lastModified, deviceId || '']);
    }
    
    return true;
  } catch(error) {
    Logger.log(`saveDrawingToSheet error: ${error.toString()}`);
    return false;
  }
}

function getDrawingFromSheet(username, drawingId) {
  try {
    const sheet = getOrCreateSheet(SHEET_DRAWINGS);
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === drawingId) {
        return {
          drawingId: drawingId,
          drawingData: data[i][2],
          lastModified: data[i][3]
        };
      }
    }
    
    return null;
  } catch(error) {
    Logger.log(`getDrawingFromSheet error: ${error.toString()}`);
    return null;
  }
}

function getAllDrawingsFromSheet(username) {
  try {
    const sheet = getOrCreateSheet(SHEET_DRAWINGS);
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    const drawings = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower) {
        drawings.push({
          drawingId: data[i][1],
          drawingData: data[i][2],
          lastModified: data[i][3]
        });
      }
    }
    
    return drawings;
  } catch(error) {
    Logger.log(`getAllDrawingsFromSheet error: ${error.toString()}`);
    return [];
  }
}

function deleteDrawingFromSheet(username, drawingId) {
  try {
    const sheet = getOrCreateSheet(SHEET_DRAWINGS);
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().toLowerCase() === usernameLower &&
          data[i][1] && data[i][1].toString() === drawingId) {
        sheet.deleteRow(i + 1);
        return true;
      }
    }
    
    return false;
  } catch(error) {
    Logger.log(`deleteDrawingFromSheet error: ${error.toString()}`);
    return false;
  }
}

// ==================== AUTO CLEAN LUNAS v36.0 (FITUR UTAMA) ====================
function performAutoCleanup(bons, payments) {
  const pelangganMap = new Map();
  
  // Kumpulkan semua pelanggan dari bon
  for (const bon of bons) {
    const key = bon.namaPelanggan?.toLowerCase() || '';
    if (!key) continue;
    
    if (!pelangganMap.has(key)) {
      pelangganMap.set(key, {
        namaAsli: bon.namaPelanggan,
        totalUtang: 0,
        totalBayar: 0,
        hasActiveBon: true
      });
    }
    const data = pelangganMap.get(key);
    data.totalUtang += (bon.total || 0);
  }
  
  // Tambahkan pembayaran
  for (const payment of payments) {
    const key = payment.namaPelanggan?.toLowerCase() || '';
    if (!key) continue;
    
    if (!pelangganMap.has(key)) {
      pelangganMap.set(key, {
        namaAsli: payment.namaPelanggan,
        totalUtang: 0,
        totalBayar: 0,
        hasActiveBon: false
      });
    }
    const data = pelangganMap.get(key);
    data.totalBayar += (payment.jumlah || 0);
  }
  
  // Identifikasi pelanggan yang lunas (sisa <= 0)
  const customersToClean = [];
  for (const [key, data] of pelangganMap.entries()) {
    const sisa = data.totalUtang - data.totalBayar;
    // Lunas jika sisa <= 0 DAN ada utang sebelumnya ATAU hanya bayar tanpa bon
    if (sisa <= 0 && (data.totalUtang > 0 || !data.hasActiveBon)) {
      customersToClean.push(key);
    }
  }
  
  if (customersToClean.length === 0) {
    return { cleanedBons: bons, cleanedPayments: payments, cleanedCount: 0, cleanedCustomers: [] };
  }
  
  // Filter data yang tidak termasuk pelanggan lunas
  const cleanedBons = bons.filter(bon => {
    const key = bon.namaPelanggan?.toLowerCase() || '';
    return !customersToClean.includes(key);
  });
  
  const cleanedPayments = payments.filter(payment => {
    const key = payment.namaPelanggan?.toLowerCase() || '';
    return !customersToClean.includes(key);
  });
  
  // Catat ke log cleanup
  logCleanup(customersToClean, {
    bonsRemoved: bons.length - cleanedBons.length,
    paymentsRemoved: payments.length - cleanedPayments.length
  });
  
  return {
    cleanedBons: cleanedBons,
    cleanedPayments: cleanedPayments,
    cleanedCount: customersToClean.length,
    cleanedCustomers: customersToClean
  };
}

function logCleanup(cleanedCustomers, stats) {
  try {
    const sheet = getOrCreateSheet(SHEET_CLEANUP_LOG);
    const headers = ['timestamp', 'cleanedCustomers', 'bonsRemoved', 'paymentsRemoved', 'details'];
    ensureSheetHasHeaders(sheet, headers);
    
    sheet.appendRow([
      new Date().toISOString(),
      cleanedCustomers.join(', '),
      stats.bonsRemoved || 0,
      stats.paymentsRemoved || 0,
      `Auto cleanup v36.0 - ${cleanedCustomers.length} customers cleaned`
    ]);
  } catch(error) {
    Logger.log(`logCleanup error: ${error.toString()}`);
  }
}

// ==================== SEARCH FUNCTION ====================
function searchBonsData(bons, keyword, field) {
  if (!keyword || keyword.trim() === '') {
    return bons;
  }
  
  const lowerKeyword = keyword.toLowerCase();
  
  return bons.filter(bon => {
    if (field === 'all') {
      return (
        (bon.namaPelanggan && bon.namaPelanggan.toLowerCase().includes(lowerKeyword)) ||
        (bon.total && bon.total.toString().includes(lowerKeyword)) ||
        (bon.waktu && bon.waktu.toLowerCase().includes(lowerKeyword)) ||
        (bon.uniqueId && bon.uniqueId.includes(lowerKeyword))
      );
    } else if (field === 'nama') {
      return bon.namaPelanggan && bon.namaPelanggan.toLowerCase().includes(lowerKeyword);
    } else if (field === 'nominal') {
      return bon.total && bon.total.toString().includes(lowerKeyword);
    }
    return false;
  });
}

// ==================== BACKUP MANAGEMENT ====================
function createFullBackup(username) {
  try {
    const backupId = generateUniqueId();
    const sheet = getOrCreateSheet(SHEET_BACKUP);
    const headers = ['backupId', 'username', 'backupData', 'createdAt', 'version'];
    ensureSheetHasHeaders(sheet, headers);
    
    const bons = getBonsFromSheet(username);
    const payments = getPaymentsFromSheet(username);
    const drawings = getAllDrawingsFromSheet(username);
    
    const backupData = {
      username: username,
      bons: bons,
      payments: payments,
      drawings: drawings,
      createdAt: new Date().toISOString(),
      backupId: backupId,
      version: '36.0'
    };
    
    sheet.appendRow([backupId, username.toLowerCase(), JSON.stringify(backupData), new Date().toISOString(), '36.0']);
    
    return backupId;
  } catch(error) {
    Logger.log(`createFullBackup error: ${error.toString()}`);
    return null;
  }
}

function restoreFromBackup(username, backupId) {
  try {
    const sheet = getOrCreateSheet(SHEET_BACKUP);
    const data = sheet.getDataRange().getValues();
    const usernameLower = username.toLowerCase();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString() === backupId &&
          data[i][1] && data[i][1].toString().toLowerCase() === usernameLower) {
        
        const backupData = JSON.parse(data[i][2]);
        
        saveBonsToSheet(username, backupData.bons, '');
        savePaymentsToSheet(username, backupData.payments, '');
        
        for (const drawing of backupData.drawings) {
          saveDrawingToSheet(username, drawing.drawingId, drawing.drawingData, '');
        }
        
        // Cleanup after restore
        const currentBons = getBonsFromSheet(username);
        const currentPayments = getPaymentsFromSheet(username);
        const cleanupResult = performAutoCleanup(currentBons, currentPayments);
        if (cleanupResult.cleanedCount > 0) {
          saveBonsToSheet(username, cleanupResult.cleanedBons, '');
          savePaymentsToSheet(username, cleanupResult.cleanedPayments, '');
        }
        
        return true;
      }
    }
    
    return false;
  } catch(error) {
    Logger.log(`restoreFromBackup error: ${error.toString()}`);
    return false;
  }
}

// ==================== SYNC HELPERS ====================
async function awaitProcessSyncItem(username, item) {
  try {
    if (item.action === 'sync_all_local' && item.data) {
      const mergedResult = await processMergeBackup(username, item.data);
      return mergedResult;
    }
    return false;
  } catch(error) {
    Logger.log(`awaitProcessSyncItem error: ${error.toString()}`);
    return false;
  }
}

function processMergeBackup(username, backupData) {
  try {
    const existingBons = getBonsFromSheet(username);
    const existingPayments = getPaymentsFromSheet(username);
    
    const clientBons = backupData.semuaBon || [];
    const clientPayments = backupData.pembayaran || [];
    
    let mergedBons = mergeDataWithTimestamp(existingBons, clientBons, 'uniqueId');
    let mergedPayments = mergeDataWithTimestamp(existingPayments, clientPayments, 'uniqueId');
    
    const cleanupResult = performAutoCleanup(mergedBons, mergedPayments);
    mergedBons = cleanupResult.cleanedBons;
    mergedPayments = cleanupResult.cleanedPayments;
    
    const bonsSaved = saveBonsToSheet(username, mergedBons, backupData.deviceId || '');
    const paymentsSaved = savePaymentsToSheet(username, mergedPayments, backupData.deviceId || '');
    
    return bonsSaved && paymentsSaved;
  } catch(error) {
    Logger.log(`processMergeBackup error: ${error.toString()}`);
    return false;
  }
}

// ==================== MERGE & UTILITY FUNCTIONS ====================
function mergeDataWithTimestamp(existingData, newData, idField) {
  const mergedMap = new Map();
  
  for (const item of existingData) {
    const id = item[idField];
    if (id) {
      const timestamp = new Date(item.lastModified || 0).getTime();
      mergedMap.set(id, {
        data: item,
        timestamp: timestamp
      });
    }
  }
  
  for (const item of newData) {
    const id = item[idField];
    if (id) {
      const newTimestamp = new Date(item.lastModified || 0).getTime();
      const existing = mergedMap.get(id);
      
      if (!existing || newTimestamp > existing.timestamp) {
        mergedMap.set(id, {
          data: item,
          timestamp: newTimestamp
        });
      }
    }
  }
  
  return Array.from(mergedMap.values()).map(entry => entry.data);
}

function generateUniqueId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${Math.floor(Math.random() * 10000)}`;
}

function sendJsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  
  if (statusCode !== 200) {
    return output;
  }
  return output;
}

// ==================== AUDIT LOG ====================
function auditLog(username, action, details, deviceId) {
  try {
    const sheet = getOrCreateSheet(SHEET_AUDIT_LOG);
    const headers = ['timestamp', 'username', 'action', 'details', 'deviceId', 'version'];
    ensureSheetHasHeaders(sheet, headers);
    
    sheet.appendRow([new Date().toISOString(), username, action, details, deviceId || '', '36.0']);
  } catch(error) {
    Logger.log(`auditLog error: ${error.toString()}`);
  }
}

// ==================== SYSTEM STATS ====================
function getSystemStats() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const bonsSheet = ss.getSheetByName(SHEET_BONS);
    const paymentsSheet = ss.getSheetByName(SHEET_PAYMENTS);
    const usersSheet = ss.getSheetByName(SHEET_USERS);
    
    const totalBons = bonsSheet ? Math.max(0, bonsSheet.getLastRow() - 1) : 0;
    const totalPayments = paymentsSheet ? Math.max(0, paymentsSheet.getLastRow() - 1) : 0;
    const totalUsers = usersSheet ? Math.max(0, usersSheet.getLastRow() - 1) : 0;
    
    return {
      totalBons: totalBons,
      totalPayments: totalPayments,
      totalUsers: totalUsers
    };
  } catch(error) {
    return { totalBons: 0, totalPayments: 0, totalUsers: 0 };
  }
}
