/**
 * EventCheck — Main Application Logic
 * Handles authentication, navigation, QR scanning, QR generation,
 * Google Sheets integration, and all UI interactions.
 */

(() => {
  'use strict';

  // ============================================
  // CONFIGURATION & STATE
  // ============================================
  const APP_VERSION = 'v1.3.3';
  const APP_PASSWORD = 'IFMSAFAPI123';
  const STORAGE_KEYS = {
    scriptUrl: 'eventcheck_script_url',
    eventName: 'eventcheck_event_name',
    recentCheckins: 'eventcheck_recent',
    participants: 'eventcheck_participants'
  };

  let state = {
    isAuthenticated: false,
    scriptUrl: '',
    eventName: '',
    participants: [],
    recentCheckins: [],
    scanner: null,
    isScanning: false,
    scanCooldown: false,
    resultTimeout: null,
    cameras: [],
    currentCameraIndex: 0
  };

  // Background sync interval
  let autoRefreshInterval = null;

  // ============================================
  // DOM ELEMENTS
  // ============================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Login
    loginScreen: $('#login-screen'),
    passwordInput: $('#password-input'),
    loginBtn: $('#login-btn'),
    loginError: $('#login-error'),

    // App
    app: $('#app'),
    headerEventName: $('#header-event-name'),
    statusDot: $('#status-dot'),
    statusText: $('#status-text'),
    refreshBtn: $('#refresh-btn'),
    logoutBtn: $('#logout-btn'),

    // Dashboard
    statTotal: $('#stat-total'),
    statPresent: $('#stat-present'),
    statAbsent: $('#stat-absent'),
    statPercentage: $('#stat-percentage'),
    recentList: $('#recent-list'),
    recentCount: $('#recent-count'),
    emptyRecent: $('#empty-recent'),

    // Scanner
    scannerViewport: $('#scanner-viewport'),
    scannerPlaceholder: $('#scanner-placeholder'),
    startScanBtn: $('#start-scan-btn'),
    switchCameraBtn: $('#switch-camera-btn'),
    stopScanBtn: $('#stop-scan-btn'),
    scanResult: $('#scan-result'),
    resultIcon: $('#result-icon'),
    resultName: $('#result-name'),
    resultMessage: $('#result-message'),
    qrFileInput: $('#qr-file-input'),

    // QR Codes
    loadQrBtn: $('#load-qr-btn'),
    printQrBtn: $('#print-qr-btn'),
    qrSearchInput: $('#qr-search-input'),
    qrGrid: $('#qr-grid'),
    emptyQr: $('#empty-qr'),

    // Config
    configEventName: $('#config-event-name'),
    configScriptUrl: $('#config-script-url'),
    saveConfigBtn: $('#save-config-btn'),
    testConnectionBtn: $('#test-connection-btn'),
    connectionStatus: $('#connection-status'),
    connectionIcon: $('#connection-icon'),
    connectionText: $('#connection-text'),
    generateIdsBtn: $('#generate-ids-btn'),
    clearDataBtn: $('#clear-data-btn'),

    // Navigation
    bottomNav: $('#bottom-nav'),
    navItems: $$('.nav-item'),
    sections: $$('.section'),

    // Modal
    qrModal: $('#qr-modal'),
    modalName: $('#modal-name'),
    modalEmail: $('#modal-email'),
    modalQrContainer: $('#modal-qr-container'),
    modalDownloadBtn: $('#modal-download-btn'),
    modalCloseBtn: $('#modal-close-btn'),

    // Toast
    toastContainer: $('#toast-container'),

    // Loading
    loadingOverlay: $('#loading-overlay'),
    loadingText: $('#loading-text'),
    appVersion: $('#app-version'),
    manualSearchInput: $('#manual-search-input'),
    manualSearchResults: $('#manual-search-results'),
    refreshTimer: $('#auto-refresh-timer')
  };

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    loadConfig();
    bindEvents();
    registerServiceWorker();

    // Set app version text
    if (dom.appVersion) {
      dom.appVersion.textContent = APP_VERSION;
    }

    // Handle Enter key on password input
    dom.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    // Focus password input
    setTimeout(() => dom.passwordInput.focus(), 500);
  }

  function loadConfig() {
    state.scriptUrl = localStorage.getItem(STORAGE_KEYS.scriptUrl) || '';
    state.eventName = localStorage.getItem(STORAGE_KEYS.eventName) || '';
    state.recentCheckins = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentCheckins) || '[]');
    state.participants = JSON.parse(localStorage.getItem(STORAGE_KEYS.participants) || '[]');

    if (state.eventName) {
      dom.configEventName.value = state.eventName;
      dom.headerEventName.textContent = state.eventName;
    } else {
      dom.headerEventName.textContent = 'Configurar Evento';
    }
    
    if (state.scriptUrl) {
      dom.configScriptUrl.value = state.scriptUrl;
    }
    
    updateConnectionStatus(state.scriptUrl !== '');
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('ServiceWorker registered'))
        .catch((err) => console.warn('SW registration failed:', err));
    }
  }

  // ============================================
  // EVENT BINDING
  // ============================================
  function bindEvents() {
    // Login
    dom.loginBtn.addEventListener('click', handleLogin);

    // Navigation
    dom.navItems.forEach(item => {
      item.addEventListener('click', () => navigateTo(item.dataset.section));
    });

    // Header actions
    dom.refreshBtn.addEventListener('click', () => refreshData(false));
    dom.logoutBtn.addEventListener('click', handleLogout);

    // Scanner
    dom.startScanBtn.addEventListener('click', startScanner);
    dom.switchCameraBtn.addEventListener('click', switchCamera);
    dom.stopScanBtn.addEventListener('click', stopScanner);
    dom.qrFileInput.addEventListener('change', handleFileUpload);
    if (dom.manualSearchInput) {
      dom.manualSearchInput.addEventListener('input', handleManualSearch);
    }

    // QR Codes
    dom.loadQrBtn.addEventListener('click', loadAndGenerateQRCodes);
    dom.printQrBtn.addEventListener('click', () => window.print());
    dom.qrSearchInput.addEventListener('input', filterQRCodes);

    // Config
    dom.saveConfigBtn.addEventListener('click', saveConfig);
    dom.testConnectionBtn.addEventListener('click', testConnection);
    dom.generateIdsBtn.addEventListener('click', generateIds);
    dom.clearDataBtn.addEventListener('click', clearLocalData);

    // Modal
    dom.modalCloseBtn.addEventListener('click', closeModal);
    dom.modalDownloadBtn.addEventListener('click', downloadModalQR);
    dom.qrModal.addEventListener('click', (e) => {
      if (e.target === dom.qrModal) closeModal();
    });
  }

  // ============================================
  // AUTHENTICATION
  // ============================================
  function handleLogin() {
    const password = dom.passwordInput.value.trim();

    if (password === APP_PASSWORD) {
      state.isAuthenticated = true;
      dom.loginScreen.classList.add('hidden');
      dom.app.classList.remove('hidden');
      dom.loginError.classList.remove('visible');

      // Refresh / Load data
      updateConnectionStatus(state.scriptUrl !== '');
      if (state.scriptUrl) {
        refreshData();
      }
      startAutoRefresh();

      showToast('Bem-vindo ao EventCheck! 🎓', 'success');
    } else {
      dom.loginError.classList.add('visible');
      dom.passwordInput.value = '';
      dom.passwordInput.focus();
      // Shake animation
      dom.loginError.style.animation = 'none';
      dom.loginError.offsetHeight; // Trigger reflow
      dom.loginError.style.animation = '';
    }
  }

  function handleLogout() {
    state.isAuthenticated = false;
    stopScanner();
    stopAutoRefresh();
    dom.app.classList.add('hidden');
    dom.loginScreen.classList.remove('hidden');
    dom.passwordInput.value = '';
    dom.passwordInput.focus();
  }

  // ============================================
  // NAVIGATION
  // ============================================
  function navigateTo(sectionName) {
    // Stop scanner when leaving scanner section
    if (state.isScanning && sectionName !== 'scanner') {
      stopScanner();
    }

    // Update nav items
    dom.navItems.forEach(item => {
      item.classList.toggle('active', item.dataset.section === sectionName);
    });

    // Update sections
    dom.sections.forEach(section => {
      const isTarget = section.id === `${sectionName}-section`;
      section.classList.toggle('active', isTarget);
      if (isTarget) {
        section.style.animation = 'none';
        section.offsetHeight;
        section.style.animation = '';
      }
    });

    // AUTO-LOAD QR CARDS ON TAB NAVIGATION
    if (sectionName === 'qrcodes' && state.participants.length > 0) {
      generateQRCards(state.participants);
    }
  }

  // Helper to calculate statistics
  function calculateStats(participants) {
    const total = participants.length;
    const present = participants.filter(p => p.status === 'present').length;
    const absent = total - present;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, percentage };
  }

  // ============================================
  // API COMMUNICATION
  // ============================================
  async function apiGet(action) {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      throw new Error('No script URL configured');
    }

    const url = `${state.scriptUrl}?action=${action}&password=${encodeURIComponent(APP_PASSWORD)}&t=${Date.now()}`;

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  async function apiPost(data) {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      throw new Error('No script URL configured');
    }

    const response = await fetch(state.scriptUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow',
      body: JSON.stringify({ ...data, password: APP_PASSWORD })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============================================
  // DATA REFRESH
  // ============================================
  async function refreshData(silent = false) {
    if (!state.scriptUrl) {
      if (!silent) showToast('Configure a URL do Apps Script nas configurações', 'warning');
      navigateTo('config');
      return;
    }

    try {
      if (!silent) {
        dom.refreshBtn.disabled = true;
        dom.refreshBtn.textContent = '⏳';
      }

      const data = await apiGet('list');

      if (data.status === 'success') {
        state.participants = data.participants || [];
        updateDashboard(data.stats);
        updateConnectionStatus(true);
        updateRecentList();
        
        // Auto-refresh QR Cards if we are currently looking at the QR Codes tab
        const activeNav = $('.nav-item.active');
        if (activeNav && activeNav.dataset.section === 'qrcodes') {
          generateQRCards(state.participants);
        }

        if (!silent) {
          showToast('Dados atualizados com sucesso', 'success');
        }
      } else if (data.status === 'unauthorized') {
        if (!silent) showToast('Senha do Apps Script incorreta', 'error');
        updateConnectionStatus(false);
      } else {
        if (!silent) showToast(data.message || 'Erro ao carregar dados', 'error');
      }
    } catch (err) {
      console.error('Refresh error:', err);
      if (!silent) showToast('Erro de conexão. Verifique a URL e a internet.', 'error');
      updateConnectionStatus(false);
    } finally {
      if (!silent) {
        dom.refreshBtn.disabled = false;
        dom.refreshBtn.textContent = '🔄';
      }
    }
  }

  // ============================================
  // DASHBOARD
  // ============================================
  function updateDashboard(stats) {
    if (!stats) return;

    animateNumber(dom.statTotal, stats.total);
    animateNumber(dom.statPresent, stats.present);
    animateNumber(dom.statAbsent, stats.absent);
    animateNumber(dom.statPercentage, stats.percentage, '%');
  }

  function animateNumber(element, target, suffix = '') {
    const current = parseInt(element.textContent) || 0;
    const diff = target - current;
    const duration = 600;
    const steps = 30;
    const stepValue = diff / steps;
    let step = 0;

    if (diff === 0) {
      element.textContent = target + suffix;
      return;
    }

    const interval = setInterval(() => {
      step++;
      if (step >= steps) {
        element.textContent = target + suffix;
        clearInterval(interval);
      } else {
        element.textContent = Math.round(current + stepValue * step) + suffix;
      }
    }, duration / steps);
  }

  function updateRecentList() {
    const presentParticipants = state.participants
      .filter(p => p.status === 'present' && p.checkinDate)
      .sort((a, b) => {
        return parseDate(b.checkinDate) - parseDate(a.checkinDate);
      })
      .slice(0, 20);

    if (presentParticipants.length === 0) {
      dom.emptyRecent.classList.remove('hidden');
      dom.recentCount.textContent = '0 hoje';
      const items = dom.recentList.querySelectorAll('.recent-item');
      items.forEach(item => item.remove());
      return;
    }

    dom.emptyRecent.classList.add('hidden');
    dom.recentCount.textContent = `${presentParticipants.length} registrados`;

    const items = dom.recentList.querySelectorAll('.recent-item');
    items.forEach(item => item.remove());

    presentParticipants.forEach((p, index) => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.style.animationDelay = `${index * 0.05}s`;
      item.innerHTML = `
        <div class="check-icon">✅</div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(p.name)}</div>
          <div class="item-time">${p.checkinDate || 'Horário não registrado'}</div>
        </div>
      `;
      dom.recentList.appendChild(item);
    });
  }

  function parseDate(dateStr) {
    if (!dateStr) return 0;
    const parts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2}):?(\d{2})?/);
    if (parts) {
      return new Date(parts[3], parts[2] - 1, parts[1], parts[4], parts[5], parts[6] || 0).getTime();
    }
    return 0;
  }

  // ============================================
  // BACKGROUND AUTO-REFRESH TIMER
  // ============================================
  let refreshTimerInterval = null;
  let secondsRemaining = 8;

  function startAutoRefresh() {
    stopAutoRefresh();
    secondsRemaining = 8;
    updateRefreshTimerUI();

    refreshTimerInterval = setInterval(() => {
      if (state.isAuthenticated && document.visibilityState === 'visible') {
        if (state.isScanning) {
          dom.refreshTimer.textContent = ' (Scanner ativo)';
          return;
        }

        secondsRemaining--;
        if (secondsRemaining <= 0) {
          dom.refreshTimer.textContent = ' (Sincronizando...)';
          refreshData(true);
          secondsRemaining = 8;
        } else {
          updateRefreshTimerUI();
        }
      } else {
        dom.refreshTimer.textContent = '';
      }
    }, 1000);
  }

  function stopAutoRefresh() {
    if (refreshTimerInterval) {
      clearInterval(refreshTimerInterval);
      refreshTimerInterval = null;
    }
    if (dom.refreshTimer) {
      dom.refreshTimer.textContent = '';
    }
  }

  function updateRefreshTimerUI() {
    if (dom.refreshTimer) {
      if (state.scriptUrl) {
        dom.refreshTimer.textContent = ` (Auto-sync em ${secondsRemaining}s)`;
      } else {
        dom.refreshTimer.textContent = '';
      }
    }
  }

  // ============================================
  // QR CODE SCANNER
  // ============================================
  async function startScanner() {
    try {
      dom.startScanBtn.classList.add('hidden');
      dom.stopScanBtn.classList.remove('hidden');
      dom.scannerPlaceholder.classList.add('hidden');
      dom.scannerViewport.classList.add('scanning');

      state.scanner = new Html5Qrcode('scanner-view');

      // Request permission silently beforehand to populate camera labels immediately
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.warn('Erro ao pré-solicitar câmera traseira, tentando padrão:', err);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (err2) {
          console.warn('Erro ao pré-solicitar câmera padrão:', err2);
        }
      }

      // Detect and list all available cameras (with a retry if labels are missing)
      let devices = [];
      let hasLabels = false;
      try {
        devices = await Html5Qrcode.getCameras();
        hasLabels = devices.some(d => d.label);
        
        if (!hasLabels && devices.length > 0) {
          console.log('Labels não encontradas de primeira. Aguardando 200ms para tentar novamente...');
          await new Promise(resolve => setTimeout(resolve, 200));
          devices = await Html5Qrcode.getCameras();
          hasLabels = devices.some(d => d.label);
        }

        if (devices && devices.length > 0) {
          let backCams = [];
          let frontCams = [];

          devices.forEach(d => {
            const label = (d.label || '').toLowerCase();
            const isFront = /front|user|frontal|selfie|face|interna|internal|webcam/i.test(label);
            const isBack = /back|rear|trás|traseira|environment/i.test(label);
            
            if (label) {
              if (isBack && !isFront) {
                backCams.push(d);
              } else if (isFront && !isBack) {
                frontCams.push(d);
              } else {
                // If it has a label but matches neither, treat as rear/back
                backCams.push(d);
              }
            } else {
              // No label (fallback should not happen after warmup, but keep for safety)
              backCams.push(d);
            }
          });

          // Use rear cameras if found, otherwise fall back to front cameras (like webcams)
          if (backCams.length > 0) {
            state.cameras = backCams;
          } else if (frontCams.length > 0) {
            state.cameras = frontCams;
          } else {
            state.cameras = devices;
          }
        } else {
          state.cameras = [];
        }
      } catch (camErr) {
        console.warn('Erro ao listar câmeras:', camErr);
        state.cameras = [];
      }

      // Show/hide camera toggle button
      if (state.cameras.length > 1) {
        dom.switchCameraBtn.classList.remove('hidden');
      } else {
        dom.switchCameraBtn.classList.add('hidden');
      }

      // Scanner configuration with a dynamic qrbox size (70% of video dimensions)
      const config = {
        fps: 15,
        qrbox: function(width, height) {
          const size = Math.min(width, height) * 0.70;
          return { width: Math.floor(size), height: Math.floor(size) };
        },
        disableFlip: true, // Desativa espelhamento para poupar CPU
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: false // Desativado para evitar travamento em Samsung
        }
      };

      state.currentCameraIndex = 0;
      let started = false;

      // Try starting with the first prioritized camera only if we have labels
      if (state.cameras.length > 0 && hasLabels) {
        try {
          await state.scanner.start(
            state.cameras[0].id,
            config,
            onScanSuccess,
            () => {}
          );
          started = true;
        } catch (e) {
          console.warn('Falha ao iniciar primeira câmera da lista. Tentando fallback...', e);
        }
      }

      // Fallback strategy if specific camera start failed
      if (!started) {
        started = await _startCameraWithFallback(config);
      }

      if (!started) throw new Error('Nenhuma câmera compatível encontrada.');

      state.isScanning = true;
      showToast('Scanner ativado. Aponte para um QR Code.', 'info');
    } catch (err) {
      console.error('Scanner error:', err);
      resetScannerUI();

      const msg = err.toString();
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        showToast('Permissão de câmera negada. Permita o acesso nas configurações do navegador.', 'error');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        showToast('Nenhuma câmera encontrada. Use a opção de enviar imagem.', 'error');
      } else {
        showToast('Erro ao iniciar câmera: ' + msg, 'error');
      }
    }
  }

  // Tries multiple standard facingMode constraint strategies with resolution constraints optimized for decoding speed
  async function _startCameraWithFallback(config) {
    // Strategy 1: Try starting using state.cameras list IDs sequentially
    if (state.cameras && state.cameras.length > 0) {
      for (let i = 0; i < state.cameras.length; i++) {
        try {
          console.log(`Fallback: tentando iniciar câmera ${i} (${state.cameras[i].label || 'sem label'}): ${state.cameras[i].id}`);
          await state.scanner.start(
            state.cameras[i].id,
            config,
            onScanSuccess,
            () => {}
          );
          state.currentCameraIndex = i;
          return true;
        } catch (err) {
          console.warn(`Falha ao iniciar câmera fallback ${i}:`, err.message || err);
        }
      }
    }

    // Strategy 2: Try standard environment facingMode
    try {
      await state.scanner.start(
        { facingMode: 'environment' },
        config, onScanSuccess, () => {}
      );
      return true;
    } catch (e2) {
      console.warn('Camera strategy facingMode: environment failed:', e2.message || e2);
    }

    // Strategy 3: Try user facingMode (only as absolute last resort, e.g. laptop webcam)
    try {
      await state.scanner.start(
        { facingMode: 'user' },
        config, onScanSuccess, () => {}
      );
      return true;
    } catch (e3) {
      console.warn('Camera strategy facingMode: user failed:', e3.message || e3);
    }

    return false;
  }

  // Toggle between all detected cameras
  async function switchCamera() {
    if (!state.scanner || !state.isScanning || state.cameras.length <= 1) return;

    dom.switchCameraBtn.disabled = true;
    const originalText = dom.switchCameraBtn.textContent;
    dom.switchCameraBtn.textContent = '🔄 Trocando...';

    try {
      await state.scanner.stop();

      state.currentCameraIndex = (state.currentCameraIndex + 1) % state.cameras.length;
      const nextCamera = state.cameras[state.currentCameraIndex];

      const config = {
        fps: 15,
        qrbox: function(width, height) {
          const size = Math.min(width, height) * 0.70;
          return { width: Math.floor(size), height: Math.floor(size) };
        },
        disableFlip: true, // Desativa espelhamento para poupar CPU
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: false // Desativado para evitar travamento em Samsung
        }
      };

      await state.scanner.start(
        nextCamera.id,
        config,
        onScanSuccess,
        () => {}
      );

      showToast(`Câmera alterada para: ${nextCamera.label || 'Câmera ' + (state.currentCameraIndex + 1)}`, 'info');
    } catch (err) {
      console.error('Erro ao alternar câmera:', err);
      showToast('Falha ao trocar de câmera. Tentando reiniciar...', 'error');
      await startScanner();
    } finally {
      dom.switchCameraBtn.disabled = false;
      dom.switchCameraBtn.textContent = originalText;
    }
  }

  async function stopScanner() {
    if (state.scanner && state.isScanning) {
      try {
        await state.scanner.stop();
        state.scanner.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
    state.isScanning = false;
    resetScannerUI();
  }

  function resetScannerUI() {
    dom.startScanBtn.classList.remove('hidden');
    dom.switchCameraBtn.classList.add('hidden');
    dom.stopScanBtn.classList.add('hidden');
    dom.scannerPlaceholder.classList.remove('hidden');
    dom.scannerViewport.classList.remove('scanning');
    state.isScanning = false;
  }

  async function onScanSuccess(decodedText) {
    if (state.scanCooldown) return;
    state.scanCooldown = true;

    if (navigator.vibrate) {
      navigator.vibrate(100);
    }

    playBeep(true);

    try {
      showScanResult('loading', '⏳', 'Verificando...', 'Consultando a planilha...');

      const result = await apiPost({
        action: 'checkin',
        id: decodedText.trim()
      });

      if (result.status === 'success') {
        showScanResult('success', '✅', result.name, result.message);
        addToRecentCheckins(result.name);
        playBeep(true);
      } else if (result.status === 'already_checked_in') {
        showScanResult('duplicate', '⚠️', result.name, result.message);
        playBeep(false);
      } else if (result.status === 'not_found') {
        showScanResult('error', '❌', 'Não encontrado', result.message);
        playBeep(false);
      } else if (result.status === 'unauthorized') {
        showScanResult('error', '🔒', 'Não autorizado', 'Senha do servidor incorreta');
        playBeep(false);
      } else {
        showScanResult('error', '❌', 'Erro', result.message || 'Erro desconhecido');
        playBeep(false);
      }
    } catch (err) {
      console.error('Checkin error:', err);
      showScanResult('error', '❌', 'Erro de conexão', 'Verifique a internet e a URL do script');
      playBeep(false);
    }

    setTimeout(() => {
      state.scanCooldown = false;
    }, 2500);
  }

  function showScanResult(type, icon, name, message) {
    dom.scanResult.className = `scan-result visible ${type}`;
    dom.resultIcon.textContent = icon;
    dom.resultName.textContent = name;
    dom.resultMessage.textContent = message;

    clearTimeout(state.resultTimeout);
    state.resultTimeout = setTimeout(() => {
      dom.scanResult.classList.remove('visible');
    }, 4000);
  }

  function addToRecentCheckins(name) {
    const checkin = {
      name: name,
      time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    state.recentCheckins.unshift(checkin);
    if (state.recentCheckins.length > 50) {
      state.recentCheckins = state.recentCheckins.slice(0, 50);
    }

    localStorage.setItem(STORAGE_KEYS.recentCheckins, JSON.stringify(state.recentCheckins));

    refreshData(true); // silent refresh to update dashboard values instantly
  }

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const result = await Html5Qrcode.scanFile(file, true);

      if (result) {
        await onScanSuccess(result);
      } else {
        showToast('QR Code não encontrado na imagem', 'error');
      }
    } catch (err) {
      console.error('File scan error:', err);
      showToast('Não foi possível ler o QR Code da imagem', 'error');
    }

    event.target.value = '';
  }

  // ============================================
  // QR CODE GENERATION
  // ============================================
  async function loadAndGenerateQRCodes() {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      navigateTo('config');
      return;
    }

    showLoading('Carregando participantes...');

    try {
      const data = await apiGet('list');

      if (data.status === 'success' && data.participants) {
        state.participants = data.participants;
        updateDashboard(data.stats);
        generateQRCards(data.participants);
        updateRecentList();
        showToast(`${data.participants.length} participantes carregados`, 'success');
      } else {
        showToast(data.message || 'Erro ao carregar', 'error');
      }
    } catch (err) {
      console.error('Load participants error:', err);
      showToast('Erro ao carregar participantes', 'error');
    }

    hideLoading();
  }

  function generateQRCards(participants) {
    dom.qrGrid.innerHTML = '';

    if (!participants || participants.length === 0) {
      dom.qrGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>Nenhum participante encontrado na planilha. Adicione participantes e tente novamente.</p>
        </div>
      `;
      return;
    }

    const participantsWithId = participants.filter(p => p.id);

    if (participantsWithId.length === 0) {
      dom.qrGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔑</div>
          <p>Participantes encontrados mas sem IDs. Vá em Configurações e clique em "Gerar IDs".</p>
        </div>
      `;
      return;
    }

    participantsWithId.forEach(participant => {
      const card = document.createElement('div');
      card.className = `qr-card${participant.status === 'present' ? ' checked-in' : ''}`;
      card.dataset.name = participant.name.toLowerCase();
      card.dataset.email = (participant.email || '').toLowerCase();
      card.dataset.id = participant.id;

      const qrDiv = document.createElement('div');
      qrDiv.className = 'qr-canvas-wrapper';
      card.appendChild(qrDiv);

      const nameEl = document.createElement('div');
      nameEl.className = 'qr-name';
      nameEl.textContent = participant.name;
      card.appendChild(nameEl);

      if (participant.email) {
        const emailEl = document.createElement('div');
        emailEl.className = 'qr-email';
        emailEl.textContent = participant.email;
        card.appendChild(emailEl);
      }

      try {
        new QRCode(qrDiv, {
          text: participant.id,
          width: 300,
          height: 300,
          colorDark: '#0a1628',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch (err) {
        console.warn('QR generation failed for:', participant.name, err);
        qrDiv.innerHTML = '<p style="padding: 20px; font-size: 0.75rem; color: var(--error);">Erro ao gerar QR</p>';
      }

      card.addEventListener('click', () => openQRModal(participant));

      dom.qrGrid.appendChild(card);
    });
  }

  // Filter QR Codes by search query
  function filterQRCodes() {
    const query = dom.qrSearchInput.value.toLowerCase().trim();
    const cards = dom.qrGrid.querySelectorAll('.qr-card');

    cards.forEach(card => {
      const name = card.dataset.name || '';
      const email = card.dataset.email || '';
      const matches = name.includes(query) || email.includes(query);
      card.style.display = matches ? '' : 'none';
    });
  }

  // Handle manual check-in search results
  function handleManualSearch() {
    if (!dom.manualSearchInput || !dom.manualSearchResults) return;
    
    const query = dom.manualSearchInput.value.toLowerCase().trim();
    if (!query) {
      dom.manualSearchResults.classList.add('hidden');
      dom.manualSearchResults.innerHTML = '';
      return;
    }

    // Filter participants locally
    const matches = state.participants.filter(p => 
      p.name.toLowerCase().includes(query) || 
      (p.email && p.email.toLowerCase().includes(query))
    ).slice(0, 15);

    if (matches.length === 0) {
      dom.manualSearchResults.innerHTML = '<div style="padding: 10px; text-align: center; font-size: 0.8rem; color: var(--text-secondary);">Nenhum participante encontrado</div>';
      dom.manualSearchResults.classList.remove('hidden');
      return;
    }

    dom.manualSearchResults.innerHTML = '';
    matches.forEach(p => {
      const item = document.createElement('div');
      item.className = 'manual-search-item';
      
      const statusText = p.status === 'present' ? 'Confirmado' : 'Registrar';
      const statusClass = p.status === 'present' ? 'present' : 'absent';
      
      item.innerHTML = `
        <div class="item-info">
          <span class="item-name">${escapeHtml(p.name)}</span>
          <span class="item-email">${escapeHtml(p.email || 'Sem e-mail')}</span>
        </div>
        <span class="item-status ${statusClass}">${statusText}</span>
      `;
      
      item.addEventListener('click', () => {
        if (p.status === 'present') {
          showToast(`${p.name} já tem presença confirmada.`, 'warning');
          return;
        }
        
        // Trigger check-in via normal scanSuccess method
        onScanSuccess(p.id);
        
        // Clear search input and results
        dom.manualSearchInput.value = '';
        dom.manualSearchResults.classList.add('hidden');
        dom.manualSearchResults.innerHTML = '';
      });
      
      dom.manualSearchResults.appendChild(item);
    });
    
    dom.manualSearchResults.classList.remove('hidden');
  }

  // ============================================
  // QR MODAL
  // ============================================
  function openQRModal(participant) {
    dom.modalName.textContent = participant.name;
    dom.modalEmail.textContent = participant.email || participant.institution || '';
    dom.modalQrContainer.innerHTML = '';

    try {
      new QRCode(dom.modalQrContainer, {
        text: participant.id,
        width: 600,
        height: 600,
        colorDark: '#0a1628',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (err) {
      dom.modalQrContainer.innerHTML = '<p style="color: var(--error);">Erro ao gerar QR Code</p>';
    }

    dom.qrModal.dataset.participantName = participant.name;
    dom.qrModal.classList.remove('hidden');
  }

  function closeModal() {
    dom.qrModal.classList.add('hidden');
  }

  function downloadModalQR() {
    const originalCanvas = dom.modalQrContainer.querySelector('canvas');
    if (!originalCanvas) {
      showToast('QR Code não disponível', 'error');
      return;
    }

    const name = dom.qrModal.dataset.participantName || 'qrcode';
    const email = dom.modalEmail.textContent || '';
    
    // Original dimensions of the generated QR Code (ex: 600x600)
    const qrWidth = originalCanvas.width;
    const qrHeight = originalCanvas.height;

    // Define border margins and footer height dynamically
    const padding = Math.round(qrWidth * 0.08); // Contrast border (~8% of QR size, ex: 48px)
    const footerHeight = Math.round(qrWidth * 0.18); // Area height for participant info (ex: 108px)
    
    // Create high-resolution temporary canvas for drawing the download image
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = qrWidth + (padding * 2);
    exportCanvas.height = qrHeight + (padding * 2) + footerHeight;
    const ctx = exportCanvas.getContext('2d');

    // 1. Draw solid white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // 2. Draw the QR Code image on top, centered
    ctx.drawImage(originalCanvas, padding, padding, qrWidth, qrHeight);

    // 3. Draw participant identification text below the QR Code
    ctx.fillStyle = '#0a1628'; // Primary theme dark blue
    ctx.textAlign = 'center';
    
    // Participant Name (bold)
    const fontSizeName = Math.round(qrWidth * 0.045); // Font size proportional (ex: 27px)
    ctx.font = `bold ${fontSizeName}px Outfit, Inter, sans-serif`;
    const textY = qrHeight + padding + Math.round(footerHeight * 0.4);
    ctx.fillText(name, exportCanvas.width / 2, textY);

    // Participant Email/Institution (smaller text, secondary color)
    if (email) {
      const fontSizeEmail = Math.round(qrWidth * 0.032); // ex: 19px
      ctx.font = `${fontSizeEmail}px Outfit, Inter, sans-serif`;
      ctx.fillStyle = '#64748b'; // Gray text
      ctx.fillText(email, exportCanvas.width / 2, textY + Math.round(fontSizeName * 0.95));
    }

    // 4. Download processed image
    const link = document.createElement('a');
    link.download = `QR_${name.replace(/\s+/g, '_')}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();

    showToast('QR Code com identificação baixado!', 'success');
  }

  // ============================================
  // CONFIGURATION
  // ============================================
  function saveConfig() {
    const eventName = dom.configEventName.value.trim();
    const scriptUrl = dom.configScriptUrl.value.trim();

    if (!scriptUrl) {
      showToast('Preencha a URL do Google Apps Script', 'warning');
      return;
    }

    if (!scriptUrl.includes('script.google.com')) {
      showToast('URL inválida. Deve ser do Google Apps Script.', 'error');
      return;
    }

    state.eventName = eventName;
    state.scriptUrl = scriptUrl;

    localStorage.setItem(STORAGE_KEYS.eventName, eventName);
    localStorage.setItem(STORAGE_KEYS.scriptUrl, scriptUrl);

    dom.headerEventName.textContent = eventName || 'EventCheck';

    showToast('Configurações salvas com sucesso! ✅', 'success');
    refreshData();
  }

  async function testConnection() {
    if (!state.scriptUrl) {
      showToast('Salve a URL do script primeiro', 'warning');
      return;
    }

    dom.testConnectionBtn.disabled = true;
    dom.testConnectionBtn.innerHTML = '<span class="spinner"></span> Testando...';

    try {
      const data = await apiGet('stats');

      if (data.status === 'success') {
        dom.connectionStatus.classList.remove('hidden', 'fail');
        dom.connectionStatus.classList.add('ok');
        dom.connectionIcon.textContent = '✅';
        dom.connectionText.textContent = `Conectado! ${data.stats.total} participantes na planilha.`;
        updateConnectionStatus(true);
        updateDashboard(data.stats);
        showToast('Conexão bem-sucedida!', 'success');
      } else if (data.status === 'unauthorized') {
        dom.connectionStatus.classList.remove('hidden', 'ok');
        dom.connectionStatus.classList.add('fail');
        dom.connectionIcon.textContent = '🔒';
        dom.connectionText.textContent = 'Senha do Apps Script não confere.';
        updateConnectionStatus(false);
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      dom.connectionStatus.classList.remove('hidden', 'ok');
      dom.connectionStatus.classList.add('fail');
      dom.connectionIcon.textContent = '❌';
      dom.connectionText.textContent = 'Falha na conexão: ' + err.message;
      updateConnectionStatus(false);
    }

    dom.testConnectionBtn.disabled = false;
    dom.testConnectionBtn.textContent = '🔗 Testar Conexão';
  }

  function updateConnectionStatus(connected) {
    dom.statusDot.className = `status-dot${connected ? ' connected' : ''}`;
    dom.statusText.textContent = connected ? 'Conectado' : 'Desconectado';
  }

  async function generateIds() {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      return;
    }

    dom.generateIdsBtn.disabled = true;
    dom.generateIdsBtn.innerHTML = '<span class="spinner"></span> Gerando...';

    try {
      const result = await apiPost({ action: 'generate_ids' });

      if (result.status === 'success') {
        showToast(`${result.count} IDs gerados com sucesso! 🔑`, 'success');
        refreshData();
      } else {
        showToast(result.message || 'Erro ao gerar IDs', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão: ' + err.message, 'error');
    }

    dom.generateIdsBtn.disabled = false;
    dom.generateIdsBtn.textContent = '🔑 Gerar IDs para Participantes sem ID';
  }

  function clearLocalData() {
    if (confirm('Tem certeza que deseja limpar todos os dados locais? (As configurações serão mantidas)')) {
      state.recentCheckins = [];
      state.participants = [];
      localStorage.removeItem(STORAGE_KEYS.recentCheckins);
      localStorage.removeItem(STORAGE_KEYS.participants);

      dom.statTotal.textContent = '—';
      dom.statPresent.textContent = '—';
      dom.statAbsent.textContent = '—';
      dom.statPercentage.textContent = '—';
      updateRecentList();

      dom.qrGrid.innerHTML = `
        <div class="empty-state" id="empty-qr">
          <div class="empty-icon">📱</div>
          <p>Carregue os participantes da planilha para gerar os QR Codes.</p>
        </div>
      `;

      showToast('Dados locais limpos com sucesso', 'success');
      loadConfig();
      refreshData();
    }
  }

  // ============================================
  // AUDIO FEEDBACK
  // ============================================
  function playBeep(success) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (success) {
        oscillator.frequency.setValueAtTime(587, ctx.currentTime);
        oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.25);
      } else {
        oscillator.frequency.setValueAtTime(330, ctx.currentTime);
        oscillator.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.3);
      }
    } catch (err) {
      // Audio not supported
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      info: 'ℹ️',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    };

    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${escapeHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function showLoading(text = 'Carregando...') {
    dom.loadingText.textContent = text;
    dom.loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    dom.loadingOverlay.classList.add('hidden');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ============================================
  // LAUNCH
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
