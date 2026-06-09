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
  const APP_PASSWORD = 'IFMSAFAPI123';
  const STORAGE_KEYS = {
    scriptUrl: 'eventcheck_script_url',
    eventName: 'eventcheck_event_name',
    recentCheckins: 'eventcheck_recent',
    participants: 'eventcheck_participants'
  };

  let state = {
    isAuthenticated: false,
    scriptUrl: 'demo',
    eventName: 'Evento de Demonstração 🎓',
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

  // Default Mock Participants for Demo Mode
  const MOCK_PARTICIPANTS = [
    { name: 'Alice Silva', email: 'alice@example.com', institution: 'IFMS', id: 'EVT-ALICE123', status: 'absent', checkinDate: '' },
    { name: 'Bruno Santos', email: 'bruno@example.com', institution: 'IFMS', id: 'EVT-BRUNO456', status: 'absent', checkinDate: '' },
    { name: 'Carla Souza', email: 'carla@example.com', institution: 'USP', id: 'EVT-CARLA789', status: 'present', checkinDate: '08/06/2026 21:00:00' },
    { name: 'Diego Lima', email: 'diego@example.com', institution: 'UNICAMP', id: 'EVT-DIEGO012', status: 'absent', checkinDate: '' },
    { name: 'Elisa Ferreira', email: 'elisa@example.com', institution: 'UFRJ', id: 'EVT-ELISA345', status: 'present', checkinDate: '08/06/2026 20:30:15' }
  ];

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
    loadingText: $('#loading-text')
  };

  // ============================================
  // INITIALIZATION
  // ============================================
  function init() {
    loadConfig();
    bindEvents();
    registerServiceWorker();

    // Handle Enter key on password input
    dom.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });

    // Focus password input
    setTimeout(() => dom.passwordInput.focus(), 500);
  }

  function loadConfig() {
    state.scriptUrl = localStorage.getItem(STORAGE_KEYS.scriptUrl) || 'demo';
    state.eventName = localStorage.getItem(STORAGE_KEYS.eventName) || (state.scriptUrl === 'demo' ? 'Evento de Demonstração 🎓' : 'Configurar Evento');
    state.recentCheckins = JSON.parse(localStorage.getItem(STORAGE_KEYS.recentCheckins) || '[]');
    
    // Load participants from storage
    state.participants = JSON.parse(localStorage.getItem(STORAGE_KEYS.participants) || '[]');

    // Initialize mock participants if in demo mode and list is empty
    if (state.scriptUrl === 'demo' && state.participants.length === 0) {
      state.participants = [...MOCK_PARTICIPANTS];
      localStorage.setItem(STORAGE_KEYS.participants, JSON.stringify(state.participants));
    }

    if (state.eventName) {
      dom.configEventName.value = state.eventName;
      dom.headerEventName.textContent = state.eventName;
    }
    
    // Show URL empty in config input if it is just the local 'demo' keyword
    if (state.scriptUrl) {
      dom.configScriptUrl.value = state.scriptUrl === 'demo' ? '' : state.scriptUrl;
    }
    
    updateConnectionStatus(state.scriptUrl !== 'demo');
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
      updateConnectionStatus(state.scriptUrl !== 'demo');
      refreshData();
      startAutoRefresh();

      if (state.scriptUrl === 'demo') {
        showToast('Modo de Demonstração ativado! 🎓', 'info');
      } else {
        showToast('Bem-vindo ao EventCheck! 🎓', 'success');
      }
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
  // API COMMUNICATION (WITH DEMO BACKEND SIMULATION)
  // ============================================
  async function apiGet(action) {
    if (!state.scriptUrl) {
      showToast('Configure a URL do Apps Script primeiro', 'warning');
      throw new Error('No script URL configured');
    }

    // Simulation for local Demo Mode
    if (state.scriptUrl === 'demo') {
      await new Promise(resolve => setTimeout(resolve, 300)); // Simulate response latency
      if (action === 'list' || action === 'stats') {
        return {
          status: 'success',
          participants: state.participants,
          stats: calculateStats(state.participants)
        };
      }
      return { status: 'error', message: 'Ação desconhecida: ' + action };
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

    // Simulation for local Demo Mode
    if (state.scriptUrl === 'demo') {
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate response latency
      const action = data.action || '';
      
      if (action === 'checkin') {
        const participantId = data.id.toString().trim();
        const index = state.participants.findIndex(p => p.id && p.id.toString().trim() === participantId);

        if (index > -1) {
          const p = state.participants[index];
          if (p.status === 'present') {
            return {
              status: 'already_checked_in',
              name: p.name,
              message: `Participante já registrado em ${p.checkinDate}`
            };
          }

          // Register presence locally
          const now = new Date();
          const formattedDate = now.toLocaleDateString('pt-BR') + ' ' + now.toLocaleTimeString('pt-BR');
          p.status = 'present';
          p.checkinDate = formattedDate;

          localStorage.setItem(STORAGE_KEYS.participants, JSON.stringify(state.participants));

          return {
            status: 'success',
            name: p.name,
            message: `Check-in registrado com sucesso às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          };
        }

        return {
          status: 'not_found',
          message: 'Participante não encontrado. ID: ' + participantId
        };
      }

      if (action === 'generate_ids') {
        let count = 0;
        state.participants.forEach(p => {
          if (!p.id) {
            p.id = 'EVT-' + Math.random().toString(36).substr(2, 8).toUpperCase();
            count++;
          }
        });
        if (count > 0) {
          localStorage.setItem(STORAGE_KEYS.participants, JSON.stringify(state.participants));
        }
        return {
          status: 'success',
          count: count,
          message: `${count} IDs gerados com sucesso`
        };
      }

      return { status: 'error', message: 'Ação desconhecida: ' + action };
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
        updateConnectionStatus(state.scriptUrl !== 'demo');
        updateRecentList();
        
        // Auto-refresh QR Cards if we are currently looking at the QR Codes tab
        const activeNav = $('.nav-item.active');
        if (activeNav && activeNav.dataset.section === 'qrcodes') {
          generateQRCards(state.participants);
        }

        if (state.scriptUrl !== 'demo' && !silent) {
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
  // BACKGROUND AUTO-REFRESH TIMER
  // ============================================
  function startAutoRefresh() {
    stopAutoRefresh();
    // Auto-refresh every 8 seconds to synchronize PCs and scanning phones in real-time
    autoRefreshInterval = setInterval(() => {
      // Only auto-sync if logged in, tab is visible, and camera isn't active
      if (state.isAuthenticated && !state.isScanning && document.visibilityState === 'visible') {
        refreshData(true); // Silent refresh
      }
    }, 8000);
  }

  function stopAutoRefresh() {
    if (autoRefreshInterval) {
      clearInterval(autoRefreshInterval);
      autoRefreshInterval = null;
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

      // Detect and list all available cameras
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          // Prioritize rear cameras to find the correct focus lenses
          const backCams = devices.filter(d => /back|rear|trás|environment/i.test(d.label));
          const frontCams = devices.filter(d => !/back|rear|trás|environment/i.test(d.label));
          state.cameras = [...backCams, ...frontCams];
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
        disableFlip: false
      };

      state.currentCameraIndex = 0;
      let started = false;

      // Try starting with the first prioritized camera
      if (state.cameras.length > 0) {
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

  // Tries multiple standard facingMode constraint strategies with high-definition resolution constraints
  async function _startCameraWithFallback(config) {
    // Strategy 1: HD resolution constraints on exact environment camera
    try {
      await state.scanner.start(
        { 
          facingMode: { exact: 'environment' },
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        },
        config, onScanSuccess, () => {}
      );
      return true;
    } catch (e1) {
      console.warn('Camera strategy 1 failed:', e1.message || e1);
    }

    // Strategy 2: HD resolution constraints on standard environment camera
    try {
      await state.scanner.start(
        { 
          facingMode: 'environment',
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 }
        },
        config, onScanSuccess, () => {}
      );
      return true;
    } catch (e2) {
      console.warn('Camera strategy 2 failed:', e2.message || e2);
    }

    // Strategy 3: Standard camera constraints (browser defaults)
    try {
      await state.scanner.start(
        { facingMode: 'environment' },
        config, onScanSuccess, () => {}
      );
      return true;
    } catch (e3) {
      console.warn('Camera strategy 3 failed:', e3.message || e3);
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
        disableFlip: false
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
          width: 140,
          height: 140,
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
        width: 250,
        height: 250,
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

  // Close QR code modal
  function closeModal() {
    dom.qrModal.classList.add('hidden');
  }

  function downloadModalQR() {
    const canvas = dom.modalQrContainer.querySelector('canvas');
    if (!canvas) {
      showToast('QR Code não disponível', 'error');
      return;
    }

    const name = dom.qrModal.dataset.participantName || 'qrcode';
    const link = document.createElement('a');
    link.download = `QR_${name.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('QR Code baixado com sucesso', 'success');
  }

  // ============================================
  // CONFIGURATION
  // ============================================
  function saveConfig() {
    const eventName = dom.configEventName.value.trim();
    const scriptUrl = dom.configScriptUrl.value.trim();

    // Revert to Demo Mode if user clears the URL input
    if (!scriptUrl) {
      state.eventName = eventName || 'Evento de Demonstração 🎓';
      state.scriptUrl = 'demo';
      localStorage.setItem(STORAGE_KEYS.eventName, state.eventName);
      localStorage.setItem(STORAGE_KEYS.scriptUrl, 'demo');
      
      // Reset local participants list to mock values
      state.participants = [...MOCK_PARTICIPANTS];
      localStorage.setItem(STORAGE_KEYS.participants, JSON.stringify(state.participants));
      state.recentCheckins = [];
      localStorage.setItem(STORAGE_KEYS.recentCheckins, JSON.stringify(state.recentCheckins));

      dom.headerEventName.textContent = state.eventName;
      updateConnectionStatus(false);
      
      showToast('Modo de Demonstração ativado! 🎓', 'info');
      refreshData();
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

    // Demo Mode is always successful
    if (state.scriptUrl === 'demo') {
      showToast('Conexão Simulada com Sucesso no Modo Demo! 🎓', 'success');
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

  // Update visual state connection indicator
  function updateConnectionStatus(connected) {
    if (state.scriptUrl === 'demo') {
      dom.statusDot.className = 'status-dot demo';
      dom.statusText.textContent = 'Modo Demo';
    } else {
      dom.statusDot.className = `status-dot${connected ? ' connected' : ''}`;
      dom.statusText.textContent = connected ? 'Conectado' : 'Desconectado';
    }
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
        showToast(result.message || 'Erro ao gerare IDs', 'error');
      }
    } catch (err) {
      showToast('Erro de conexão: ' + err.message, 'error');
    }

    dom.generateIdsBtn.disabled = false;
    dom.generateIdsBtn.textContent = '🔑 Gerar IDs para Participantes sem ID';
  }

  function clearLocalData() {
    if (confirm('Tem certeza que deseja limpar todos os dados locais? (Se estiver no modo demo, os dados originais serão recarregados)')) {
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
      
      // Reload config to restore demo mode state
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
