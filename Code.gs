/**
 * Painel IFMSA Brazil FAPI — Google Apps Script Backend (V2)
 * 
 * INSTRUÇÕES DE INSTALAÇÃO:
 * 1. Abra sua planilha no Google Sheets
 * 2. Vá em Extensões → Apps Script
 * 3. Apague todo conteúdo e cole este código inteiro
 * 4. Clique em "Implantar" → "Nova implantação"
 * 5. Tipo: "App da Web"
 * 6. Executar como: "Eu"
 * 7. Quem tem acesso: "Qualquer pessoa"
 * 8. Clique em "Implantar" e copie a URL gerada
 * 9. Cole a URL no app EventCheck em Configurações
 */

// ============================================
// CONFIGURAÇÕES DO SISTEMA
// ============================================
const APP_PASSWORD = 'IFMSAFAPI123'; // Senha legada para compatibilidade de API

// ============================================
// HANDLERS HTTP (API)
// ============================================

function doGet(e) {
  try {
    var params = e.parameter;
    
    // Verificar Autenticação (Token do Google ou Senha)
    var auth = verificarAutorizacao(params, null);
    if (!auth.autorizado) {
      return jsonResponse({ status: 'unauthorized', message: 'Usuário não autorizado.' });
    }
    
    var action = params.action || 'list';
    var sheetName = params.sheetName || '';
    
    switch(action) {
      case 'list':
        return handleList(sheetName);
      case 'stats':
        return handleStats(sheetName);
      case 'list_events':
        return handleListEvents();
      default:
        return jsonResponse({ status: 'error', message: 'Ação desconhecida: ' + action });
    }
    
  } catch(err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Verificar Autenticação (Token do Google ou Senha)
    var auth = verificarAutorizacao(null, data);
    if (!auth.autorizado) {
      return jsonResponse({ status: 'unauthorized', message: 'Usuário não autorizado.' });
    }
    
    var action = data.action || '';
    var sheetName = data.sheetName || '';
    
    switch(action) {
      case 'checkin':
        return handleCheckin(data.id, sheetName);
      case 'generate_ids':
        return handleGenerateIds(sheetName);
      case 'add_participant':
        return handleAddParticipant(data.participant, sheetName);
      case 'edit_participant':
        return handleEditParticipant(data.participant, sheetName);
      case 'delete_participant':
        return handleDeleteParticipant(data.id, sheetName);
      case 'create_event':
        return handleCreateEvent(data.name);
      case 'send_emails':
        return handleSendEmails(sheetName);
      default:
        return jsonResponse({ status: 'error', message: 'Ação desconhecida: ' + action });
    }
    
  } catch(err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ============================================
// AUTENTICAÇÃO E AUTORIZAÇÃO
// ============================================

/**
 * Valida o token ID do Google com a API do Google OAuth2.
 */
function verificarGoogleToken(idToken) {
  if (!idToken) return null;
  try {
    var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken), {
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      return data.email;
    }
  } catch(err) {
    Logger.log("Erro ao validar token Google: " + err.toString());
  }
  return null;
}

/**
 * Verifica se a requisição está autorizada via token do Google ou senha.
 */
function verificarAutorizacao(params, postData) {
  var token = (params && params.googleToken) || (postData && postData.googleToken);
  var password = (params && params.password) || (postData && postData.password);
  
  // 1. Validar senha legada v1
  if (password === APP_PASSWORD) {
    return { autorizado: true, email: 'admin@legado.com', nome: 'Administrador Legado' };
  }
  
  // 2. Validar login individual do Google
  if (token) {
    var email = verificarGoogleToken(token);
    if (email) {
      email = email.toLowerCase().trim();
      
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var owner = ss.getOwner();
      var ownerEmail = owner ? owner.getEmail().toLowerCase().trim() : "";
      
      // Dono da planilha tem acesso irrestrito
      if (email === ownerEmail) {
        return { autorizado: true, email: email, nome: "Dono da Planilha" };
      }
      
      // Buscar na aba Config_Acesso
      var configSheet = ss.getSheetByName("Config_Acesso");
      if (configSheet) {
        var data = configSheet.getDataRange().getValues();
        for (var i = 1; i < data.length; i++) {
          var userEmail = (data[i][0] || '').toString().toLowerCase().trim();
          var userName = (data[i][1] || '').toString();
          if (userEmail === email) {
            return { autorizado: true, email: email, nome: userName || userEmail };
          }
        }
      } else {
        // Se a aba de controle não existir, cria automaticamente
        criarPlanilhaAcesso(ss, ownerEmail);
        if (email === ownerEmail) {
          return { autorizado: true, email: email, nome: "Dono da Planilha" };
        }
      }
    }
  }
  
  return { autorizado: false };
}

/**
 * Cria a planilha de acessos autorizados ocultando-a.
 */
function criarPlanilhaAcesso(ss, ownerEmail) {
  try {
    var sheet = ss.insertSheet("Config_Acesso");
    sheet.appendRow(["Email", "Nome"]);
    if (ownerEmail) {
      sheet.appendRow([ownerEmail, "Administrador Geral"]);
    }
    sheet.hideSheet();
  } catch(e) {
    Logger.log("Erro ao criar aba Config_Acesso: " + e.toString());
  }
}

// ============================================
// NAVEGAÇÃO DE ABAS & ROTAS (MULTI-EVENTOS)
// ============================================

/**
 * Retorna a planilha correspondente à aba ativa, criando o fallback se necessário.
 */
function obterPlanilhaAtiva(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) return sheet;
  }
  
  // Fallback para o primeiro sheet visível que não seja do sistema
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name !== "Config_Acesso" && name.toLowerCase().indexOf("respostas") === -1 && !sheets[i].isSheetHidden()) {
      return sheets[i];
    }
  }
  return ss.getActiveSheet();
}

