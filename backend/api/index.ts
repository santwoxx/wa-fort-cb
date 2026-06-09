import express from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { requireAuth, requirePermission, requireRole, requireAnyRole, protectCriticalFields, auditLog, enforceSoftDelete, AuthenticatedRequest } from './rbacMiddleware';
import { getFirestoreAdmin, getAuthAdmin, setCustomUserClaims, forceTokenRefresh } from './backendAuth';
import { FieldValue } from 'firebase-admin/firestore';
import { ROLE_PERMISSIONS, UserRole, FINANCEIRO_PROTECTED_FIELDS } from '../types';

const upload = multer({ dest: 'uploads/' });

dotenv.config();

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.includes('MY_KEY')) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build-vercel',
        }
      }
    });
  }
  return aiClient;
}

function getFallbackMessage(
  name: string,
  amount: number,
  dueDate: string,
  daysOverdue: number,
  description: string,
  tone: string,
  companyName: string,
  paymentMethods: string,
  pixKey?: string,
  customTemplate?: string
): string {
  const formattedAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
  let formattedDate = dueDate;
  try {
    const parts = dueDate.split('-');
    if (parts.length === 3) {
      formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  } catch (e) {}

  const signOff = `*Setor Financeiro - ${companyName}*\n📞 Suporte Técnico e Financeiro`;
  const paymentDetails = pixKey
    ? `Chave Pix para pagamento:\n🔑 \`${pixKey}\``
    : `Formas de pagamento aceitas: ${paymentMethods}.`;

  if (customTemplate && customTemplate.trim()) {
    return customTemplate
      .replace(/\{\{cliente\}\}/gi, name)
      .replace(/\{\{valor\}\}/gi, formattedAmount)
      .replace(/\{\{vencimento\}\}/gi, formattedDate)
      .replace(/\{\{servico\}\}/gi, description)
      .replace(/\{\{chave_pix\}\}/gi, pixKey || 'financeiro@wafort.com.br')
      .replace(/\{\{empresa\}\}/gi, companyName);
  }

  switch (tone) {
    case 'friendly':
      return `Olá, ${name}! Tudo bem?\n\nPassando para lembrar que a sua fatura ou mensalidade de *${description}*, no valor de *${formattedAmount}*, venceu em *${formattedDate}*. 🌟\n\nSabemos que a rotina é corrida e pode ter passado despercebido. Se precisar da linha digitável ou do link Pix, estamos aqui para ajudar!\n\n${paymentDetails}\n\nSe você já realizou o pagamento, pedimos que desconsidere esta mensagem ou nos enviar o comprovante para darmos a baixa. Obrigado pela parceria!\n\nAtenciosamente,\n${signOff}`;
    case 'urgent':
      return `⚠️ *AVISO IMPORTANTE - ${companyName.toUpperCase()}*\n\nPrezado(a) ${name},\n\nConstatamos em nosso sistema que a mensalidade de *${description}* com vencimento em *${formattedDate}* (*${daysOverdue} dias de atraso*), no valor de *${formattedAmount}*, continua pendente de pagamento.\n\nLembramos que o atraso prolongado pode resultar na *suspensão temporária dos serviços contratados* da WA Fort e inclusão em cadastros de crédito.\n\nEvite a suspensão do seu sinal de internet/serviço realizatando a quitação imediata.\n\n${paymentDetails}\n\nPor favor, envie o comprovante assim que concluir para reativação imediata.\n\n${signOff}`;
    case 'negotiation':
      return `Olá, ${name}! Esperamos que esteja bem.\n\nIdentificamos uma pendência de *${formattedAmount}* vencida em *${formattedDate}* referente a *${description}*.\n\nNa *${companyName}*, valorizamos muito você como cliente. Pensando nisso, preparamos condições super especiais e facilitadas para você regularizar a sua situação ainda hoje, sem juros adicionais ou multas abusivas.\n\n${paymentDetails}\n\nPor favor, responda a esta mensagem com a palavra *ACORDO* para falar com um atendente e ver as opções de parcelamento. Vamos resolver isso juntos!\n\nAbraços,\n${signOff}`;
    case 'formal':
    default:
      return `Prezado(a) ${name},\n\nEntramos em contato para informar sobre o débito pendente em nosso sistema, referente a *${description}*, no valor de *${formattedAmount}*, com vencimento original em *${formattedDate}*.\n\nSolicitamos a regularização do débito para evitar cobranças adicionais e interrupções em seus serviços adquiridos.\n\n${paymentDetails}\n\nCaso já tenha efetuado o pagamento, por gentileza, nos envie uma foto ou arquivo do comprovante in resposta a este atendimento.\n\nPermanecemos à disposição para quaisquer esclarecimentos.\n\nAtenciosamente,\n${signOff}`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// HELPER DE AUDITORIA (FASE 3)
// ═══════════════════════════════════════════════════════════════════
async function logAudit(
  dbAdmin: any,
  req: AuthenticatedRequest,
  entidade: string,
  entidadeId: string,
  acao: string,
  dadosAnteriores: any,
  dadosNovos: any
) {
  try {
    const ip = (req.headers['x-forwarded-for'] as string || req.ip || '127.0.0.1').split(',')[0].trim();
    const userAgent = req.headers['user-agent'] || '';
    const empresaId = req.user!.empresaId || 'empresa-default';

    await dbAdmin.collection('auditoria').add({
      entidade,
      entidadeId,
      acao,
      operadorId: req.user!.uid,
      operadorNome: req.user!.nome || 'Operador',
      ip,
      userAgent,
      dadosAnteriores: dadosAnteriores || null,
      dadosNovos: dadosNovos || null,
      empresaId,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Audit] Falha ao gravar log:', err);
  }
}

// ═══════════════════════════════════════════════════════════════════
// GEMINI: EXTRAÇÃO E GERAÇÃO DE MENSAGENS
// ═══════════════════════════════════════════════════════════════════

app.post('/api/extract-debtors', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'O texto para extração está vazio.' });
    }

    const client = getGeminiClient();
    if (!client) {
      return res.json({
        debtors: [{
          name: 'Cliente Exemplo de Teste',
          phone: '5511999998888',
          amount: 350.00,
          dueDate: '2026-06-15',
          description: 'Cobrança extraída via fallback offline'
        }],
        source: 'fallback'
      });
    }

    const systemInstruction = `Você é um assessor inteligente de estruturação de dados de cobrança e conciliação para a WA Fort.
Sua tarefa é analisar o texto desestruturado enviado pelo usuário (copiado de notas, PDFs, relatórios brutos de faturas, e-mails ou anotações manuais) e extrair os devedores em formato estruturado.
Diretrizes:
1. Extraia o nome completo do cliente devedor.
2. Identifique o telefone/WhatsApp. Remova qualquer formatação de símbolos e guarde apenas números. O formato correto deve incluir DDD brasileiro (ex.: 11999998888 ou 2198888777). Se já vier com DDI '55' no início, ok.
3. Extraia o valor líquido atual de débito do inadimplente como valor numérico simples (float). Ex.: se for R$ 1.250,54, extraia como 1250.54.
4. Extraia a data de vencimento correspondente. Formate-a obrigatoriamente no padrão ISO de data: YYYY-MM-DD (ex.: 2026-05-15). Caso não encontre de forma alguma a data de vencimento no texto, utilize "2026-05-15" como padrão coerente de faturamentos recentes.
5. Extraia uma descrição resumida da fatura, serviço ou produto em aberto do cliente (Ex: "Assinatura Banda Larga", "Mensalidade Câmeras"). Se não houver, utilize "Mensalidade WA Fort".`;

    const userPrompt = `Por favor, faça a leitura atenta do seguinte documento ou texto e extraia todos os registros válidos de inadimplentes encontrados no formato JSON especificado pelo esquema:
"""
${text}
"""`;

    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            debtors: {
              type: Type.ARRAY,
              description: 'Lista estruturada dos contatos inadimplentes encontrados no texto',
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'Nome completo do cliente' },
                  phone: { type: Type.STRING, description: 'Apenas dígitos do telefone com DDD (ex: 11988887777)' },
                  amount: { type: Type.NUMBER, description: 'Valor float da pendência em aberto' },
                  dueDate: { type: Type.STRING, description: 'Data de vencimento formatada no padrão YYYY-MM-DD' },
                  description: { type: Type.STRING, description: 'Serviço, produto ou fatura em atraso' }
                },
                required: ['name', 'phone', 'amount', 'dueDate']
              }
            }
          },
          required: ['debtors']
        }
      }
    });

    const resultText = response.text?.trim() || '{}';
    const parsedData = JSON.parse(resultText);
    res.json({ debtors: parsedData.debtors || [], source: 'gemini' });
  } catch (error: any) {
    console.error('Erro no endpoint /api/extract-debtors:', error);
    res.status(550).json({ error: error?.message || 'Internal server error' });
  }
});

