/**
 * Painel IFMSA Brazil FAPI — Command Center V2.1
 * Arquitetura PWA integrada ao Google Sheets com suporte offline
 * + Camada de animações GSAP, partículas e confetti
 */

(function() {
  'use strict';

  // ============================================
  // CONSTANTES E CONFIGURAÇÕES
  // ============================================
  const APP_VERSION = 'v2.1.0';
  
  // Theatre.js variables
  let theatreProj = null;
  let theatreSheet = null;
  let headerActor = null;
  let cardsActor = null;
  
  const APP_PASSWORD = 'IFMSAFAPI123';
  const STORAGE_KEYS = {
    scriptUrl: 'eventcheck_script_url_v2',
    googleClientId: 'eventcheck_google_client_id_v2',
    activeEvent: 'eventcheck_active_event_v2',
    theme: 'eventcheck_theme_v2',
    offlineQueue: 'eventcheck_offline_queue_v2'
  };

  // ============================================
  // ESTADO DA APLICAÇÃO (STATE)
  // ============================================
  const state = {
    scriptUrl: '',
    googleClientId: '',
    googleToken: '',
    activeUser: null,
    isAuthorized: false,
    
    events: [],
    activeEvent: '',
    
    participants: [],
    recentCheckins: [],
    
    // Scanner
    scanner: null,
    cameras: [],
    currentCameraIndex: 0,
    isScanning: false,
    
    // Gráficos (Chart.js)
    charts: {
      presence: null,
      flow: null
    },
    
    // UI
    currentSection: 'dashboard',
    theme: 'dark'
  };

  // ============================================
  // SELETORES DOM
  // ============================================
  const dom = {
    // Telas
    loginScreen: document.getElementById('login-screen'),
    app: document.getElementById('app'),
    
    // Login
    passwordInput: document.getElementById('password-input'),
    loginBtn: document.getElementById('login-btn'),
    loginError: document.getElementById('login-error'),
    googleBtnContainer: document.getElementById('g-login-btn'),
    
    // Header
    eventSelect: document.getElementById('event-select'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    autoRefreshTimer: document.getElementById('auto-refresh-timer'),
    themeToggleBtn: document.getElementById('theme-toggle-btn'),
    profilePill: document.getElementById('profile-pill'),
    profileAvatar: document.getElementById('profile-avatar'),
    profileName: document.getElementById('profile-name'),
    refreshBtn: document.getElementById('refresh-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // Seções
    sections: document.querySelectorAll('.section'),
    navItems: document.querySelectorAll('.nav-item'),
    sidebarNavItems: document.querySelectorAll('.sidebar-nav-item'),
    
    // Métricas
    statTotal: document.getElementById('stat-total'),
    statPresent: document.getElementById('stat-present'),
    statAbsent: document.getElementById('stat-absent'),
    statPercentage: document.getElementById('stat-percentage'),
    recentList: document.getElementById('recent-list'),
    recentCount: document.getElementById('recent-count'),
    
    // Scanner
    scannerViewport: document.getElementById('scanner-viewport'),
    startScanBtn: document.getElementById('start-scan-btn'),
    stopScanBtn: document.getElementById('stop-scan-btn'),
    switchCameraBtn: document.getElementById('switch-camera-btn'),
    qrFileInput: document.getElementById('qr-file-input'),
    scanResult: document.getElementById('scan-result'),
    resultIcon: document.getElementById('result-icon'),
    resultName: document.getElementById('result-name'),
    resultMessage: document.getElementById('result-message'),
    scannerPlaceholder: document.getElementById('scanner-placeholder'),
    
    // Check-in Manual
    manualSearchInput: document.getElementById('manual-search-input'),
    manualSearchResults: document.getElementById('manual-search-results'),
    
    // Inscritos (QR Codes)
    qrGrid: document.getElementById('qr-grid'),
    qrSearchInput: document.getElementById('qr-search-input'),
    openAddModalBtn: document.getElementById('open-add-modal-btn'),
    sendEmailsBulkBtn: document.getElementById('send-emails-bulk-btn'),
    printQrBtn: document.getElementById('print-qr-btn'),
    
    // Ajustes / Configurações
    configScriptUrl: document.getElementById('config-script-url'),
    configGoogleClientId: document.getElementById('config-google-client-id'),
    newEventNameInput: document.getElementById('new-event-name-input'),
    createEventBtn: document.getElementById('create-event-btn'),
    saveConfigBtn: document.getElementById('save-config-btn'),
    testConnectionBtn: document.getElementById('test-connection-btn'),
    connectionStatus: document.getElementById('connection-status'),
    clearDataBtn: document.getElementById('clear-data-btn'),
    appVersion: document.getElementById('app-version'),
    
    // Modais
    qrModal: document.getElementById('qr-modal'),
    modalName: document.getElementById('modal-name'),
    modalEmail: document.getElementById('modal-email'),
    modalQrContainer: document.getElementById('modal-qr-container'),
    modalEditBtn: document.getElementById('modal-edit-btn'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    
    addParticipantModal: document.getElementById('add-participant-modal'),
    addPartName: document.getElementById('add-part-name'),
    addPartEmail: document.getElementById('add-part-email'),
    addPartInstitution: document.getElementById('add-part-institution'),
    addPartSaveBtn: document.getElementById('add-part-save-btn'),
    addPartCancelBtn: document.getElementById('add-part-cancel-btn'),
    
    editParticipantModal: document.getElementById('edit-participant-modal'),
    editPartId: document.getElementById('edit-part-id'),
    editPartName: document.getElementById('edit-part-name'),
    editPartEmail: document.getElementById('edit-part-email'),
    editPartInstitution: document.getElementById('edit-part-institution'),
    editPartSaveBtn: document.getElementById('edit-part-save-btn'),
    editPartCancelBtn: document.getElementById('edit-part-cancel-btn'),
    editPartDeleteBtn: document.getElementById('edit-part-delete-btn'),
    
    // Global overlays
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text'),
    toastContainer: document.getElementById('toast-container')
  };

  // ============================================
  // INICIALIZAÇÃO (INIT)
  // ============================================
  
  function init() {
    loadConfig();
    setupTheme();
    bindEvents();
    registerServiceWorker();
    
    // Iniciar loop de monitoramento offline
    window.addEventListener('online', processOfflineQueue);
    window.addEventListener('offline', updateConnectionStatusUI);
    
    // Setup inicial dos gráficos vazios
    initCharts();
    
    // ═══ V2.1: Inicializar sistema de partículas ═══
    if (window.IFMSAParticles) {
      window.IFMSAParticles.init('particle-canvas');
    }
    
    // ═══ V2.1: Tilt effect nos stat cards ═══
    setupTiltEffect();
    
    // Configurar SDK do Google Sign-In se houver Client ID salvo
    if (state.googleClientId) {
      inicializarGoogleOAuth();
    } else {
      console.log("ID de Cliente Google não configurado. Login via Google desativado.");
      if (dom.googleBtnContainer) {
        dom.googleBtnContainer.style.display = 'none';
        const divider = document.querySelector('.login-divider');
        if (divider) divider.style.display = 'none';
      }
    }
    
    // Seletor do input de senha escutar ENTER
    dom.passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handlePasswordLogin();
    });
    
    // Inicializar Theatre.js
    initTheatre();
  }

  function loadConfig() {
    state.scriptUrl = localStorage.getItem(STORAGE_KEYS.scriptUrl) || '';
    state.googleClientId = localStorage.getItem(STORAGE_KEYS.googleClientId) || '';
    state.activeEvent = localStorage.getItem(STORAGE_KEYS.activeEvent) || '';
    state.theme = localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
    
    if (dom.configScriptUrl) dom.configScriptUrl.value = state.scriptUrl;
    if (dom.configGoogleClientId) dom.configGoogleClientId.value = state.googleClientId;
    
    if (dom.appVersion) dom.appVersion.textContent = APP_VERSION;
  }

  // ============================================
  // LOGIN / AUTENTICAÇÃO (GOOGLE & PASSWORD)
  // ============================================
  
  function inicializarGoogleOAuth() {
    try {
      google.accounts.id.initialize({
        client_id: state.googleClientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });
      
      google.accounts.id.renderButton(
        dom.googleBtnContainer,
        { 
          theme: state.theme === 'dark' ? 'filled_blue' : 'outline', 
          size: 'large', 
          shape: 'pill',
          text: 'signin_with',
          locale: 'pt-BR'
        }
      );
    } catch (e) {
      console.warn("Erro ao carregar SDK Google Sign-in:", e);
    }
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response.credential) return;
    
    showLoading('Autenticando...');
    state.googleToken = response.credential;
    
    // Decodificar payload local do token para pegar informações básicas (avatar/nome)
    try {
      const base64Url = response.credential.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')));
      
      state.activeUser = {
        name: payload.name || payload.given_name || 'Usuário',
        email: payload.email,
        picture: payload.picture || ''
      };
    } catch(e) {
      console.warn('Erro ao ler JWT localmente:', e);
    }
    
    // Testar se o e-mail está autorizado no backend
    const ok = await testarAcessoBackend();
    hideLoading();
    
    if (ok) {
      entrarNoAplicativo();
      showToast(`Bem-vindo, ${state.activeUser.name}!`, 'success');
    } else {
      state.googleToken = '';
      state.activeUser = null;
      showLoginError('Seu e-mail não está cadastrado na lista de acessos autorizados.');
    }
  }

  async function handlePasswordLogin() {
    const pwd = dom.passwordInput.value.trim();
    if (!pwd) {
      showLoginError('Por favor, digite a senha.');
      return;
    }
    
    // Se for a senha mestre local, permite entrar mesmo sem URL do script configurada (bootstrap inicial)
    if (pwd === 'IFMSAFAPI123') {
      state.activeUser = {
        name: 'Administrador',
        email: 'admin@legado.com',
        picture: ''
      };
      entrarNoAplicativo();
      showToast('Autenticado com sucesso!', 'success');
      return;
    }
    
    showLoading('Conectando...');
    const success = await testarAcessoBackend(pwd);
    hideLoading();
    
    if (success) {
      state.activeUser = {
        name: 'Administrador',
        email: 'admin@legado.com',
        picture: ''
      };
      entrarNoAplicativo();
      showToast('Autenticado com sucesso (Senha)!', 'success');
    } else {
      showLoginError('Senha incorreta ou erro de conexão.');
    }
  }

  async function testarAcessoBackend(passwordOverride) {
    if (!state.scriptUrl) return false;
    
    const url = `${state.scriptUrl}?action=list_events` + 
      (passwordOverride ? `&password=${passwordOverride}` : `&googleToken=${state.googleToken}`);
      
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'success') {
        state.isAuthorized = true;
        return true;
      }
    } catch(e) {
      console.error('Erro de autenticação no backend:', e);
    }
    return false;
  }

  function entrarNoAplicativo() {
    dom.loginScreen.classList.add('hidden');
    dom.app.classList.remove('hidden');
    
    // Atualizar UI de Perfil
    if (state.activeUser) {
      dom.profilePill.classList.remove('hidden');
      dom.profileName.textContent = state.activeUser.name;
      if (state.activeUser.picture) {
        dom.profileAvatar.innerHTML = `<img src="${state.activeUser.picture}" alt="Avatar">`;
      } else {
        dom.profileAvatar.textContent = state.activeUser.name.charAt(0).toUpperCase();
      }
    }
    
    carregarEventosDoSheets();
    setupSilentWarmupCamera();
    
    // Disparar animação cinemática do Theatre.js
    if (theatreSheet) {
      theatreSheet.sequence.play({ iterationCount: 1 });
    }
  }

  function logout() {
    state.googleToken = '';
    state.activeUser = null;
    state.isAuthorized = false;
    dom.profilePill.classList.add('hidden');
    dom.app.classList.add('hidden');
    dom.loginScreen.classList.remove('hidden');
    dom.passwordInput.value = '';
    
    // Parar câmera se ativa
    if (state.isScanning) {
      stopScanner();
    }
    
    // Reinicializar botões de login do Google
    if (state.googleClientId) {
      inicializarGoogleOAuth();
    }
  }

  function showLoginError(msg) {
    dom.loginError.textContent = msg;
    dom.loginError.classList.add('visible');
    setTimeout(() => dom.loginError.classList.remove('visible'), 5000);
  }

  // ============================================
  // MULTIEVENTOS (CARREGAR ABAS DO SHEETS)
  // ============================================

  async function carregarEventosDoSheets() {
    if (!state.scriptUrl) return;
    
    updateConnectionStatusUI('connecting');
    try {
      const data = await requestAPI('list_events');
      if (data && data.status === 'success' && data.events) {
        state.events = data.events;
        popularSelectorDeEventos();
        
        // Selecionar o último evento ativo ou o primeiro retornado
        if (state.events.includes(state.activeEvent)) {
          dom.eventSelect.value = state.activeEvent;
        } else if (state.events.length > 0) {
          state.activeEvent = state.events[0];
          localStorage.setItem(STORAGE_KEYS.activeEvent, state.activeEvent);
          dom.eventSelect.value = state.activeEvent;
        }
        
        atualizarDadosDoEvento();
      }
    } catch(e) {
      console.error("Falha ao buscar eventos:", e);
      showToast("Não foi possível carregar as sessões do Sheets.", "error");
      updateConnectionStatusUI('disconnected');
    }
  }

  function popularSelectorDeEventos() {
    dom.eventSelect.innerHTML = '';
    if (state.events.length === 0) {
      dom.eventSelect.innerHTML = '<option value="">Sem eventos ativos</option>';
      return;
    }
    
    state.events.forEach(event => {
      const opt = document.createElement('option');
      opt.value = event;
      opt.textContent = event;
      dom.eventSelect.appendChild(opt);
    });
  }

  function handleEventChange(e) {
    state.activeEvent = e.target.value;
    localStorage.setItem(STORAGE_KEYS.activeEvent, state.activeEvent);
    showToast(`Carregando credenciamento: ${state.activeEvent}`, 'info');
    atualizarDadosDoEvento();
  }

  async function atualizarDadosDoEvento() {
    if (!state.scriptUrl || !state.activeEvent) return;
    
    updateConnectionStatusUI('syncing');
    try {
      const data = await requestAPI('list');
      if (data && data.status === 'success') {
        state.participants = data.participants || [];
        
        // Atualizar Dashboard
        atualizarMetricsUI(data.stats);
        atualizarRecentCheckinsList();
        renderCharts(state.participants);
        
        // Atualizar Grid de QR Codes
        renderQRGrid();
        
        updateConnectionStatusUI('connected');
      }
    } catch(e) {
      console.error("Erro ao carregar participantes:", e);
      showToast("Falha ao sincronizar com a planilha.", "error");
      updateConnectionStatusUI('disconnected');
    }
  }

  // ============================================
  // OPERAÇÕES DE COMUNICAÇÃO API
  // ============================================

  async function requestAPI(action, payload = {}, method = 'GET') {
    if (!state.scriptUrl) {
      throw new Error("URL da API do Apps Script não configurada.");
    }

    const authParams = state.googleToken ? `googleToken=${state.googleToken}` : `password=${APP_PASSWORD}`;
    const url = `${state.scriptUrl}?action=${action}&sheetName=${encodeURIComponent(state.activeEvent)}&${authParams}`;
    
    if (method === 'GET') {
      const response = await fetch(url);
      return await response.json();
    } else {
      // Inserir credenciais e aba ativa no corpo
      const body = {
        action: action,
        sheetName: state.activeEvent,
        ...payload
      };
      
      if (state.googleToken) {
        body.googleToken = state.googleToken;
      } else {
        body.password = APP_PASSWORD;
      }
      
      const response = await fetch(state.scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
      return await response.json();
    }
  }

  // ============================================
  // NAVEGAÇÃO DE ABAS (TABS)
  // ============================================
  
  function switchTab(sectionId) {
    state.currentSection = sectionId;
    
    // Atualizar Navegação — Bottom nav (mobile)
    dom.navItems.forEach(item => {
      if (item.getAttribute('data-section') === sectionId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Atualizar Navegação — Sidebar (desktop)
    if (dom.sidebarNavItems) {
      dom.sidebarNavItems.forEach(item => {
        if (item.getAttribute('data-section') === sectionId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }
    
    // Exibir Seção com GSAP stagger (V2.1)
    dom.sections.forEach(section => {
      if (section.getAttribute('id') === `${sectionId}-section`) {
        section.classList.add('active');
        
        // ═══ V2.1: GSAP stagger entrance ═══
        if (window.gsap) {
          const children = section.querySelectorAll('.stat-card, .chart-card, .recent-item, .qr-card, .input-group, .qr-toolbar');
          if (children.length > 0) {
            gsap.fromTo(children, 
              { opacity: 0, y: 20, scale: 0.97 },
              { opacity: 1, y: 0, scale: 1, duration: 0.45, stagger: 0.06, ease: 'power3.out', clearProps: 'all' }
            );
          }
        }
      } else {
        section.classList.remove('active');
      }
    });

    // Se navegou para aba QR Codes, garantir renderização dos códigos
    if (sectionId === 'qrcodes') {
      renderQRGrid();
    }
    
    // Parar câmera se sair do scanner
    if (sectionId !== 'scanner' && state.isScanning) {
      stopScanner();
    }
  }

  // ============================================
  // METRICS & DASHBOARD GRAPHS
  // ============================================
  
  function atualizarMetricsUI(stats) {
    if (!stats) return;
    
    // ═══ V2.1: Counter animation ═══
    animateCounter(dom.statTotal, stats.total || 0);
    animateCounter(dom.statPresent, stats.present || 0);
    animateCounter(dom.statAbsent, stats.absent || 0);
    animateCounter(dom.statPercentage, stats.percentage || 0, '%');
  }

  function atualizarRecentCheckinsList() {
    dom.recentList.innerHTML = '';
    
    // Filtrar participantes que fizeram check-in na planilha ativa e ordenar pelo horário decrescente
    const checkedIn = state.participants
      .filter(p => p.status === 'present' && p.checkinDate)
      .sort((a, b) => parseCheckinDate(b.checkinDate) - parseCheckinDate(a.checkinDate));
      
    dom.recentCount.textContent = `${checkedIn.length} presente(s)`;
    
    if (checkedIn.length === 0) {
      dom.recentList.appendChild(dom.recentList.querySelector('.empty-state') || createEmptyStateElement());
      return;
    }
    
    // Mostrar os 5 mais recentes
    checkedIn.slice(0, 5).forEach(p => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML = `
        <div class="check-icon">✓</div>
        <div class="item-info">
          <div class="item-name">${p.name}</div>
          <div class="item-time">Acesso registrado às ${formatTimeOnly(p.checkinDate)}</div>
        </div>
      `;
      dom.recentList.appendChild(item);
    });
  }

  function createEmptyStateElement() {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.innerHTML = `
      <div class="empty-icon">📋</div>
      <p>Nenhum check-in registrado na sessão atual.</p>
    `;
    return div;
  }

  function initCharts() {
    Chart.defaults.color = 'var(--text-secondary)';
    Chart.defaults.font.family = "'Plus Jakarta Sans', 'Inter', sans-serif";
  }

  function renderCharts(participants) {
    // 1. Gráfico de Proporção (Presença)
    const presentCount = participants.filter(p => p.status === 'present').length;
    const absentCount = participants.length - presentCount;
    
    const presenceCtx = document.getElementById('presence-chart').getContext('2d');
    if (state.charts.presence) state.charts.presence.destroy();
    
    state.charts.presence = new Chart(presenceCtx, {
      type: 'doughnut',
      data: {
        labels: ['Presentes', 'Ausentes'],
        datasets: [{
          data: [presentCount, absentCount],
          backgroundColor: ['#10b981', '#f59e0b'],
          borderColor: state.theme === 'dark' ? '#172136' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        },
        cutout: '65%'
      }
    });

    // 2. Gráfico de Fluxo de Entrada por Hora (Acumulado)
    const checkinTimes = participants
      .filter(p => p.status === 'present' && p.checkinDate)
      .map(p => parseCheckinDate(p.checkinDate))
      .filter(t => t !== null)
      .sort((a, b) => a - b);
      
    // Buckets de hora em hora
    const hourBuckets = {};
    checkinTimes.forEach(time => {
      const hourStr = `${String(time.getHours()).padStart(2, '0')}:00`;
      hourBuckets[hourStr] = (hourBuckets[hourStr] || 0) + 1;
    });
    
    const sortedHours = Object.keys(hourBuckets).sort();
    let cumulative = 0;
    const dataPoints = sortedHours.map(hour => {
      cumulative += hourBuckets[hour];
      return cumulative;
    });
    
    const flowCtx = document.getElementById('flow-chart').getContext('2d');
    if (state.charts.flow) state.charts.flow.destroy();
    
    state.charts.flow = new Chart(flowCtx, {
      type: 'line',
      data: {
        labels: sortedHours,
        datasets: [{
          label: 'Acessos acumulados',
          data: dataPoints,
          borderColor: '#1d3768',
          backgroundColor: 'rgba(29, 55, 104, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointBackgroundColor: '#fbbf24'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }

  // ============================================
  // LEITOR DE CÂMERA (SCANNER) & COMPATIBILIDADE TABLET
  // ============================================
  
  async function setupSilentWarmupCamera() {
    // Warmup para liberar as permissões da câmera e pegar as labels das câmeras
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(track => track.stop());
      
      const devices = await Html5Qrcode.getCameras();
      state.cameras = devices || [];
    } catch(e) {
      console.warn("Câmera indisponível no warmup:", e);
    }
  }

  async function startScanner() {
    if (state.isScanning) return;
    
    dom.startScanBtn.classList.add('hidden');
    dom.stopScanBtn.classList.remove('hidden');
    dom.scannerPlaceholder.classList.add('hidden');
    dom.scannerViewport.classList.add('scanning');
    
    try {
      state.scanner = new Html5Qrcode('scanner-view');
      
      // Listar dispositivos novamente caso o warmup não tenha carregado
      if (state.cameras.length === 0) {
        state.cameras = await Html5Qrcode.getCameras();
      }
      
      // Configuração de compatibilidade específica (desativa BarcodeDetector API corrompida em Samsung)
      const config = {
        fps: 15,
        qrbox: function(width, height) {
          const size = Math.min(width, height) * 0.70;
          return { width: Math.floor(size), height: Math.floor(size) };
        },
        disableFlip: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: false // Garante fallback em ZXing
        }
      };
      
      if (state.cameras.length > 1) {
        dom.switchCameraBtn.classList.remove('hidden');
      }
      
      state.currentCameraIndex = 0;
      let started = false;
      
      // Tentativa 1: Iniciar câmera padrão se houver label
      const hasLabels = state.cameras.some(c => c.label);
      if (state.cameras.length > 0 && hasLabels) {
        // Encontrar a câmera traseira padrão na lista
        const backCam = state.cameras.find(c => /back|rear|trás|environment|traseira/i.test(c.label));
        const selectedCam = backCam || state.cameras[0];
        
        try {
          await state.scanner.start(selectedCam.id, config, onScanSuccess, function() {});
          started = true;
        } catch(e) {
          console.warn("Erro ao iniciar câmera principal. Rodando fallback...", e);
        }
      }
      
      // Tentativa 2: Fallbacks sequenciais com constraints de facingMode
      if (!started) {
        started = await _startCameraWithFallback(config);
      }
      
      if (!started) {
        throw new Error("Nenhuma câmera encontrada ou acessível.");
      }
      
      state.isScanning = true;
      showToast("Leitor de QR Code ativado", "info");
    } catch(err) {
      console.error(err);
      resetScannerUI();
      showToast("Erro ao abrir a câmera: " + err.message, "error");
    }
  }

  async function _startCameraWithFallback(config) {
    // Estratégia A: Loop nas câmeras encontradas
    for (let i = 0; i < state.cameras.length; i++) {
      try {
        await state.scanner.start(state.cameras[i].id, config, onScanSuccess, function() {});
        state.currentCameraIndex = i;
        return true;
      } catch(e) {}
    }
    
    // Estratégia B: Constraint Traseira Genérica
    try {
      await state.scanner.start({ facingMode: "environment" }, config, onScanSuccess, function() {});
      return true;
    } catch(e) {}
    
    // Estratégia C: Constraint Frontal Genérica
    try {
      await state.scanner.start({ facingMode: "user" }, config, onScanSuccess, function() {});
      return true;
    } catch(e) {}
    
    return false;
  }

  async function switchCamera() {
    if (!state.isScanning || state.cameras.length <= 1) return;
    
    dom.switchCameraBtn.disabled = true;
    try {
      await state.scanner.stop();
      state.currentCameraIndex = (state.currentCameraIndex + 1) % state.cameras.length;
      
      const config = {
        fps: 15,
        qrbox: function(width, height) {
          const size = Math.min(width, height) * 0.70;
          return { width: Math.floor(size), height: Math.floor(size) };
        },
        disableFlip: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: false
        }
      };
      
      await state.scanner.start(state.cameras[state.currentCameraIndex].id, config, onScanSuccess, function() {});
    } catch(e) {
      console.error("Falha ao alternar câmera:", e);
      showToast("Erro ao alternar de câmera.", "error");
    } finally {
      dom.switchCameraBtn.disabled = false;
    }
  }

  async function stopScanner() {
    if (!state.isScanning) return;
    try {
      await state.scanner.stop();
    } catch(e) {
      console.warn("Erro ao parar câmera:", e);
    }
    resetScannerUI();
  }

  function resetScannerUI() {
    state.isScanning = false;
    dom.startScanBtn.classList.remove('hidden');
    dom.stopScanBtn.classList.add('hidden');
    dom.switchCameraBtn.classList.add('hidden');
    dom.scannerPlaceholder.classList.remove('hidden');
    dom.scannerViewport.classList.remove('scanning');
    dom.scannerViewport.classList.remove('scan-success');
    dom.scanResult.classList.remove('visible');
    state.scanner = null;
  }

  // ============================================
  // LEITURA DO QR CODE E ENVIO
  // ============================================

  function onScanSuccess(decodedText) {
    if (!decodedText) return;
    
    // Prevenir múltiplas leituras simultâneas do mesmo código em menos de 3 segundos
    if (state.lastScannedId === decodedText && Date.now() - state.lastScanTime < 3000) {
      return;
    }
    
    state.lastScannedId = decodedText;
    state.lastScanTime = Date.now();
    
    // Efeito Ripple e som visual
    dom.scannerViewport.classList.add('scan-success');
    setTimeout(() => dom.scannerViewport.classList.remove('scan-success'), 600);
    
    // ═══ V2.1: Fire confetti celebration ═══
    if (window.IFMSAConfetti) {
      window.IFMSAConfetti.fire({ count: 150 });
    }
    
    processarCheckin(decodedText);
  }

  async function processarCheckin(id) {
    const localPart = state.participants.find(p => p.id === id);
    const nome = localPart ? localPart.name : `Código: ${id}`;
    
    // Se estiver offline, salvar na fila local para sincronizar depois
    if (!navigator.onLine) {
      enfileirarCheckinOffline(id, nome);
      showScanResult('duplicate', nome, 'Salvo offline! O check-in será enviado automaticamente quando a internet voltar.');
      return;
    }
    
    showLoading('Registrando presença...');
    try {
      const data = await requestAPI('checkin', { id: id }, 'POST');
      hideLoading();
      
      if (data.status === 'success') {
        showScanResult('success', nome, data.message);
        showToast(`Presença de ${nome} confirmada!`, 'success');
        atualizarDadosDoEvento(); // Recarregar
      } else if (data.status === 'already_checked_in') {
        showScanResult('duplicate', nome, data.message);
        showToast(`${nome} já está registrado como presente.`, 'warning');
      } else {
        showScanResult('error', nome, data.message || 'Erro no registro.');
        showToast(`Falha no check-in: ${data.message}`, 'error');
      }
    } catch(err) {
      hideLoading();
      console.error(err);
      showScanResult('error', nome, 'Erro na conexão com o servidor.');
      showToast('Erro de conexão com o Sheets.', 'error');
    }
  }

  function showScanResult(type, name, msg) {
    dom.scanResult.classList.remove('success', 'error', 'duplicate');
    dom.scanResult.classList.add(type);
    
    let icon = '❓';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'duplicate') icon = '⏳';
    
    dom.resultIcon.textContent = icon;
    dom.resultName.textContent = name;
    dom.resultMessage.textContent = msg;
    dom.scanResult.classList.add('visible');
    
    // Ocultar automaticamente após 6 segundos
    if (state.resultTimeout) clearTimeout(state.resultTimeout);
    state.resultTimeout = setTimeout(() => {
      dom.scanResult.classList.remove('visible');
    }, 6000);
  }

  // ============================================
  // FILA DE SINCRONIZAÇÃO OFFLINE (IndexedDB / LocalStorage)
  // ============================================

  function enfileirarCheckinOffline(id, nome) {
    const queue = JSON.parse(localStorage.getItem(STORAGE_KEYS.offlineQueue) || '[]');
    // Evitar duplicados na fila
    if (!queue.some(item => item.id === id)) {
      queue.push({ id: id, nome: nome, timestamp: Date.now() });
      localStorage.setItem(STORAGE_KEYS.offlineQueue, JSON.stringify(queue));
      
      // Atualizar localmente no estado da aba para refletir check-in na tela
      const idx = state.participants.findIndex(p => p.id === id);
      if (idx !== -1) {
        state.participants[idx].status = 'present';
        state.participants[idx].checkinDate = new Date().toLocaleString();
        atualizarRecentCheckinsList();
        renderCharts(state.participants);
        renderQRGrid();
      }
    }
  }

  async function processOfflineQueue() {
    if (!navigator.onLine) return;
    
    const queue = JSON.parse(localStorage.getItem(STORAGE_KEYS.offlineQueue) || '[]');
    if (queue.length === 0) {
      updateConnectionStatusUI('connected');
      return;
    }
    
    showToast(`Enviando ${queue.length} check-in(s) pendente(s) offline...`, 'info');
    updateConnectionStatusUI('syncing');
    
    let successCount = 0;
    for (const item of queue) {
      try {
        const data = await requestAPI('checkin', { id: item.id }, 'POST');
        if (data.status === 'success' || data.status === 'already_checked_in') {
          successCount++;
        }
      } catch (e) {
        console.warn("Falha ao sincronizar item offline:", item.id, e);
      }
    }
    
    // Limpar fila e re-atualizar dados da planilha
    localStorage.removeItem(STORAGE_KEYS.offlineQueue);
    showToast(`${successCount} check-in(s) sincronizados com o Google Sheets!`, 'success');
    atualizarDadosDoEvento();
  }

  // ============================================
  // CRUD DE PARTICIPANTES (ADICIONAR/EDITAR/EXCLUIR)
  // ============================================

  async function adicionarParticipante() {
    const p = {
      name: dom.addPartName.value.trim(),
      email: dom.addPartEmail.value.trim(),
      institution: dom.addPartInstitution.value.trim()
    };
    
    if (!p.name || !p.email) {
      showToast('Preencha pelo menos Nome e E-mail.', 'error');
      return;
    }
    
    showLoading('Adicionando participante...');
    try {
      const data = await requestAPI('add_participant', { participant: p }, 'POST');
      hideLoading();
      
      if (data.status === 'success') {
        showToast('Participante cadastrado com sucesso!', 'success');
        fecharModais();
        atualizarDadosDoEvento();
      } else {
        showToast('Erro ao cadastrar: ' + data.message, 'error');
      }
    } catch(e) {
      hideLoading();
      showToast('Erro de conexão ao salvar participante.', 'error');
    }
  }

  async function editarParticipante() {
    const p = {
      id: dom.editPartId.value,
      name: dom.editPartName.value.trim(),
      email: dom.editPartEmail.value.trim(),
      institution: dom.editPartInstitution.value.trim()
    };
    
    if (!p.id || !p.name || !p.email) {
      showToast('Campos de Nome e E-mail são obrigatórios.', 'error');
      return;
    }
    
    showLoading('Atualizando cadastro...');
    try {
      const data = await requestAPI('edit_participant', { participant: p }, 'POST');
      hideLoading();
      
      if (data.status === 'success') {
        showToast('Cadastro atualizado com sucesso!', 'success');
        fecharModais();
        atualizarDadosDoEvento();
      } else {
        showToast('Erro ao atualizar: ' + data.message, 'error');
      }
    } catch(e) {
      hideLoading();
      showToast('Erro de conexão ao salvar alterações.', 'error');
    }
  }

  async function excluirParticipante() {
    const id = dom.editPartId.value;
    if (!id) return;
    
    if (!confirm('Deseja realmente remover este participante de forma permanente da planilha?')) {
      return;
    }
    
    showLoading('Excluindo participante...');
    try {
      const data = await requestAPI('delete_participant', { id: id }, 'POST');
      hideLoading();
      
      if (data.status === 'success') {
        showToast('Participante removido com sucesso!', 'success');
        fecharModais();
        atualizarDadosDoEvento();
      } else {
        showToast('Erro ao remover: ' + data.message, 'error');
      }
    } catch(e) {
      hideLoading();
      showToast('Erro ao se conectar para excluir.', 'error');
    }
  }

  // ============================================
  // AJUSTES & NOVO EVENTO
  // ============================================

  async function criarNovoEvento() {
    const name = dom.newEventNameInput.value.trim();
    if (!name) {
      showToast('Digite um nome para a sessão/aba.', 'error');
      return;
    }
    
    showLoading('Criando nova aba no Sheets...');
    try {
      const data = await requestAPI('create_event', { name: name }, 'POST');
      hideLoading();
      
      if (data.status === 'success') {
        showToast(`Evento "${name}" criado com sucesso!`, 'success');
        dom.newEventNameInput.value = '';
        state.activeEvent = name;
        localStorage.setItem(STORAGE_KEYS.activeEvent, name);
        carregarEventosDoSheets();
      } else {
        showToast('Erro: ' + data.message, 'error');
      }
    } catch(e) {
      hideLoading();
      showToast('Erro ao conectar para criar o evento.', 'error');
    }
  }

  function salvarConfiguracoes() {
    const scriptUrl = dom.configScriptUrl.value.trim();
    const googleId = dom.configGoogleClientId.value.trim();
    
    localStorage.setItem(STORAGE_KEYS.scriptUrl, scriptUrl);
    localStorage.setItem(STORAGE_KEYS.googleClientId, googleId);
    
    state.scriptUrl = scriptUrl;
    state.googleClientId = googleId;
    
    showToast('Configurações salvas!', 'success');
    
    // Recarregar botões do Google
    if (googleId) {
      inicializarGoogleOAuth();
    }
  }

  async function testarConexao() {
    const scriptUrl = dom.configScriptUrl.value.trim();
    if (!scriptUrl) {
      showToast('Informe a URL do Apps Script primeiro.', 'error');
      return;
    }
    
    showLoading('Testando conexão com a planilha...');
    const authParams = state.googleToken ? `googleToken=${state.googleToken}` : `password=${APP_PASSWORD}`;
    const url = `${scriptUrl}?action=list_events&${authParams}`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      hideLoading();
      
      if (data.status === 'success') {
        dom.connectionStatus.className = 'connection-status ok';
        dom.connectionStatus.innerHTML = '<span>🟢</span> Conexão estabelecida com sucesso!';
        dom.connectionStatus.classList.remove('hidden');
        showToast('Conectado com sucesso!', 'success');
      } else {
        throw new Error(data.message || 'Falha desconhecida');
      }
    } catch(e) {
      hideLoading();
      dom.connectionStatus.className = 'connection-status fail';
      dom.connectionStatus.innerHTML = `<span>🔴</span> Erro ao conectar: ${e.message}`;
      dom.connectionStatus.classList.remove('hidden');
      showToast('Erro ao testar conexão.', 'error');
    }
  }

  // ============================================
  // DISPARO DE EMAILS EM LOTE
  // ============================================

  async function dispararEmailsEmLote() {
    if (!confirm('Deseja enviar agora os QR Codes de Credenciamento para TODOS os participantes na aba ativa que ainda não receberam?')) {
      return;
    }
    
    showLoading('Processando disparos...');
    try {
      const data = await requestAPI('send_emails', {}, 'POST');
      hideLoading();
      
      if (data.status === 'success') {
        showToast(`${data.count} e-mails enviados com sucesso!`, 'success');
        atualizarDadosDoEvento();
      } else {
        showToast('Erro no disparo: ' + data.message, 'error');
      }
    } catch(e) {
      hideLoading();
      showToast('Erro de comunicação para disparo.', 'error');
    }
  }

  // ============================================
  // RENDER PARTICIPANTES GRID & QR CODES
  // ============================================

  function renderQRGrid() {
    dom.qrGrid.innerHTML = '';
    const query = dom.qrSearchInput.value.toLowerCase().trim();
    
    const filtered = state.participants.filter(p => {
      return p.name.toLowerCase().includes(query) || 
             p.email.toLowerCase().includes(query) || 
             p.institution.toLowerCase().includes(query) || 
             p.id.toLowerCase().includes(query);
    });
    
    if (filtered.length === 0) {
      dom.qrGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>Nenhum participante correspondente encontrado.</p>
        </div>
      `;
      return;
    }
    
    filtered.forEach(p => {
      const card = document.createElement('div');
      card.className = `qr-card ${p.status === 'present' ? 'checked-in' : ''}`;
      
      // Criar container para renderizar o QR code
      const qrContainerId = `qr-code-${p.id}`;
      const qrDiv = document.createElement('div');
      qrDiv.id = qrContainerId;
      card.appendChild(qrDiv);
      
      const infoDiv = document.createElement('div');
      infoDiv.innerHTML = `
        <div class="qr-name">${p.name}</div>
        <div class="qr-email">${p.email}</div>
      `;
      card.appendChild(infoDiv);
      
      // Modal ao clicar
      card.addEventListener('click', () => abrirModalQR(p));
      dom.qrGrid.appendChild(card);
      
      // Gerar QR code no canvas local com a biblioteca
      new QRCode(document.getElementById(qrContainerId), {
        text: p.id,
        width: 150,
        height: 150,
        colorDark: '#090e1a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
    });
  }

  // ============================================
  // PESQUISA RÁPIDA (CHECK-IN MANUAL)
  // ============================================

  function handleManualSearch() {
    const query = dom.manualSearchInput.value.toLowerCase().trim();
    dom.manualSearchResults.innerHTML = '';
    
    if (!query) {
      dom.manualSearchResults.classList.add('hidden');
      return;
    }
    
    const filtered = state.participants.filter(p => {
      return p.name.toLowerCase().includes(query) || p.email.toLowerCase().includes(query);
    });
    
    if (filtered.length === 0) {
      dom.manualSearchResults.innerHTML = '<div style="padding: 8px; font-size: 0.8rem; opacity: 0.6;">Nenhum participante encontrado</div>';
      dom.manualSearchResults.classList.remove('hidden');
      return;
    }
    
    filtered.slice(0, 10).forEach(p => {
      const item = document.createElement('div');
      item.className = 'manual-search-item';
      item.innerHTML = `
        <div class="item-info">
          <span class="item-name">${p.name}</span>
          <span class="item-email">${p.email}</span>
        </div>
        <span class="item-status ${p.status}">${p.status === 'present' ? 'Presente' : 'Check-in'}</span>
      `;
      
      item.addEventListener('click', () => {
        dom.manualSearchInput.value = '';
        dom.manualSearchResults.classList.add('hidden');
        processarCheckin(p.id);
      });
      
      dom.manualSearchResults.appendChild(item);
    });
    
    dom.manualSearchResults.classList.remove('hidden');
  }

  // ============================================
  // LEITURA DE QR CODE VIA ARQUIVO DE IMAGEM
  // ============================================

  function handleQRFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    showLoading('Lendo imagem do código...');
    
    // Instanciar html5-qrcode para processar arquivo de imagem sem abrir stream de câmera
    const html5QrCode = new Html5Qrcode('scanner-view');
    html5QrCode.scanFile(file, true)
      .then(decodedText => {
        hideLoading();
        onScanSuccess(decodedText);
      })
      .catch(err => {
        hideLoading();
        console.error("Falha ao ler QR do arquivo:", err);
        showToast("Código de barras ou QR Code não detectado na imagem.", "error");
      });
  }

  // ============================================
  // INTERRUPTOR DE TEMAS (LIGHT/DARK MODE)
  // ============================================

  function setupTheme() {
    if (state.theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }

  function toggleTheme() {
    if (document.body.classList.contains('light-theme')) {
      document.body.classList.remove('light-theme');
      state.theme = 'dark';
    } else {
      document.body.classList.add('light-theme');
      state.theme = 'light';
    }
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    
    // Recriar gráficos para atualizar cores das fontes baseadas no tema
    if (state.participants.length > 0) {
      renderCharts(state.participants);
    }
    
    // Recriar botões GIS se presentes
    if (state.googleClientId && dom.loginScreen.style.display !== 'none') {
      inicializarGoogleOAuth();
    }
  }

  // ============================================
  // CONTROLLER MODAIS (OPEN/CLOSE MODALS)
  // ============================================

  function abrirModalQR(p) {
    dom.modalName.textContent = p.name;
    dom.modalEmail.textContent = p.email;
    dom.modalQrContainer.innerHTML = '';
    
    // Gerar QR maior no modal
    new QRCode(dom.modalQrContainer, {
      text: p.id,
      width: 200,
      height: 200,
      colorDark: '#090e1a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
    
    // Guardar dados para botão editar
    dom.modalEditBtn.onclick = () => {
      fecharModais();
      abrirModalEditar(p);
    };
    
    dom.qrModal.classList.remove('hidden');
  }

  function abrirModalAdicionar() {
    dom.addPartName.value = '';
    dom.addPartEmail.value = '';
    dom.addPartInstitution.value = '';
    dom.addParticipantModal.classList.remove('hidden');
  }

  function abrirModalEditar(p) {
    dom.editPartId.value = p.id;
    dom.editPartName.value = p.name;
    dom.editPartEmail.value = p.email;
    dom.editPartInstitution.value = p.institution || '';
    dom.editParticipantModal.classList.remove('hidden');
  }

  function fecharModais() {
    dom.qrModal.classList.add('hidden');
    dom.addParticipantModal.classList.add('hidden');
    dom.editParticipantModal.classList.add('hidden');
  }

  // ============================================
  // IMPRESSÃO DE QR CODES
  // ============================================

  function imprimirQRCodes() {
    window.print();
  }

  // ============================================
  // EVENT BINDINGS (BARRAS DE EVENTOS)
  // ============================================
  
  function bindEvents() {
    // Menu e tabs — Bottom nav (mobile)
    dom.navItems.forEach(item => {
      item.addEventListener('click', () => {
        switchTab(item.getAttribute('data-section'));
      });
    });
    
    // ═══ V2.1: Sidebar nav (desktop) ═══
    if (dom.sidebarNavItems) {
      dom.sidebarNavItems.forEach(item => {
        item.addEventListener('click', () => {
          switchTab(item.getAttribute('data-section'));
        });
      });
    }
    
    // Eventos de cabeçalho
    dom.eventSelect.addEventListener('change', handleEventChange);
    dom.refreshBtn.addEventListener('click', atualizarDadosDoEvento);
    dom.logoutBtn.addEventListener('click', logout);
    dom.themeToggleBtn.addEventListener('click', toggleTheme);
    
    // Login
    dom.loginBtn.addEventListener('click', handlePasswordLogin);
    
    // Scanner
    dom.startScanBtn.addEventListener('click', startScanner);
    dom.stopScanBtn.addEventListener('click', stopScanner);
    dom.switchCameraBtn.addEventListener('click', switchCamera);
    dom.qrFileInput.addEventListener('change', handleQRFileSelect);
    
    // Manual Check-in
    dom.manualSearchInput.addEventListener('input', handleManualSearch);
    
    // Participantes Toolbar
    dom.qrSearchInput.addEventListener('input', renderQRGrid);
    dom.openAddModalBtn.addEventListener('click', abrirModalAdicionar);
    dom.sendEmailsBulkBtn.addEventListener('click', dispararEmailsEmLote);
    dom.printQrBtn.addEventListener('click', imprimirQRCodes);
    
    // Configurações
    dom.saveConfigBtn.addEventListener('click', salvarConfiguracoes);
    dom.testConnectionBtn.addEventListener('click', testarConexao);
    dom.createEventBtn.addEventListener('click', criarNovoEvento);
    dom.clearDataBtn.addEventListener('click', () => {
      if (confirm('Deseja realmente apagar todos os dados de URL e configurações salvas localmente?')) {
        localStorage.clear();
        location.reload();
      }
    });
    
    // Fechamento de Modais
    dom.modalCloseBtn.addEventListener('click', fecharModais);
    dom.addPartCancelBtn.addEventListener('click', fecharModais);
    dom.editPartCancelBtn.addEventListener('click', fecharModais);
    
    // Salvar Modais CRUD
    dom.addPartSaveBtn.addEventListener('click', adicionarParticipante);
    dom.editPartSaveBtn.addEventListener('click', editarParticipante);
    dom.editPartDeleteBtn.addEventListener('click', excluirParticipante);
  }

  // ============================================
  // V2.1: COUNTER ANIMATION & TILT EFFECT
  // ============================================
  
  function animateCounter(element, target, suffix) {
    if (!element) return;
    suffix = suffix || '';
    const current = parseInt(element.textContent) || 0;
    
    if (current === target) {
      element.textContent = target + suffix;
      return;
    }
    
    if (window.gsap) {
      const obj = { val: current };
      gsap.to(obj, {
        val: target,
        duration: 0.8,
        ease: 'power2.out',
        onUpdate: () => {
          element.textContent = Math.round(obj.val) + suffix;
        }
      });
    } else {
      element.textContent = target + suffix;
    }
  }
  
  function setupTiltEffect() {
    const cards = document.querySelectorAll('[data-tilt]');
    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;
        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) scale(1.02)`;
      });
      
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  function initTheatre() {
    const isDev = window.location.hostname === 'localhost' || 
                  window.location.hostname === '127.0.0.1' || 
                  window.location.protocol === 'file:';
                  
    if (!window.Theatre) {
      console.log("Theatre.js não está disponível.");
      return;
    }

    if (isDev && window.Theatre.studio) {
      try {
        window.Theatre.studio.initialize();
      } catch (e) {
        console.error("Erro ao inicializar o Theatre Studio:", e);
      }
    }
    
    let savedState = null;
    const localStateStr = localStorage.getItem('theatre_fapi_state');
    if (localStateStr) {
      try {
        savedState = JSON.parse(localStateStr);
      } catch (e) {
        console.error("Erro ao fazer parse do estado salvo do Theatre:", e);
      }
    }
    
    try {
      theatreProj = window.Theatre.core.getProject('PainelIFMSA', { state: savedState });
      theatreSheet = theatreProj.sheet('Intro_Dashboard');
      
      if (isDev) {
        window.theatreProj = theatreProj;
        window.theatreSheet = theatreSheet;
      }
      
      // Registrar ator do cabeçalho e sidebar
      headerActor = theatreSheet.object('Header_Sidebar', {
        sidebarX: -80,
        sidebarOpacity: 0,
        headerY: -64,
        headerOpacity: 0
      });
      
      headerActor.onValuesChange((values) => {
        const sidebar = document.querySelector('.app-sidebar');
        const header = document.querySelector('.app-header');
        
        if (sidebar) {
          sidebar.style.transform = `translateX(${values.sidebarX}px)`;
          sidebar.style.opacity = values.sidebarOpacity;
        }
        if (header) {
          header.style.transform = `translateY(${values.headerY}px)`;
          header.style.opacity = values.headerOpacity;
        }
      });
      
      // Registrar ator dos cards do dashboard
      cardsActor = theatreSheet.object('Dashboard_Cards', {
        opacity: 0,
        scale: 0.9,
        yOffset: 30
      });
      
      cardsActor.onValuesChange((values) => {
        const cards = document.querySelectorAll('.stat-card');
        cards.forEach((card) => {
          card.style.opacity = values.opacity;
          card.style.transform = `scale(${values.scale}) translateY(${values.yOffset}px)`;
        });
      });
    } catch (err) {
      console.error("Erro ao inicializar o Theatre.js:", err);
    }
  }

  // ============================================
  // AUXILIARES E INTERFACE DE CONEXÃO
  // ============================================

  function showLoading(msg) {
    dom.loadingText.textContent = msg;
    dom.loadingOverlay.classList.remove('hidden');
  }

  function hideLoading() {
    dom.loadingOverlay.classList.add('hidden');
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    dom.toastContainer.appendChild(toast);
    
    // Remove toast after animation finishes
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
  }

  function updateConnectionStatusUI(status) {
    if (typeof status !== 'string') {
      status = navigator.onLine ? 'connected' : 'disconnected';
    }
    
    dom.statusDot.className = 'status-dot';
    
    if (status === 'connected') {
      dom.statusDot.classList.add('connected');
      dom.statusText.textContent = 'Sincronizado';
    } else if (status === 'connecting' || status === 'syncing') {
      dom.statusDot.classList.add('demo');
      dom.statusText.textContent = status === 'syncing' ? 'Sincronizando...' : 'Conectando...';
    } else {
      dom.statusText.textContent = 'Offline';
    }
  }

  function parseCheckinDate(dateStr) {
    if (!dateStr) return null;
    try {
      // Formato: dd/MM/yyyy HH:mm:ss
      const parts = dateStr.split(' ');
      const dateParts = parts[0].split('/');
      const timeParts = parts[1].split(':');
      
      return new Date(
        parseInt(dateParts[2]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[0]),
        parseInt(timeParts[0]),
        parseInt(timeParts[1]),
        parseInt(timeParts[2])
      );
    } catch(e) {
      return null;
    }
  }

  function formatTimeOnly(dateStr) {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split(' ');
      if (parts[1]) {
        const timeParts = parts[1].split(':');
        return `${timeParts[0]}:${timeParts[1]}`;
      }
    } catch(e) {}
    return dateStr;
  }

  // ============================================
  // SERVICE WORKER REGISTRATION
  // ============================================

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('ServiceWorker registrado com sucesso.'))
        .catch((err) => console.warn('Falha ao registrar ServiceWorker:', err));
    }
  }

  // ============================================
  // EXECUÇÃO INICIAL
  // ============================================
  
  // Garantir a inicialização ao terminar de carregar o DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