/**
 * Lista todos os eventos disponíveis (abas da planilha)
 */
function handleListEvents() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var events = [];
  
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    // Ignorar abas ocultas e de controle/formulários
    if (name === "Config_Acesso" || name.toLowerCase().indexOf("respostas") > -1 || sheets[i].isSheetHidden()) {
      continue;
    }
    events.push(name);
  }
  
  return jsonResponse({ status: 'success', events: events });
}

// ============================================
// AÇÕES DO CONTROLADOR DE PARTICIPANTES
// ============================================

/**
 * Lista participantes de uma aba específica
 */
function handleList(sheetName) {
  var sheet = obterPlanilhaAtiva(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  
  if (data.length <= 1) {
    return jsonResponse({ 
      status: 'success', 
      participants: [], 
      stats: { total: 0, present: 0, absent: 0, percentage: 0 } 
    });
  }
  
  var participants = [];
  var present = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = row[0] || '';
    var email = row[1] || '';
    var institution = row[2] || '';
    var id = row[3] || '';
    var status = row[4] || '';
    var checkinDate = row[5] || '';
    var preForm = row[7] || '';
    var posForm = row[8] || '';
    
    if (!name && !email) continue;
    
    var isPresent = (status.toString().indexOf('Presente') > -1 || status.toString().indexOf('✅') > -1);
    if (isPresent) present++;
    
    participants.push({
      name: name.toString(),
      email: email.toString(),
      institution: institution.toString(),
      id: id.toString(),
      status: isPresent ? 'present' : 'absent',
      checkinDate: checkinDate ? checkinDate.toString() : '',
      preForm: (preForm.toString().indexOf('Respondido') > -1 || preForm.toString().indexOf('✅') > -1) ? 'yes' : 'no',
      posForm: (posForm.toString().indexOf('Respondido') > -1 || posForm.toString().indexOf('✅') > -1) ? 'yes' : 'no'
    });
  }
  
  var total = participants.length;
  var absent = total - present;
  var percentage = total > 0 ? Math.round((present / total) * 100) : 0;
  
  return jsonResponse({
    status: 'success',
    participants: participants,
    stats: {
      total: total,
      present: present,
      absent: absent,
      percentage: percentage
    }
  });
}

/**
 * Retorna as estatísticas de uma aba específica
 */
function handleStats(sheetName) {
  var sheet = obterPlanilhaAtiva(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  
  var total = 0;
  var present = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;
    total++;
    var status = row[4] || '';
    if (status.toString().indexOf('Presente') > -1 || status.toString().indexOf('✅') > -1) {
      present++;
    }
  }
  
  return jsonResponse({
    status: 'success',
    stats: {
      total: total,
      present: present,
      absent: total - present,
      percentage: total > 0 ? Math.round((present / total) * 100) : 0
    }
  });
}

/**
 * Registra o check-in do participante
 */