app.post('/api/generate-message', requireAuth, requirePermission('Editar'), async (req: AuthenticatedRequest, res) => {
  try {
    const {
      name, amount, dueDate, daysOverdue, description, tone = 'formal',
      companyName = 'WA Fort', paymentMethods = 'Pix, Boleto Bancário',
      pixKey = '', customSignature = '',
      customFriendlyPrompt = '', customFormalPrompt = '', customUrgentPrompt = '', customNegotiationPrompt = '',
      customFriendlyTemplate = '', customFormalTemplate = '', customUrgentTemplate = '', customNegotiationTemplate = ''
    } = req.body;

    if (!name || amount === undefined || !dueDate) {
      return res.status(400).json({ error: 'Missing required fields: name, amount, and dueDate are required.' });
    }

    let activeTemplate = '';
    if (tone === 'friendly') activeTemplate = customFriendlyTemplate;
    else if (tone === 'urgent') activeTemplate = customUrgentTemplate;
    else if (tone === 'negotiation') activeTemplate = customNegotiationTemplate;
    else activeTemplate = customFormalTemplate;

    const client = getGeminiClient();

    if (!client) {
      const fallback = getFallbackMessage(name, amount, dueDate, daysOverdue || 0, description || 'Serviço WA Fort', tone, companyName, paymentMethods, pixKey, activeTemplate);
      return res.json({ text: fallback, source: 'fallback' });
    }

    const formattedAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);

    let toneInstruction = '';
    switch (tone) {
      case 'friendly':
        toneInstruction = customFriendlyPrompt || 'Seja leve, amigável e cortês. Trate como um lembrete sutil, pois o cliente pode apenas ter esquecido devido à rotina. Use emojis amigáveis de forma comedida.';
        break;
      case 'urgent':
        toneInstruction = customUrgentPrompt || 'Seja sério, direto, formal e use um tom de aviso importante/alerta de urgência física ou contratual. Mencione educadamente que o atraso prolongado pode suspender temporariamente os serviços da WA Fort ou gerar encargos, encorajando a resolução rápida.';
        break;
      case 'negotiation':
        toneInstruction = customNegotiationPrompt || 'Foque na flexibilidade, acolhimento e oferta de acordo ou parcelamento facilitado. Mostre que a empresa quer ajudar o parceiro/cliente e manter o relacionamento. Ofereça opções amigáveis.';
        break;
      case 'formal':
      default:
        toneInstruction = customFormalPrompt || 'Seja estritamente profissional, claro, corporativo e polido. Use termos financeiros corretos, mantendo um tom firme de cobrança formal respeitosa.';
        break;
    }

    const systemInstruction = `Você é um gestor de cobranças e recuperação de crédito altamente qualificado e cortês da empresa "WA Fort" (uma renomada empresa brasileira de serviços de telecomunicação, internet, conexões rápidas e soluções inteligentes).
Sua missão é gerar mensagens excepcionais para envio individual via WhatsApp para clientes que estão inadimplentes (com faturas atrasadas).
Siga EXCLUSIVAMENTE estas restrições:
1. Responda apenas com a mensagem pronta de cobrança, nada mais de conversa ou introdução.
2. Escreva em Português do Brasil de forma extremamente fluida e natural.
3. Não use placeholders como '[Nome]', substitua tudo diretamente com as variáveis fornecidas.
4. Use formatações do WhatsApp como asteriscos de negrito (*palavra*) de forma profissional para dar destaque a faturas, valores e vencimentos.
5. Sempre insira as informações de pagamento contratadas (Pix, boleto, etc) de forma limpa.
6. Assine profissionalmente no final com o setor financeiro da WA Fort o nome da empresa.
7. Mantenha os parágrafos curtos, ideais para leitura rápida na tela do celular.`;

    let userPrompt = `Gere uma mensagem de cobrança no WhatsApp para este cliente com as seguintes informações:
- Cliente: ${name}
- Valor do Débito: ${formattedAmount}
- Vencimento Original: ${dueDate} (Converta para o formato DD/MM/AAAA se estiver em outro formato)
- Dias de Atraso: ${daysOverdue || 0} dias
- Referente a: ${description || 'Mensalidade WA Fort'}
- Tom da mensagem: ${tone ? tone.toUpperCase() : 'FORMAL'} (${toneInstruction})
- Métodos de pagamento aceitos: ${paymentMethods}
${pixKey ? `- Chave Pix de Pagamento: ${pixKey}` : ''}
${customSignature ? `- Assinatura personalizada a incluir no final: ${customSignature}` : ''}`;

    if (activeTemplate && activeTemplate.trim()) {
      userPrompt += `\n\nATENÇÃO: O usuário definiu um modelo global preferencial de mensagem para este tom. Use este modelo como esqueleto/estrutura de referência, substituindo as tags correspondentes e aprimorando levemente o fluxo textual profissional conforme necessário:\n"""\n${activeTemplate}\n"""`;
    }

    userPrompt += `\n\nLembrete de tom: Gere apenas a mensagem final refinada e pronta para o WhatsApp. Não coloque aspas nem introduções no início ou no fim.`;

    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.8,
      }
    });

    res.json({ text: response.text?.trim() || 'Erro ao obter resposta da IA.', source: 'gemini' });
  } catch (error: any) {
    console.error('Gemini API server error:', error);
    res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 1: USER PROFILE & RBAC CLAIMS SYNCHRONIZATION
// ═══════════════════════════════════════════════════════════════════

app.get('/api/users/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({ user: req.user });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    let profileData: any = null;
    const userDoc = await dbAdmin.collection('usuarios').doc(req.user!.uid).get();

    if (userDoc.exists) {
      profileData = userDoc.data();
    } else {
      const emailToFind = req.user!.email.trim().toLowerCase();
      const isWhitelist = emailToFind === 'financeiro@wafort.com.br' || emailToFind === 'brisasofc@gmail.com';
      const emailQuery = await dbAdmin.collection('usuarios')
        .where('email', '==', emailToFind)
        .limit(1)
        .get();

      if (!emailQuery.empty || isWhitelist) {
        const preApprovedDoc = !emailQuery.empty ? emailQuery.docs[0] : null;
        const preApprovedData = preApprovedDoc ? preApprovedDoc.data() : {
          nome: emailToFind === 'brisasofc@gmail.com' ? 'Administrador Principal' : 'Operador Financeiro',
          role: emailToFind === 'brisasofc@gmail.com' ? 'Administrador' : 'Financeiro',
          permissoes: ROLE_PERMISSIONS[emailToFind === 'brisasofc@gmail.com' ? 'Administrador' : 'Financeiro'],
          empresaId: 'empresa-default'
        };

        profileData = {
          nome: preApprovedData.nome || req.user!.nome || 'Operador',
          email: emailToFind,
          role: preApprovedData.role || 'Operador',
          permissoes: preApprovedData.permissoes || ROLE_PERMISSIONS[(preApprovedData.role || 'Operador') as UserRole],
          empresaId: preApprovedData.empresaId || 'empresa-default'
        };

        await dbAdmin.collection('usuarios').doc(req.user!.uid).set(profileData);

        if (preApprovedDoc && preApprovedDoc.id !== req.user!.uid) {
          await dbAdmin.collection('usuarios').doc(preApprovedDoc.id).delete();
        }
      } else {
        const allUsersSnap = await dbAdmin.collection('usuarios').limit(1).get();
        if (allUsersSnap.empty) {
          profileData = {
            nome: req.user!.nome || 'Administrador Inicial',
            email: emailToFind,
            role: 'Administrador',
            permissoes: ROLE_PERMISSIONS['Administrador'],
            empresaId: 'empresa-default'
          };
          await dbAdmin.collection('usuarios').doc(req.user!.uid).set(profileData);
        }
      }
    }

    if (!profileData) {
      console.warn(`[RBAC Security] Rejected login: ${req.user!.email}`);
      return res.status(403).json({
        error: 'Este e-mail não está pré-aprovado ou cadastrado no sistema. Solicite acesso ao administrador.'
      });
    }

    let databaseEmpresaId = profileData.empresaId;
    if (!databaseEmpresaId) {
      databaseEmpresaId = 'empresa-default';
      profileData.empresaId = databaseEmpresaId;
      await dbAdmin.collection('usuarios').doc(req.user!.uid).update({ empresaId: databaseEmpresaId }).catch(() => {});
    }

    // FASE 1: Verifica se as Custom Claims estão sincronizadas
    const tokenClaims = req.user!;
    const databaseRole = profileData.role;
    const databasePerms = profileData.permissoes || [];

    const claimsMatch = tokenClaims.role === databaseRole &&
      Array.isArray(tokenClaims.permissoes) &&
      JSON.stringify([...tokenClaims.permissoes].sort()) === JSON.stringify([...databasePerms].sort()) &&
      tokenClaims.empresaId === databaseEmpresaId;

    const clientIp = (req.headers['x-forwarded-for'] as string || req.ip || '127.0.0.1').split(',')[0].trim();
    const userAgent = req.headers['user-agent'] || '';

    if (!claimsMatch) {
      console.log(`[RBAC Claims Sync] Sincronizando claims para ${req.user!.uid}...`);
      await setCustomUserClaims(req.user!.uid, databaseRole, databasePerms, databaseEmpresaId);

      await logAudit(dbAdmin, req, 'usuarios', req.user!.uid, 'SINCRONIZAR_CLAIMS',
        { role: tokenClaims.role, permissoes: tokenClaims.permissoes, empresaId: tokenClaims.empresaId },
        { role: databaseRole, permissoes: databasePerms, empresaId: databaseEmpresaId }
      );

      return res.json({
        user: { uid: req.user!.uid, ...profileData },
        refreshRequired: true
      });
    }

    // FASE 3: Log de login
    await logAudit(dbAdmin, req, 'usuarios', req.user!.uid, 'LOGIN',
      null,
      { email: profileData.email, role: databaseRole }
    );

    return res.json({ user: { uid: req.user!.uid, ...profileData } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        users: [
          { uid: 'demo-user-admin', nome: 'Operador Demonstrativo (Admin)', email: 'admin@wa-fort.com', role: 'Administrador', permissoes: ROLE_PERMISSIONS['Administrador'], empresaId: 'empresa-demo' },
          { uid: 'demo-user-financeiro', nome: 'Financeiro Demonstrativo', email: 'financeiro@wa-fort.com', role: 'Financeiro', permissoes: ROLE_PERMISSIONS['Financeiro'], empresaId: 'empresa-demo' },
          { uid: 'demo-user-operador', nome: 'Operador Demonstrativo', email: 'operador@wa-fort.com', role: 'Operador', permissoes: ROLE_PERMISSIONS['Operador'], empresaId: 'empresa-demo' }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    const snapshot = await dbAdmin.collection('usuarios')
      .where('empresaId', '==', currentEmpresaId)
      .get();

    const users: any[] = [];
    snapshot.forEach((doc: any) => {
      users.push({ uid: doc.id, ...doc.data() });
    });
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    const { email, nome, role } = req.body;
    if (!email || !nome || !role) {
      return res.status(400).json({ error: 'Todos os campos (email, nome, role) são obrigatórios.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, user: { uid: `demo-pre-approved-${Date.now()}`, email, nome, role, permissoes: ROLE_PERMISSIONS[role as UserRole], empresaId: currentEmpresaId } });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const emailToCreate = email.trim().toLowerCase();
    const existingEmailSnap = await dbAdmin.collection('usuarios')
      .where('email', '==', emailToCreate)
      .limit(1)
      .get();

    if (!existingEmailSnap.empty) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado ou autorizado.' });
    }

    const defaultPermissions = ROLE_PERMISSIONS[role as UserRole] || [];
    const preApprovedId = `pre-approved-${Date.now()}`;
    const newProfile = {
      nome: nome.trim(),
      email: emailToCreate,
      role,
      permissoes: defaultPermissions,
      empresaId: currentEmpresaId
    };

    await dbAdmin.collection('usuarios').doc(preApprovedId).set(newProfile);
    await logAudit(dbAdmin, req, 'usuarios', preApprovedId, 'CRIAR_USUARIO_PRE_APROVADO', null, newProfile);

    res.json({ success: true, user: { uid: preApprovedId, ...newProfile } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:uid', requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    const { uid } = req.params;
    const { role, permissoes } = req.body;

    if (req.user?.isDemo) {
      return res.json({ success: true, message: 'Perfil atualizado em modo de simulação.' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const userDoc = await dbAdmin.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const userData = userDoc.data();
    // FASE 7: Isolamento multi-empresa
    if (userData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: Este usuário pertence a outra empresa.' });
    }

    // FASE 8: Prevenção de escalada de privilégios
    if (uid === req.user!.uid && role !== userData.role) {
      return res.status(400).json({ error: 'Não é permitido alterar seu próprio cargo para evitar escalada de privilégios.' });
    }

    const dadosAnteriores = { role: userData.role, permissoes: userData.permissoes };
    await dbAdmin.collection('usuarios').doc(uid).update({ role, permissoes });

    // FASE 1: Sincroniza Custom Claims imediatamente
    await setCustomUserClaims(uid, role, permissoes, userData.empresaId);

    // FASE 1: Força renovação de token para o usuário afetado
    await forceTokenRefresh(uid);

    // FASE 3: Auditoria obrigatória
    await logAudit(dbAdmin, req, 'usuarios', uid, 'ALTERAR_PERMISSOES',
      dadosAnteriores,
      { role, permissoes }
    );

    res.json({ success: true, message: 'Permissões atualizadas. O usuário precisará refazer login para obter o novo token.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:uid', requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    const { uid } = req.params;
    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const userDoc = await dbAdmin.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const userData = userDoc.data();
    if (userData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: Este usuário pertence a outra empresa.' });
    }

    await dbAdmin.collection('usuarios').doc(uid).delete();
    await logAudit(dbAdmin, req, 'usuarios', uid, 'DELETAR_USUARIO', userData, null);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 6: PIN SECURITY
// ═══════════════════════════════════════════════════════════════════

app.post('/api/security/verify-pin', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ error: 'PIN ausente.' });
    }

    if (req.user?.isDemo) {
      return res.json({ success: pin === '1234' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const configDoc = await dbAdmin.collection('users').doc(req.user!.uid).collection('config').doc('main').get();
    let isMatch = false;

    if (configDoc.exists) {
      const data = configDoc.data();
      const hash = data?.securityPinHash;
      const plain = data?.securityPin;

      if (hash) {
        isMatch = bcrypt.compareSync(pin, hash);
      } else if (plain) {
        // FASE 6: Migração JIT - remove plain text e salva apenas hash
        isMatch = (pin === plain);
        if (isMatch) {
          const newHash = bcrypt.hashSync(pin, 10);
          await dbAdmin.collection('users').doc(req.user!.uid).collection('config').doc('main').update({
            securityPinHash: newHash,
            securityPin: FieldValue.delete()
          }).catch(err => console.error('[SecurityPin] Erro ao migrar PIN plain text:', err));
        }
      } else {
        isMatch = (pin === '1234');
      }
    } else {
      isMatch = (pin === '1234');
    }

    res.json({ success: isMatch });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/security/set-pin', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { pin } = req.body;
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'PIN inválido. Deve conter entre 4 e 6 dígitos numéricos.' });
    }

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    // FASE 6: Apenas hash, nunca plain text
    const hash = bcrypt.hashSync(pin, 10);
    const configRef = dbAdmin.collection('users').doc(req.user!.uid).collection('config').doc('main');

    const docSnap = await configRef.get();
    if (docSnap.exists) {
      await configRef.update({
        securityPinHash: hash,
        securityPin: FieldValue.delete()
      });
    } else {
      await configRef.set({
        securityPinHash: hash,
        companyName: 'WA Fort',
        paymentMethods: 'Pix, Boleto Bancário'
      });
    }

    await logAudit(dbAdmin, req, 'config', 'main', 'ALTERAR_PIN',
      { hasPinHash: docSnap.exists && !!docSnap.data()?.securityPinHash },
      { hasPinHash: true }
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 2 + 4 + 5 + 8: CAIXA (MOVIMENTO DE CAIXA)
// ═══════════════════════════════════════════════════════════════════

app.get('/api/caixa', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        movements: [
          { id: 'demo-m1', tipo: 'entrada', categoria: 'Serviços', descricao: 'Mensalidade Banda Larga Carlos', valor: 189.90, operadorId: 'demo-op', operadorNome: 'Operador Demo', dataMovimento: '2026-06-02', createdAt: '2026-06-02T14:00:00Z', status: 'ativo', empresaId: 'empresa-demo' },
          { id: 'demo-m2', tipo: 'saida', categoria: 'Infraestrutura', descricao: 'Compra de cabos ópticos', valor: 350.00, operadorId: 'demo-op', operadorNome: 'Operador Demo', dataMovimento: '2026-06-02', createdAt: '2026-06-02T14:30:00Z', status: 'ativo', empresaId: 'empresa-demo' }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    let query: any = dbAdmin.collection('financeiro/caixa/movimentos')
      .where('empresaId', '==', currentEmpresaId);

    const { startDate, endDate, operadorId, status } = req.query;

    if (startDate) query = query.where('dataMovimento', '>=', String(startDate));
    if (endDate) query = query.where('dataMovimento', '<=', String(endDate));
    if (operadorId) query = query.where('operadorId', '==', String(operadorId));
    if (status) query = query.where('status', '==', String(status));

    const snapshot = await query.get();
    const movements: any[] = [];
    snapshot.forEach((doc: any) => {
      movements.push({ id: doc.id, ...doc.data() });
    });

    movements.sort((a, b) => {
      if (a.dataMovimento !== b.dataMovimento) return b.dataMovimento.localeCompare(a.dataMovimento);
      return b.createdAt.localeCompare(a.createdAt);
    });

    res.json({ movements });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/caixa/resumo', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({ saldoAtual: 2450.50, entradasHoje: 389.90, saidasHoje: 120.00, fluxoMensal: 2330.50 });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    const snapshot = await dbAdmin.collection('financeiro/caixa/movimentos')
      .where('empresaId', '==', currentEmpresaId)
      .where('status', '==', 'ativo')
      .get();

    let saldoAtual = 0, entradasHoje = 0, saidasHoje = 0, fluxoMensal = 0;

    snapshot.forEach((doc: any) => {
      const data = doc.data();
      const val = data.valor || 0;
      const tipo = data.tipo;
      const dataMov = data.dataMovimento || '';

      if (tipo === 'entrada') {
        saldoAtual += val;
        if (dataMov === todayStr) entradasHoje += val;
        if (dataMov.startsWith(currentMonthStr)) fluxoMensal += val;
      } else if (tipo === 'saida') {
        saldoAtual -= val;
        if (dataMov === todayStr) saidasHoje += val;
        if (dataMov.startsWith(currentMonthStr)) fluxoMensal -= val;
      }
    });

    res.json({ saldoAtual, entradasHoje, saidasHoje, fluxoMensal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/caixa/entrada', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { categoria, descricao, valor, dataMovimento } = req.body;
    if (!categoria || !descricao || !valor || !dataMovimento) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: categoria, descricao, valor, dataMovimento.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, message: 'Entrada registrada em modo de simulação.' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const newMov = {
      tipo: 'entrada',
      categoria,
      descricao,
      valor: Number(valor),
      operadorId: req.user!.uid,
      operadorNome: req.user!.nome || 'Operador',
      dataMovimento,
      empresaId: currentEmpresaId,
      createdAt: new Date().toISOString(),
      status: 'ativo',  // FASE 4: Soft delete - nunca remove fisicamente
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador'
    };

    // FASE 8: Validação anti-fraude - valor deve ser positivo
    if (Number(valor) <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
    }

    const docRef = await dbAdmin.collection('financeiro/caixa/movimentos').add(newMov);
    // FASE 3: Auditoria obrigatória
    await logAudit(dbAdmin, req, 'caixa', docRef.id, 'REGISTRAR_ENTRADA', null, newMov);

    res.json({ success: true, id: docRef.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/caixa/saida', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { categoria, descricao, valor, dataMovimento } = req.body;
    if (!categoria || !descricao || !valor || !dataMovimento) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: categoria, descricao, valor, dataMovimento.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, message: 'Saída registrada em modo de simulação.' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    if (Number(valor) <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
    }

    const newMov = {
      tipo: 'saida',
      categoria,
      descricao,
      valor: Number(valor),
      operadorId: req.user!.uid,
      operadorNome: req.user!.nome || 'Operador',
      dataMovimento,
      empresaId: currentEmpresaId,
      createdAt: new Date().toISOString(),
      status: 'ativo',
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador'
    };

    const docRef = await dbAdmin.collection('financeiro/caixa/movimentos').add(newMov);
    await logAudit(dbAdmin, req, 'caixa', docRef.id, 'REGISTRAR_SAIDA', null, newMov);

    res.json({ success: true, id: docRef.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/caixa/transferencia', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { categoria, descricao, valor, dataMovimento } = req.body;
    if (!categoria || !descricao || !valor || !dataMovimento) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: categoria, descricao, valor, dataMovimento.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, message: 'Transferência registrada em modo de simulação.' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    if (Number(valor) <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
    }

    const newMov = {
      tipo: 'transferencia',
      categoria,
      descricao,
      valor: Number(valor),
      operadorId: req.user!.uid,
      operadorNome: req.user!.nome || 'Operador',
      dataMovimento,
      empresaId: currentEmpresaId,
      createdAt: new Date().toISOString(),
      status: 'ativo',
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador'
    };

    const docRef = await dbAdmin.collection('financeiro/caixa/movimentos').add(newMov);
    await logAudit(dbAdmin, req, 'caixa', docRef.id, 'REGISTRAR_TRANSFERENCIA', null, newMov);

    res.json({ success: true, id: docRef.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// FASE 4 + 5: Estorno com soft delete e integridade
app.post('/api/caixa/:movimentoId/estorno', requireAuth, requirePermission('Aprovar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { movimentoId } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true, message: 'Movimentação estornada em modo de simulação.' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/caixa/movimentos').doc(movimentoId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Movimentação de caixa não encontrada.' });
    }

    const currentData = docSnap.data();

    // FASE 7: Isolamento multi-empresa
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: Esta transação pertence a outra empresa.' });
    }

    // FASE 4: Soft delete - usa status 'estornado' ao invés de delete
    if (currentData?.status === 'estornado') {
      return res.status(400).json({ error: 'Esta movimentação já foi estornada anteriormente.' });
    }

    // FASE 5: Proteção de campos críticos - não permite alterar createdBy, createdAt, valor, etc.
    await docRef.update({ status: 'estornado' });

    // FASE 3: Auditoria obrigatória
    await logAudit(dbAdmin, req, 'caixa', movimentoId, 'ESTORNAR_MOVIMENTO', currentData, { status: 'estornado' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// FASE 4: Arquivamento (soft delete)
app.post('/api/caixa/:movimentoId/arquivar', requireAuth, requirePermission('Editar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { movimentoId } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/caixa/movimentos').doc(movimentoId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Movimentação não encontrada.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    await docRef.update({ status: 'arquivado' });
    await logAudit(dbAdmin, req, 'caixa', movimentoId, 'ARQUIVAR_MOVIMENTO', currentData, { status: 'arquivado' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 2 + 4 + 5 + 8: DUPLICATAS (agora em financeiro/duplicatas)
// ═══════════════════════════════════════════════════════════════════

app.get('/api/duplicatas', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        duplicatas: [
          { id: 'demo-d1', clienteId: 'demo-c1', clienteNome: 'Carlos Silva Santos', clienteDocumento: '123.456.789-00', numeroDuplicata: 'DUP-1001', descricao: 'Mensalidade Conectividade Premium', valor: 250.00, vencimento: '2026-06-01', status: 'Pendente', observacoes: 'Pendente pagamento', createdBy: 'demo-op', createdByName: 'Operador Demo', createdAt: '2026-05-15T10:00:00Z', empresaId: 'empresa-demo', pixCopiaECola: '00020126580014br.gov.bcb.pix0136financeiro@wafort.com.br5204000053039865406250.005802BR5907WA_FORT6009Sao_Paulo62070503***6304CA12', boletoBarCode: '34191.79001 01043.513184 91020.150008 7 93070000025000' },
          { id: 'demo-d2', clienteId: 'demo-c2', clienteNome: 'Mariana Costa Oliveira', clienteDocumento: '98.765.432/0001-99', numeroDuplicata: 'DUP-1002', descricao: 'Mensalidade Central Alarme', valor: 320.00, vencimento: '2026-05-10', status: 'Vencido', observacoes: 'Cobrança em andamento', createdBy: 'demo-op', createdByName: 'Operador Demo', createdAt: '2026-04-10T11:00:00Z', empresaId: 'empresa-demo', pixCopiaECola: '00020126580014br.gov.bcb.pix0136financeiro@wafort.com.br5204000053039865406320.005802BR5907WA_FORT6009Sao_Paulo62070503***6304FA51', boletoBarCode: '34191.79001 01043.513184 91020.150008 7 93070000032000' }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    let query: any = dbAdmin.collection('financeiro/duplicatas')
      .where('empresaId', '==', currentEmpresaId);

    const { cliente, documento, vencimento, status } = req.query;

    if (vencimento) query = query.where('vencimento', '==', String(vencimento));
    if (status) query = query.where('status', '==', String(status));

    const snapshot = await query.get();
    const duplicatas: any[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    const batch = dbAdmin.batch();
    let hasUpdates = false;

    snapshot.forEach((doc: any) => {
      const data = doc.data();
      let currentStatus = data.status;

      if (currentStatus === 'Pendente' && data.vencimento && data.vencimento < todayStr) {
        currentStatus = 'Vencido';
        const docRef = dbAdmin.collection('financeiro/duplicatas').doc(doc.id);
        batch.update(docRef, { status: 'Vencido' });
        hasUpdates = true;
      }

      duplicatas.push({ id: doc.id, ...data, status: currentStatus });
    });

    if (hasUpdates) {
      await batch.commit().catch(err => console.error('[Duplicatas] Erro no lote de auto-expiração:', err));
    }

    let filteredList = duplicatas;

    if (cliente) {
      const searchName = String(cliente).toLowerCase().trim();
      filteredList = filteredList.filter(d => d.clienteNome && d.clienteNome.toLowerCase().includes(searchName));
    }

    if (documento) {
      const cleanSearch = String(documento).replace(/\D/g, '').trim();
      filteredList = filteredList.filter(d => {
        if (!d.clienteDocumento) return false;
        return d.clienteDocumento.replace(/\D/g, '').includes(cleanSearch);
      });
    }

    filteredList.sort((a, b) => {
      if (a.vencimento !== b.vencimento) return a.vencimento.localeCompare(b.vencimento);
      return b.createdAt.localeCompare(a.createdAt);
    });

    res.json({ duplicatas: filteredList });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/duplicatas', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { clienteId, clienteNome, clienteDocumento, numeroDuplicata, descricao, valor, vencimento, observacoes } = req.body;
    if (!clienteNome || !clienteDocumento || !numeroDuplicata || !valor || !vencimento) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: clienteNome, clienteDocumento, numeroDuplicata, valor, vencimento.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, id: `demo-created-${Date.now()}` });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    // FASE 8: Anti-fraud - VALIDAÇÕES
    if (Number(valor) <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
    }

    // Verifica duplicidade de número de duplicata na mesma empresa
    const existingDup = await dbAdmin.collection('financeiro/duplicatas')
      .where('numeroDuplicata', '==', numeroDuplicata)
      .where('empresaId', '==', currentEmpresaId)
      .limit(1)
      .get();

    if (!existingDup.empty) {
      return res.status(400).json({ error: 'Já existe uma duplicata com este número para esta empresa.' });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const initialStatus = vencimento < todayStr ? 'Vencido' : 'Pendente';

    const cleanAmount = Number(valor).toFixed(2);
    const pixPlaceholder = `00020126580014br.gov.bcb.pix0136financeiro@wafort.com.br5204000053039865406${cleanAmount}5802BR5907WA_FORT6009Sao_Paulo62070503***6304` + Math.random().toString(16).substring(2, 6).toUpperCase();
    const boletoPlaceholder = `34191.79001 01043.513184 91020.150008 7 ` + Math.floor(10000000000000 + Math.random() * 90000000000000);

    const newDuplicata = {
      clienteId: clienteId || 'manual-client',
      clienteNome,
      clienteDocumento,
      numeroDuplicata,
      descricao,
      valor: Number(valor),
      vencimento,
      status: initialStatus,
      observacoes: observacoes || '',
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador',
      createdAt: new Date().toISOString(),
      empresaId: currentEmpresaId,
      pixCopiaECola: pixPlaceholder,
      boletoBarCode: boletoPlaceholder
    };

    // FASE 2: Usa financeiro/duplicatas
    const docRef = await dbAdmin.collection('financeiro/duplicatas').add(newDuplicata);

    // FASE 3: Auditoria obrigatória
    await logAudit(dbAdmin, req, 'duplicatas', docRef.id, 'CRIAR_DUPLICATA', null, newDuplicata);

    res.json({ success: true, id: docRef.id, duplicata: { id: docRef.id, ...newDuplicata } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/duplicatas/:id', requireAuth, requirePermission('Editar'), protectCriticalFields('duplicatas'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { clienteNome, clienteDocumento, numeroDuplicata, descricao, valor, vencimento, observacoes, status } = req.body;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/duplicatas').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Duplicata não encontrada.' });
    }

    const currentData = docSnap.data();

    // FASE 7: Isolamento multi-empresa
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado: Esta duplicata pertence a outra empresa.' });
    }

    // FASE 4: Soft delete - não permite alterar registros cancelados/arquivados/estornados
    if (['Cancelado', 'Estornado', 'Arquivado'].includes(currentData?.status)) {
      return res.status(400).json({ error: `Esta duplicata está com status ${currentData.status} e não pode ser editada.` });
    }

    // FASE 8: Anti-fraud - não permite alterar valor se já foi paga
    if (currentData?.status === 'Pago' && valor !== undefined) {
      return res.status(400).json({ error: 'Não é permitido alterar o valor de uma duplicata já paga.' });
    }

    // FASE 8: Anti-fraud - mudança manual de status para Pago requer aprovação
    if (status === 'Pago' && currentData?.status !== 'Pago') {
      const userPermissions = req.user!.permissoes || [];
      if (!userPermissions.includes('Aprovar')) {
        return res.status(403).json({ error: 'Apenas usuários com permissão "Aprovar" podem marcar duplicatas como Pago.' });
      }
    }

    const updates: any = {};
    if (clienteNome) updates.clienteNome = clienteNome;
    if (clienteDocumento) updates.clienteDocumento = clienteDocumento;
    if (numeroDuplicata) updates.numeroDuplicata = numeroDuplicata;
    if (descricao) updates.descricao = descricao;
    if (valor !== undefined) updates.valor = Number(valor);
    if (vencimento) updates.vencimento = vencimento;
    if (observacoes !== undefined) updates.observacoes = observacoes;
    if (status) {
      if (!['Pendente', 'Pago', 'Vencido', 'Cancelado', 'Negociado', 'Estornado', 'Arquivado'].includes(status)) {
        return res.status(400).json({ error: 'Status de duplicata inválido.' });
      }
      updates.status = status;
    }

    await docRef.update(updates);

    // FASE 3: Auditoria obrigatória
    await logAudit(dbAdmin, req, 'duplicatas', id, 'EDITAR_DUPLICATA', currentData, updates);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// FASE 4: Soft delete via cancelamento
app.post('/api/duplicatas/:id/cancelar', requireAuth, requirePermission('Editar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/duplicatas').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Duplicata não encontrada.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (currentData?.status === 'Pago') {
      return res.status(400).json({ error: 'Esta duplicata já foi paga e não pode ser cancelada.' });
    }

    // FASE 4: Soft delete - marca como cancelado
    await docRef.update({ status: 'Cancelado' });
    await logAudit(dbAdmin, req, 'duplicatas', id, 'CANCELAR_DUPLICATA', currentData, { status: 'Cancelado' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// FASE 4: Arquivamento
app.post('/api/duplicatas/:id/arquivar', requireAuth, requirePermission('Editar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/duplicatas').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Duplicata não encontrada.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    await docRef.update({ status: 'Arquivado' });
    await logAudit(dbAdmin, req, 'duplicatas', id, 'ARQUIVAR_DUPLICATA', currentData, { status: 'Arquivado' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 2: PAGAMENTOS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/pagamentos', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        pagamentos: [
          { id: 'demo-p1', duplicataId: 'demo-d1', duplicataNumero: 'DUP-1001', clienteId: 'demo-c1', clienteNome: 'Carlos Silva', valorPago: 250.00, valorOriginal: 250.00, dataPagamento: '2026-06-05', formaPagamento: 'Pix', conciliado: true, conciliadoPor: 'demo-op', conciliadoEm: '2026-06-05T10:00:00Z', empresaId: 'empresa-demo' }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    let query: any = dbAdmin.collection('financeiro/pagamentos')
      .where('empresaId', '==', currentEmpresaId);

    const { startDate, endDate, duplicataId, conciliado, clienteNome, status, formaPagamento } = req.query;
    if (startDate) query = query.where('dataPagamento', '>=', String(startDate));
    if (endDate) query = query.where('dataPagamento', '<=', String(endDate));
    if (duplicataId) query = query.where('duplicataId', '==', String(duplicataId));
    if (conciliado !== undefined) query = query.where('conciliado', '==', conciliado === 'true');
    if (status) query = query.where('status', '==', String(status));
    if (formaPagamento) query = query.where('formaPagamento', '==', String(formaPagamento));

    const snapshot = await query.get();
    const pagamentos: any[] = [];
    snapshot.forEach((doc: any) => {
      pagamentos.push({ id: doc.id, ...doc.data() });
    });

    pagamentos.sort((a, b) => b.dataPagamento.localeCompare(a.dataPagamento) || b.createdAt.localeCompare(a.createdAt));
    res.json({ pagamentos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pagamentos', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { duplicataId, duplicataNumero, clienteId, clienteNome, valorPago, valorOriginal, dataPagamento, formaPagamento } = req.body;
    if (!duplicataNumero || !clienteNome || !valorPago || !dataPagamento || !formaPagamento) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, id: `demo-pag-${Date.now()}` });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    // FASE 8: Anti-fraud - valor deve ser positivo
    if (Number(valorPago) <= 0) {
      return res.status(400).json({ error: 'Valor pago deve ser maior que zero.' });
    }

    // FASE 8: Se houver duplicataId, verificar se já foi paga
    if (duplicataId) {
      const dupDoc = await dbAdmin.collection('financeiro/duplicatas').doc(duplicataId).get();
      if (dupDoc.exists) {
        const dupData = dupDoc.data();
        if (dupData?.status === 'Pago') {
          return res.status(400).json({ error: 'Esta duplicata já foi paga.' });
        }
        if (dupData?.empresaId !== currentEmpresaId) {
          return res.status(403).json({ error: 'Acesso negado: duplicata de outra empresa.' });
        }
      }
    }

    const newPagamento = {
      duplicataId: duplicataId || '',
      duplicataNumero,
      clienteId: clienteId || '',
      clienteNome,
      valorPago: Number(valorPago),
      valorOriginal: Number(valorOriginal) || Number(valorPago),
      dataPagamento,
      formaPagamento,
      conciliado: false,
      empresaId: currentEmpresaId,
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador',
      createdAt: new Date().toISOString(),
      status: 'ativo'
    };

    const docRef = await dbAdmin.collection('financeiro/pagamentos').add(newPagamento);

    // Se vinculado a uma duplicata, atualiza status para Pago
    if (duplicataId) {
      await dbAdmin.collection('financeiro/duplicatas').doc(duplicataId).update({ status: 'Pago' }).catch(() => {});
    }

    // Auto-registrar entrada no caixa
    await dbAdmin.collection('financeiro/caixa/movimentos').add({
      tipo: 'entrada',
      categoria: 'Recebimento Duplicata',
      descricao: `Pagamento duplicata ${duplicataNumero} - ${clienteNome}`,
      valor: Number(valorPago),
      operadorId: req.user!.uid,
      operadorNome: req.user!.nome || 'Operador',
      dataMovimento: dataPagamento,
      empresaId: currentEmpresaId,
      createdAt: new Date().toISOString(),
      status: 'ativo',
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador',
      pagamentoId: docRef.id
    }).catch(() => {});

    await logAudit(dbAdmin, req, 'pagamentos', docRef.id, 'REGISTRAR_PAGAMENTO', null, newPagamento);

    res.json({ success: true, id: docRef.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// FASE 8: Conciliação - requer aprovação
app.post('/api/pagamentos/:id/conciliar', requireAuth, requirePermission('Aprovar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/pagamentos').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Pagamento não encontrado.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    // FASE 8: Não permite reconciliar pagamento já conciliado
    if (currentData?.conciliado) {
      return res.status(400).json({ error: 'Este pagamento já foi conciliado.' });
    }

    await docRef.update({
      conciliado: true,
      conciliadoPor: req.user!.uid,
      conciliadoEm: new Date().toISOString()
    });

    await logAudit(dbAdmin, req, 'pagamentos', id, 'CONCILIAR_PAGAMENTO', currentData, { conciliado: true });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Upload de comprovante de pagamento
app.post('/api/pagamentos/:id/comprovante', requireAuth, requirePermission('Editar'), upload.single('comprovante'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true, comprovanteUrl: 'https://via.placeholder.com/150' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/pagamentos').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Pagamento não encontrado.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    // Gerar URL local do comprovante
    const comprovanteUrl = `/uploads/${req.file.filename}`;

    await docRef.update({
      comprovanteUrl,
      comprovantePath: req.file.path
    });

    await logAudit(dbAdmin, req, 'pagamentos', id, 'UPLOAD_COMPROVANTE', currentData, { comprovanteUrl });

    res.json({ success: true, comprovanteUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Baixa manual de pagamento
app.put('/api/pagamentos/:id/baixa', requireAuth, requirePermission('Aprovar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { observacoes } = req.body;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/pagamentos').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Pagamento não encontrado.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (currentData?.status === 'estornado') {
      return res.status(400).json({ error: 'Não é possível dar baixa em um pagamento estornado.' });
    }

    const updates: any = {
      baixado: true,
      baixadoPor: req.user!.uid,
      baixadoEm: new Date().toISOString(),
      baixadoNome: req.user!.nome || 'Operador'
    };
    if (observacoes) updates.observacoesBaixa = observacoes;

    await docRef.update(updates);

    await logAudit(dbAdmin, req, 'pagamentos', id, 'BAIXA_MANUAL', currentData, updates);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Estorno de pagamento
app.post('/api/pagamentos/:id/estorno', requireAuth, requirePermission('Aprovar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/pagamentos').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Pagamento não encontrado.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (currentData?.status === 'estornado') {
      return res.status(400).json({ error: 'Este pagamento já foi estornado.' });
    }

    // Marcar pagamento como estornado
    await docRef.update({
      status: 'estornado',
      estornadoPor: req.user!.uid,
      estornadoEm: new Date().toISOString(),
      motivoEstorno: motivo || 'Sem motivo informado'
    });

    // Reverter duplicata para Pendente (ou Vencido se aplicável)
    if (currentData?.duplicataId) {
      const dupRef = dbAdmin.collection('financeiro/duplicatas').doc(currentData.duplicataId);
      const dupSnap = await dupRef.get();
      if (dupSnap.exists) {
        const dupData = dupSnap.data();
        if (dupData?.status === 'Pago') {
          const hoje = new Date().toISOString().split('T')[0];
          const novoStatus = dupData.vencimento && dupData.vencimento < hoje ? 'Vencido' : 'Pendente';
          await dupRef.update({ status: novoStatus }).catch(() => {});
        }
      }
    }

    // Registrar saída no caixa (estorno)
    await dbAdmin.collection('financeiro/caixa/movimentos').add({
      tipo: 'saida',
      categoria: 'Estorno Pagamento',
      descricao: `Estorno pagamento duplicata ${currentData?.duplicataNumero || ''} - ${currentData?.clienteNome || ''}`,
      valor: Number(currentData?.valorPago || 0),
      operadorId: req.user!.uid,
      operadorNome: req.user!.nome || 'Operador',
      dataMovimento: new Date().toISOString().split('T')[0],
      empresaId: req.user!.empresaId || 'empresa-default',
      createdAt: new Date().toISOString(),
      status: 'ativo',
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador',
      pagamentoId: id
    }).catch(() => {});

    await logAudit(dbAdmin, req, 'pagamentos', id, 'ESTORNAR_PAGAMENTO', currentData, { status: 'estornado', motivo });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Listar pagamentos por duplicata
app.get('/api/pagamentos/duplicata/:duplicataId', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { duplicataId } = req.params;

    if (req.user?.isDemo) {
      return res.json({ pagamentos: [] });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    const snapshot = await dbAdmin.collection('financeiro/pagamentos')
      .where('empresaId', '==', currentEmpresaId)
      .where('duplicataId', '==', duplicataId)
      .get();

    const pagamentos: any[] = [];
    snapshot.forEach((doc: any) => {
      pagamentos.push({ id: doc.id, ...doc.data() });
    });

    pagamentos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ pagamentos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Listar pagamentos por cliente
app.get('/api/pagamentos/cliente/:clienteId', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { clienteId } = req.params;
    const { startDate, endDate } = req.query;

    if (req.user?.isDemo) {
      return res.json({ pagamentos: [] });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    let query: any = dbAdmin.collection('financeiro/pagamentos')
      .where('empresaId', '==', currentEmpresaId)
      .where('clienteId', '==', clienteId);

    if (startDate) query = query.where('dataPagamento', '>=', String(startDate));
    if (endDate) query = query.where('dataPagamento', '<=', String(endDate));

    const snapshot = await query.get();
    const pagamentos: any[] = [];
    snapshot.forEach((doc: any) => {
      pagamentos.push({ id: doc.id, ...doc.data() });
    });

    pagamentos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ pagamentos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 2: LANÇAMENTOS FINANCEIROS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/lancamentos', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        lancamentos: [
          { id: 'demo-l1', tipo: 'receita', categoria: 'Serviços', descricao: 'Mensalidade Clientes', valor: 5000.00, dataLancamento: '2026-06-01', empresaId: 'empresa-demo' }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    let query: any = dbAdmin.collection('financeiro/lancamentos')
      .where('empresaId', '==', currentEmpresaId);

    const { startDate, endDate, tipo, categoria } = req.query;
    if (startDate) query = query.where('dataLancamento', '>=', String(startDate));
    if (endDate) query = query.where('dataLancamento', '<=', String(endDate));
    if (tipo) query = query.where('tipo', '==', String(tipo));
    if (categoria) query = query.where('categoria', '==', String(categoria));

    const snapshot = await query.get();
    const lancamentos: any[] = [];
    snapshot.forEach((doc: any) => {
      lancamentos.push({ id: doc.id, ...doc.data() });
    });

    lancamentos.sort((a, b) => b.dataLancamento.localeCompare(a.dataLancamento));
    res.json({ lancamentos });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/lancamentos', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { tipo, categoria, descricao, valor, dataLancamento, centroCusto } = req.body;
    if (!tipo || !categoria || !descricao || !valor || !dataLancamento) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, id: `demo-lanc-${Date.now()}` });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    if (!['receita', 'despesa', 'transferencia'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido. Use: receita, despesa ou transferencia.' });
    }

    if (Number(valor) <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
    }

    const novoLancamento = {
      tipo,
      categoria,
      descricao,
      valor: Number(valor),
      dataLancamento,
      centroCusto: centroCusto || null,
      empresaId: currentEmpresaId,
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador',
      createdAt: new Date().toISOString(),
      status: 'ativo'
    };

    const docRef = await dbAdmin.collection('financeiro/lancamentos').add(novoLancamento);
    await logAudit(dbAdmin, req, 'lancamentos', docRef.id, 'CRIAR_LANCAMENTO', null, novoLancamento);

    res.json({ success: true, id: docRef.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/lancamentos/:id', requireAuth, requirePermission('Editar'), protectCriticalFields('lancamentos'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/lancamentos').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Lançamento não encontrado.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (currentData?.status !== 'ativo') {
      return res.status(400).json({ error: 'Apenas lançamentos ativos podem ser editados.' });
    }

    const updates: any = {};
    const { categoria, descricao, centroCusto } = req.body;
    if (categoria) updates.categoria = categoria;
    if (descricao) updates.descricao = descricao;
    if (centroCusto !== undefined) updates.centroCusto = centroCusto;

    await docRef.update(updates);
    await logAudit(dbAdmin, req, 'lancamentos', id, 'EDITAR_LANCAMENTO', currentData, updates);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 2: NOTAS FISCAIS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/notas-fiscais', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        notas: [
          { id: 'demo-nf1', numeroNota: 'NF-1001', serie: '001', clienteNome: 'Carlos Silva', valor: 250.00, dataEmissao: '2026-06-01', tipoNota: 'NFS-e', empresaId: 'empresa-demo' }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    let query: any = dbAdmin.collection('financeiro/notasFiscais')
      .where('empresaId', '==', currentEmpresaId);

    const { startDate, endDate, cliente, status } = req.query;
    if (startDate) query = query.where('dataEmissao', '>=', String(startDate));
    if (endDate) query = query.where('dataEmissao', '<=', String(endDate));
    if (status) query = query.where('status', '==', String(status));

    const snapshot = await query.get();
    const notas: any[] = [];
    snapshot.forEach((doc: any) => {
      notas.push({ id: doc.id, ...doc.data() });
    });

    if (cliente) {
      const searchName = String(cliente).toLowerCase().trim();
      const filtered = notas.filter(n => n.clienteNome && n.clienteNome.toLowerCase().includes(searchName));
      notas.length = 0;
      notas.push(...filtered);
    }

    notas.sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao));
    res.json({ notas });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/notas-fiscais', requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { numeroNota, serie, clienteId, clienteNome, clienteDocumento, valor, dataEmissao, dataVencimento, descricao, tipoNota } = req.body;
    if (!numeroNota || !clienteNome || !clienteDocumento || !valor || !dataEmissao || !tipoNota) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';

    if (req.user?.isDemo) {
      return res.json({ success: true, id: `demo-nf-${Date.now()}` });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    if (!['NFS-e', 'NF-e', 'NFC-e'].includes(tipoNota)) {
      return res.status(400).json({ error: 'Tipo de nota inválido. Use: NFS-e, NF-e ou NFC-e.' });
    }

    if (Number(valor) <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' });
    }

    // FASE 8: Verifica duplicidade de número de nota
    const existingNF = await dbAdmin.collection('financeiro/notasFiscais')
      .where('numeroNota', '==', numeroNota)
      .where('empresaId', '==', currentEmpresaId)
      .limit(1)
      .get();

    if (!existingNF.empty) {
      return res.status(400).json({ error: 'Já existe uma nota fiscal com este número para esta empresa.' });
    }

    const novaNota = {
      numeroNota,
      serie: serie || '001',
      clienteId: clienteId || '',
      clienteNome,
      clienteDocumento,
      valor: Number(valor),
      dataEmissao,
      dataVencimento: dataVencimento || dataEmissao,
      descricao: descricao || '',
      tipoNota,
      chaveAcesso: null,
      xmlUrl: null,
      pdfUrl: null,
      empresaId: currentEmpresaId,
      createdBy: req.user!.uid,
      createdByName: req.user!.nome || 'Operador',
      createdAt: new Date().toISOString(),
      status: 'ativo'
    };

    const docRef = await dbAdmin.collection('financeiro/notasFiscais').add(novaNota);
    await logAudit(dbAdmin, req, 'notasFiscais', docRef.id, 'EMITIR_NOTA_FISCAL', null, novaNota);

    res.json({ success: true, id: docRef.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// FASE 8: Anti-fraud - não permite alterar nota fiscal emitida
app.put('/api/notas-fiscais/:id', requireAuth, requirePermission('Aprovar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/notasFiscais').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Nota fiscal não encontrada.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    // FASE 8: Notas emitidas não podem ser alteradas (apenas canceladas)
    if (currentData?.status === 'cancelado') {
      return res.status(400).json({ error: 'Nota fiscal já cancelada.' });
    }

    // Apenas campos não críticos podem ser alterados
    const { descricao, observacoes } = req.body;
    const updates: any = {};
    if (descricao) updates.descricao = descricao;
    if (observacoes !== undefined) updates.observacoes = observacoes;

    await docRef.update(updates);
    await logAudit(dbAdmin, req, 'notasFiscais', id, 'ALTERAR_NOTA_FISCAL', currentData, updates);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// FASE 4: Cancelamento de nota fiscal (soft delete)
app.post('/api/notas-fiscais/:id/cancelar', requireAuth, requirePermission('Aprovar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const docRef = dbAdmin.collection('financeiro/notasFiscais').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Nota fiscal não encontrada.' });
    }

    const currentData = docSnap.data();
    if (currentData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    if (currentData?.status === 'cancelado') {
      return res.status(400).json({ error: 'Nota fiscal já cancelada.' });
    }

    await docRef.update({ status: 'cancelado' });
    await logAudit(dbAdmin, req, 'notasFiscais', id, 'CANCELAR_NOTA_FISCAL', currentData, { status: 'cancelado' });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 3: AUDITORIA
// ═══════════════════════════════════════════════════════════════════

app.get('/api/auditoria', requireAuth, requirePermission('Visualizar'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        logs: [
          { id: 'demo-log1', entidade: 'caixa', acao: 'REGISTRAR_ENTRADA', operadorNome: 'Operador Demo', createdAt: '2026-06-02T14:00:00Z', empresaId: 'empresa-demo' }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const currentEmpresaId = req.user!.empresaId || 'empresa-default';
    const { entidade, acao, startDate, endDate } = req.query;

    let query: any = dbAdmin.collection('auditoria')
      .where('empresaId', '==', currentEmpresaId);

    if (entidade) query = query.where('entidade', '==', String(entidade));
    if (acao) query = query.where('acao', '==', String(acao));
    if (startDate) query = query.where('createdAt', '>=', String(startDate));
    if (endDate) query = query.where('createdAt', '<=', String(endDate));

    const snapshot = await query.get();
    const logs: any[] = [];
    snapshot.forEach((doc: any) => {
      logs.push({ id: doc.id, ...doc.data() });
    });

    logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// FASE 10: FUNÇÃO ADMIN PARA GERENCIAR CUSTOM CLAIMS
// ═══════════════════════════════════════════════════════════════════

app.post('/api/admin/sync-claims/:uid', requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    const { uid } = req.params;

    if (req.user?.isDemo) {
      return res.json({ success: true, message: 'Claims sincronizados em modo de simulação.' });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const userDoc = await dbAdmin.collection('usuarios').doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const userData = userDoc.data();
    if (userData?.empresaId !== req.user!.empresaId) {
      return res.status(403).json({ error: 'Acesso negado.' });
    }

    await setCustomUserClaims(uid, userData.role, userData.permissoes || [], userData.empresaId);
    await forceTokenRefresh(uid);

    await logAudit(dbAdmin, req, 'usuarios', uid, 'SINCRONIZAR_CLAIMS_ADMIN',
      null,
      { role: userData.role, permissoes: userData.permissoes, empresaId: userData.empresaId }
    );

    res.json({
      success: true,
      message: 'Claims sincronizados e token revogado. Usuário precisará refazer login.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/claims/:uid', requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    const { uid } = req.params;

    if (req.user?.isDemo) {
      return res.json({ claims: { role: 'Administrador', permissoes: ['Visualizar', 'Criar', 'Editar', 'Excluir', 'Aprovar'] } });
    }

    const authAdmin = getAuthAdmin();
    if (!authAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const user = await authAdmin.getUser(uid);
    res.json({ claims: user.customClaims || {} });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default app;
