/**
 * EventCheck — Google Apps Script Backend
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
 *
 * FORMATO DA PLANILHA (primeira aba):
 * Coluna A: Nome
 * Coluna B: Email
 * Coluna C: Instituição
 * Coluna D: ID_Unico (gerado automaticamente)
 * Coluna E: Status (preenchido pelo app)
 * Coluna F: Data_Checkin (preenchido pelo app)
 *
 * A primeira linha deve ser o cabeçalho.
 */

// ============================================
// CONFIGURAÇÃO
// ============================================
const APP_PASSWORD = 'IFMSAFAPI123';

// ============================================
// HANDLERS HTTP
// ============================================

function doGet(e) {
  try {
    var params = e.parameter;
    
    // Verificar senha
    if (params.password !== APP_PASSWORD) {
      return jsonResponse({ status: 'unauthorized', message: 'Senha incorreta' });
    }
    
    var action = params.action || 'list';
    
    switch(action) {
      case 'list':
        return handleList();
      case 'stats':
        return handleStats();
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
    
    // Verificar senha
    if (data.password !== APP_PASSWORD) {
      return jsonResponse({ status: 'unauthorized', message: 'Senha incorreta' });
    }
    
    var action = data.action || '';
    
    switch(action) {
      case 'checkin':
        return handleCheckin(data.id);
      case 'generate_ids':
        return handleGenerateIds();
      default:
        return jsonResponse({ status: 'error', message: 'Ação desconhecida: ' + action });
    }
    
  } catch(err) {
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

// ============================================
// AÇÕES
// ============================================

/**
 * Lista todos os participantes
 */
function handleList() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
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
  var total = data.length - 1; // Exclui cabeçalho
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = row[0] || '';
    var email = row[1] || '';
    var institution = row[2] || '';
    var id = row[3] || '';
    var status = row[4] || '';
    var checkinDate = row[5] || '';
    
    // Pular linhas vazias
    if (!name && !email) continue;
    
    var isPresent = (status.toString().indexOf('Presente') > -1 || status.toString().indexOf('✅') > -1);
    if (isPresent) present++;
    
    participants.push({
      name: name.toString(),
      email: email.toString(),
      institution: institution.toString(),
      id: id.toString(),
      status: isPresent ? 'present' : 'absent',
      checkinDate: checkinDate ? checkinDate.toString() : ''
    });
  }
  
  // Recalcular total excluindo linhas vazias
  total = participants.length;
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
 * Retorna apenas as estatísticas
 */
function handleStats() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getDisplayValues();
  
  var total = 0;
  var present = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue; // Pular linhas vazias
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
 * Registra check-in de um participante
 */
function handleCheckin(participantId) {
  if (!participantId) {
    return jsonResponse({ status: 'error', message: 'ID do participante não fornecido' });
  }
  
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getDisplayValues();
  
  for (var i = 1; i < data.length; i++) {
    var rowId = (data[i][3] || '').toString().trim();
    
    if (rowId === participantId.toString().trim()) {
      var currentStatus = (data[i][4] || '').toString();
      var name = data[i][0].toString();
      
      // Verificar se já fez check-in
      if (currentStatus.indexOf('Presente') > -1 || currentStatus.indexOf('✅') > -1) {
        var checkinDate = data[i][5] || '';
        return jsonResponse({ 
          status: 'already_checked_in', 
          name: name,
          message: 'Participante já registrado' + (checkinDate ? ' em ' + checkinDate.toString() : '')
        });
      }
      
      // Registrar presença
      var now = new Date();
      var formattedDate = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      
      sheet.getRange(i + 1, 5).setValue('✅ Presente');  // Coluna E
      sheet.getRange(i + 1, 6).setValue("'" + formattedDate);    // Coluna F
      
      return jsonResponse({ 
        status: 'success', 
        name: name,
        message: 'Check-in registrado com sucesso às ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm')
      });
    }
  }
  
  return jsonResponse({ 
    status: 'not_found', 
    message: 'Participante não encontrado. ID: ' + participantId 
  });
}

/**
 * Gera IDs únicos para participantes que não possuem
 */
function handleGenerateIds() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getDisplayValues();
  var count = 0;
  
  // Verificar se a primeira linha tem cabeçalho na coluna D
  if (data.length > 0 && !data[0][3]) {
    sheet.getRange(1, 4).setValue('ID_Unico');
  }
  if (data.length > 0 && !data[0][4]) {
    sheet.getRange(1, 5).setValue('Status');
  }
  if (data.length > 0 && !data[0][5]) {
    sheet.getRange(1, 6).setValue('Data_Checkin');
  }
  
  for (var i = 1; i < data.length; i++) {
    var name = data[i][0] || '';
    var existingId = (data[i][3] || '').toString().trim();
    
    // Gerar ID apenas se a linha tem nome e não tem ID
    if (name && !existingId) {
      var newId = generateUniqueId();
      sheet.getRange(i + 1, 4).setValue(newId);
      count++;
    }
  }
  
  return jsonResponse({ 
    status: 'success', 
    count: count,
    message: count + ' IDs gerados com sucesso'
  });
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Gera um ID único no formato EVT-XXXXXX
 */
function generateUniqueId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var id = 'EVT-';
  for (var i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

/**
 * Retorna uma resposta JSON formatada
 */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// ENVIO DE E-MAILS COM QR CODE
// ============================================

/**
 * Cria um menu personalizado na planilha para gerenciamento e testes
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('EventCheck 🎓')
    .addItem('🔑 Gerar IDs Únicos', 'menuGenerateIds')
    .addItem('🧪 Enviar QR Code de Teste (Murillo/Marcelo)', 'menuSendTestEmails')
    .addItem('✉️ Enviar QR Codes para Todos', 'menuSendAllEmails')
    .addToUi();
}

function menuGenerateIds() {
  var result = handleGenerateIds();
  SpreadsheetApp.getUi().alert(result.message);
}

function menuSendTestEmails() {
  handleGenerateIds();
  enviarEmailsTeste();
}

function menuSendAllEmails() {
  handleGenerateIds();
  var count = enviarEmailsComQRCode();
  SpreadsheetApp.getUi().alert("Processo concluído! " + count + " e-mails enviados com sucesso.");
}

/**
 * Envia e-mails para todos da lista que ainda não receberam
 */
function enviarEmailsComQRCode() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data[0].length < 7 || data[0][6] !== 'Email_Enviado') {
    sheet.getRange(1, 7).setValue('Email_Enviado');
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

/**
 * Envia e-mails de teste apenas para MURILLO MIKOS e MARCELO YUZO HATANAKA NEVES
 */
function enviarEmailsTeste() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data[0].length < 7 || data[0][6] !== 'Email_Enviado') {
    sheet.getRange(1, 7).setValue('Email_Enviado');
  }
  
  var nomesTeste = ["MURILLO MIKOS", "MARCELO YUZO HATANAKA NEVES"];
  var count = 0;
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var nomeOriginal = row[0] || '';
    var nomeComparacao = nomeOriginal.toString().trim().toUpperCase();
    var email = row[1] || '';
    var idUnico = row[3] || '';
    
    if (nomeOriginal) {
      Logger.log("Analisando linha " + (i + 1) + ": '" + nomeComparacao + "'");
    }
    
    // Envia apenas se bater com os nomes de teste (busca flexível contendo partes dos nomes)
    var isMurillo = nomeComparacao.indexOf("MURILLO") > -1;
    var isMarcelo = nomeComparacao.indexOf("MARCELO") > -1 && 
                    (nomeComparacao.indexOf("YUZO") > -1 || nomeComparacao.indexOf("HATANAKA") > -1 || nomeComparacao.indexOf("NEVES") > -1);
    
    if (!isMurillo && !isMarcelo) {
      continue;
    }
    
    if (!email || !idUnico) {
      Logger.log("Aviso: " + nomeOriginal + " encontrado, mas sem email ou ID_Unico.");
      continue;
    }
    
    var qrCodeUrl = "https://quickchart.io/qr?text=" + encodeURIComponent(idUnico) + "&size=250";
    var assunto = "QRCode de presença";
    var corpoHtml = obterCorpoHtmlEmail(nomeOriginal, idUnico, qrCodeUrl, true);
    
    try {
      GmailApp.sendEmail(email, assunto, "Teste QR Code. Código: " + idUnico, { htmlBody: corpoHtml });
      sheet.getRange(i + 1, 7).setValue('Sim (Teste)');
      count++;
      Logger.log("E-mail de teste enviado para: " + email);
      Utilities.sleep(500);
    } catch(err) {
      Logger.log("Erro ao enviar teste para " + email + ": " + err.toString());
    }
  }
  
  SpreadsheetApp.getUi().alert("Teste concluído! " + count + " e-mails de teste enviados.");
}

/**
 * Retorna o template HTML do e-mail
 */
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
  handleGenerateIds();
  enviarEmailsComQRCode();
}

/**
 * Gatilho automático executado ao enviar um formulário integrado na planilha.
 * Atualiza as colunas H (Pré-Form) e I (Pós-Form) na aba principal.
 */
function aoEnviarFormulario(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    var sheetName = sheet.getName();
    
    // Captura os valores da resposta enviada
    var rowValues = range.getValues()[0];
    
    // Assume que a coluna de e-mail é a segunda coluna (B) do formulário
    var emailSubmetido = rowValues[1]; 
    if (!emailSubmetido) return;
    
    emailSubmetido = emailSubmetido.toString().trim().toLowerCase();
    
    var mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Página1") || SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var data = mainSheet.getDataRange().getValues();
    
    // Identifica se é Pré ou Pós pelo nome da aba
    var colunaAlvo = -1;
    if (sheetName.toLowerCase().indexOf("pre") > -1) {
      colunaAlvo = 8; // Coluna H
    } else if (sheetName.toLowerCase().indexOf("pos") > -1) {
      colunaAlvo = 9; // Coluna I
    }
    
    if (colunaAlvo === -1) return;
    
    // Busca o participante e marca como respondido
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