function handleCheckin(participantId, sheetName) {
  if (!participantId) {
    return jsonResponse({ status: 'error', message: 'ID do participante não fornecido' });
  }
  
  var sheet = obterPlanilhaAtiva(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  
  for (var i = 1; i < data.length; i++) {
    var rowId = (data[i][3] || '').toString().trim();
    
    if (rowId === participantId.toString().trim()) {
      var currentStatus = (data[i][4] || '').toString();
      var name = data[i][0].toString();
      
      if (currentStatus.indexOf('Presente') > -1 || currentStatus.indexOf('✅') > -1) {
        var checkinDate = data[i][5] || '';
        return jsonResponse({ 
          status: 'already_checked_in', 
          name: name,
          message: 'Presença já registrada' + (checkinDate ? ' em ' + checkinDate.toString() : '')
        });
      }
      
      var now = new Date();
      var formattedDate = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      
      sheet.getRange(i + 1, 5).setValue('✅ Presente');
      sheet.getRange(i + 1, 6).setValue("'" + formattedDate);
      
      return jsonResponse({ 
        status: 'success', 
        name: name,
        message: 'Check-in registrado às ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm')
      });
    }
  }
  
  return jsonResponse({ 
    status: 'not_found', 
    message: 'Participante não encontrado. ID: ' + participantId 
  });
}

/**
 * Gera IDs únicos nas colunas de uma aba específica
 */
function handleGenerateIds(sheetName) {
  var sheet = obterPlanilhaAtiva(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  var count = 0;
  
  // Alinhar e expandir cabeçalhos se necessário
  if (sheet.getLastColumn() < 9) {
    var headers = ["Nome", "Email", "Instituição", "ID_Unico", "Status", "Data_Checkin", "Email_Enviado", "Pre_Form", "Pos_Form"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0] || '';
    var existingId = (data[i][3] || '').toString().trim();
    
    if (name && !existingId) {
      var newId = generateUniqueId();
      sheet.getRange(i + 1, 4).setValue(newId);
      count++;
    }
  }
  
  return jsonResponse({ 
    status: 'success', 
    count: count,
    message: count + ' IDs gerados com sucesso na aba ' + sheet.getName()
  });
}

// ============================================
// OPERAÇÕES CRUD (PARTICIPANTES)
// ============================================

function handleAddParticipant(p, sheetName) {
  if (!p || !p.name || !p.email) {
    return jsonResponse({ status: 'error', message: 'Dados do participante incompletos.' });
  }
  
  var sheet = obterPlanilhaAtiva(sheetName);
  var id = p.id || generateUniqueId();
  
  // Garantir cabeçalhos mínimos até a coluna 9 (Formulários)
  if (sheet.getLastColumn() < 9) {
    var headers = ["Nome", "Email", "Instituição", "ID_Unico", "Status", "Data_Checkin", "Email_Enviado", "Pre_Form", "Pos_Form"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  
  var newRow = [
    p.name,
    p.email,
    p.institution || '',
    id,
    'Ausente',
    '',
    'Não',
    'Não',
    'Não'
  ];
  
  sheet.appendRow(newRow);
  return jsonResponse({ status: 'success', id: id, message: 'Participante adicionado com sucesso!' });
}

function handleEditParticipant(p, sheetName) {
  if (!p || !p.id) {
    return jsonResponse({ status: 'error', message: 'ID do participante não fornecido.' });
  }
  
  var sheet = obterPlanilhaAtiva(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  
  for (var i = 1; i < data.length; i++) {
    var rowId = (data[i][3] || '').toString().trim();
    if (rowId === p.id.toString().trim()) {
      if (p.name) sheet.getRange(i + 1, 1).setValue(p.name);
      if (p.email) sheet.getRange(i + 1, 2).setValue(p.email);
      if (p.institution !== undefined) sheet.getRange(i + 1, 3).setValue(p.institution);
      
      return jsonResponse({ status: 'success', message: 'Participante atualizado com sucesso!' });
    }
  }
  
  return jsonResponse({ status: 'not_found', message: 'Participante não encontrado.' });
}

function handleDeleteParticipant(participantId, sheetName) {
  if (!participantId) {
    return jsonResponse({ status: 'error', message: 'ID não fornecido.' });
  }
  
  var sheet = obterPlanilhaAtiva(sheetName);
  var data = sheet.getDataRange().getDisplayValues();
  
  for (var i = 1; i < data.length; i++) {
    var rowId = (data[i][3] || '').toString().trim();
    if (rowId === participantId.toString().trim()) {
      sheet.deleteRow(i + 1);
      return jsonResponse({ status: 'success', message: 'Participante excluído com sucesso!' });
    }
  }
  
  return jsonResponse({ status: 'not_found', message: 'Participante não encontrado.' });
}

function handleCreateEvent(eventName) {
  if (!eventName) {
    return jsonResponse({ status: 'error', message: 'Nome do evento vazio.' });
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(eventName)) {
    return jsonResponse({ status: 'error', message: 'Já existe um evento/aba com este nome.' });
  }
  
  var sheet = ss.insertSheet(eventName);
  var headers = ["Nome", "Email", "Instituição", "ID_Unico", "Status", "Data_Checkin", "Email_Enviado", "Pre_Form", "Pos_Form"];
  sheet.appendRow(headers);
  
  return jsonResponse({ status: 'success', message: 'Novo evento criado: ' + eventName });
}

// ============================================
// ENVIO DE EMAILS
// ============================================

function handleSendEmails(sheetName) {
  var count = enviarEmailsComQRCode(sheetName);
  return jsonResponse({ status: 'success', count: count, message: count + ' e-mails enviados com sucesso.' });
}

// ============================================
// UTILIDADES E MENU DA PLANILHA
// ============================================

function generateUniqueId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var id = 'EVT-';
  for (var i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('EventCheck 🎓')
    .addItem('🔑 Gerar IDs Únicos', 'menuGenerateIds')
    .addItem('🧪 Enviar QR Code de Teste (Murillo/Marcelo)', 'menuSendTestEmails')
    .addItem('✉️ Enviar QR Codes para Todos', 'menuSendAllEmails')
    .addToUi();
}

function menuGenerateIds() {
  var result = handleGenerateIds(null);
  SpreadsheetApp.getUi().alert(result.message);
}

function menuSendTestEmails() {
  handleGenerateIds(null);
  enviarEmailsTeste();
}

function menuSendAllEmails() {
  handleGenerateIds(null);
  var count = enviarEmailsComQRCode(null);
  SpreadsheetApp.getUi().alert("Processo concluído! " + count + " e-mails enviados com sucesso.");
}

// ============================================
// ENVIO DE E-MAILS COM QR CODE E TEMPLATES
// ============================================

function enviarEmailsComQRCode(sheetName) {
  var sheet = obterPlanilhaAtiva(sheetName);
  var data = sheet.getDataRange().getValues();
  
  if (data[0].length < 7 || data[0][6] !== 'Email_Enviado') {
    // Garantir cabeçalhos mínimos
    handleGenerateIds(sheet.getName());
    data = sheet.getDataRange().getValues();
  }
  
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var nome = row[0] || '';
    var email = row[1] || '';
    var idUnico = row[3] || '';
    var statusEmail = row[6] || '';
    
    if (!nome || !email || !idUnico || statusEmail.toString().trim() === 'Sim') {
      continue;
    }
    
    var qrCodeUrl = "https://quickchart.io/qr?text=" + encodeURIComponent(idUnico) + "&size=250";
    var assunto = "QRCode de presença";
    var corpoHtml = obterCorpoHtmlEmail(nome, idUnico, qrCodeUrl, false);
    
    try {
      GmailApp.sendEmail(email, assunto, "Use HTML para ver o QR Code. Código: " + idUnico, { htmlBody: corpoHtml });
      sheet.getRange(i + 1, 7).setValue('Sim');
      count++;
      Utilities.sleep(500); 
    } catch(err) {
      Logger.log("Erro ao enviar para " + email + ": " + err.toString());
    }
  }
  return count;
}

function enviarEmailsTeste() {
  var sheet = obterPlanilhaAtiva(null);
  var data = sheet.getDataRange().getValues();
  
  var namesToTest = ["MURILLO MIKOS", "MARCELO YUZO HATANAKA NEVES"];
  var count = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var nomeOriginal = row[0] || '';
    var nomeComparacao = nomeOriginal.toString().trim().toUpperCase();
    var email = row[1] || '';
    var idUnico = row[3] || '';
    
    var isMurillo = nomeComparacao.indexOf("MURILLO") > -1;
    var isMarcelo = nomeComparacao.indexOf("MARCELO") > -1 && 
                    (nomeComparacao.indexOf("YUZO") > -1 || nomeComparacao.indexOf("HATANAKA") > -1 || nomeComparacao.indexOf("NEVES") > -1);
    
    if (!isMurillo && !isMarcelo) {
      continue;
    }
    
    if (!email || !idUnico) continue;
    
    var qrCodeUrl = "https://quickchart.io/qr?text=" + encodeURIComponent(idUnico) + "&size=250";
    var assunto = "QRCode de presença";
    var corpoHtml = obterCorpoHtmlEmail(nomeOriginal, idUnico, qrCodeUrl, true);
    
    try {
      GmailApp.sendEmail(email, assunto, "Teste QR Code. Código: " + idUnico, { htmlBody: corpoHtml });
      sheet.getRange(i + 1, 7).setValue('Sim (Teste)');
      count++;
      Utilities.sleep(500);
    } catch(err) {
      Logger.log("Erro ao enviar teste para " + email + ": " + err.toString());
    }
  }
  SpreadsheetApp.getUi().alert("Teste concluído! " + count + " e-mails de teste enviados.");
}

function obterCorpoHtmlEmail(nome, idUnico, qrCodeUrl, isTeste) {
  var bannerColor = "#0b1a30"; // Azul escuro cirúrgico/tecnológico
  
  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 550px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #f8fafc; padding: 0; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); overflow: hidden;">
      
      <!-- Cabeçalho / Banner do Evento -->
      <div style="background: linear-gradient(135deg, ${bannerColor} 0%, #1e3a8a 100%); padding: 35px 25px; text-align: center; color: #ffffff; border-radius: 16px 16px 0 0;">
        <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #93c5fd; margin-bottom: 8px; font-weight: 700;">Credenciamento Digital</div>
        <h1 style="font-size: 20px; font-weight: 800; margin: 0; line-height: 1.4; color: #ffffff; letter-spacing: -0.5px;">
          Simpósio de Impressão 3D &<br>Bioimpressão em Neurocirurgia
        </h1>
      </div>
      
      <!-- Corpo Principal -->
      <div style="padding: 30px 25px; background-color: #ffffff;">
        <p style="font-size: 18px; color: #0f172a; margin: 0 0 8px 0; font-weight: 700;">Olá, <strong>${nome}</strong>!</p>
        
        <div style="display: inline-block; background-color: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 6px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px;">
          ✓ INSCRIÇÃO CONFIRMADA
        </div>
        
        <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 25px 0;">
          Sua inscrição foi registrada com sucesso. Abaixo está o seu <strong>QR Code de Presença</strong> único. Apresente este código na recepção do evento para registrar sua presença.
        </p>
        
        <!-- Cartão do QR Code -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 25px; text-align: center; margin-bottom: 25px;">
          <img src="${qrCodeUrl}" alt="QR Code de Credenciamento" style="width: 200px; height: 200px; display: block; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; background-color: #ffffff;" />
          <div style="font-family: 'Courier New', Courier, monospace; font-size: 20px; font-weight: bold; color: #0f172a; margin-top: 15px; letter-spacing: 3px;">
            ${idUnico}
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Código de Inscrição Único</div>
        </div>
        
        <!-- Painel de Informações Adicionais -->
        <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 13px; color: #475569;">
          <div style="margin-bottom: 10px;">
            <strong style="color: #0f172a;">Data:</strong> 10 de Junho de 2026
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #0f172a;">Horário:</strong> 19:30
          </div>
          <div style="margin-bottom: 10px;">
            <strong style="color: #0f172a;">Local:</strong> Auditório da FAPI 2º andar
          </div>
        </div>
        
      </div>
      
      <!-- Rodapé -->
      <div style="background-color: #f1f5f9; padding: 20px 25px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; border-radius: 0 0 16px 16px;">
        Por favor, não responda diretamente a este e-mail.
      </div>
    </div>
  `;
}

function disparadorAutomatico(e) {
  Utilities.sleep(1000); 
  handleGenerateIds(null);
  enviarEmailsComQRCode(null);
}

/**
 * Gatilho automático executado ao enviar um formulário integrado na planilha.
 */
function aoEnviarFormulario(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    var sheetName = sheet.getName();
    var rowValues = range.getValues()[0];
    
    var emailSubmetido = rowValues[1]; 
    if (!emailSubmetido) return;
    
    emailSubmetido = emailSubmetido.toString().trim().toLowerCase();
    
    var mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Página1") || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var data = mainSheet.getDataRange().getValues();
    
    var colunaAlvo = -1;
    if (sheetName.toLowerCase().indexOf("pre") > -1) {
      colunaAlvo = 8; // Coluna H
    } else if (sheetName.toLowerCase().indexOf("pos") > -1) {
      colunaAlvo = 9; // Coluna I
    }
    
    if (colunaAlvo === -1) return;
    
    for (var i = 1; i < data.length; i++) {
      var emailCadastrado = (data[i][1] || '').toString().trim().toLowerCase();
      if (emailCadastrado === emailSubmetido) {
        mainSheet.getRange(i + 1, colunaAlvo).setValue("✅ Respondido");
        break;
      }
    }
  } catch(err) {
    Logger.log("Erro no gatilho do formulário: " + err.toString());
  }
}
