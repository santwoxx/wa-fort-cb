import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { requireAuth, requirePermission, requireRole, AuthenticatedRequest } from "./rbacMiddleware";
import { getFirestoreAdmin } from "./backendAuth";
import { ROLE_PERMISSIONS, UserRole } from "../types";

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Enable CORS for frontend deployments
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Initialize the Google GenAI client lazily & safely
let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.includes("MY_KEY")) {
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

// Fallback message generator in case API Key is missing or invalid
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
  } catch (e) {
    // Keep raw
  }

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
      .replace(/\{\{chave_pix\}\}/gi, pixKey || "financeiro@wafort.com.br")
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

// REST Endpoint to extract debtors from unstructured text
app.post("/api/extract-debtors", requireAuth, requirePermission('Criar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "O texto para extração está vazio." });
    }

    const client = getGeminiClient();
    if (!client) {
      return res.json({ 
        debtors: [
          {
            name: "Cliente Exemplo de Teste",
            phone: "5511999998888",
            amount: 350.00,
            dueDate: "2026-06-15",
            description: "Cobrança extraída via fallback offline"
          }
        ], 
        source: "fallback" 
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
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            debtors: {
              type: Type.ARRAY,
              description: "Lista estruturada dos contatos inadimplentes encontrados no texto",
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description: "Nome completo do cliente"
                  },
                  phone: {
                    type: Type.STRING,
                    description: "Apenas dígitos do telefone com DDD (ex: 11988887777)"
                  },
                  amount: {
                    type: Type.NUMBER,
                    description: "Valor float da pendência em aberto"
                  },
                  dueDate: {
                    type: Type.STRING,
                    description: "Data de vencimento formatada no padrão YYYY-MM-DD"
                  },
                  description: {
                    type: Type.STRING,
                    description: "Serviço, produto ou fatura em atraso"
                  }
                },
                required: ["name", "phone", "amount", "dueDate"]
              }
            }
          },
          required: ["debtors"]
        }
      }
    });

    const resultText = response.text?.trim() || "{}";
    const parsedData = JSON.parse(resultText);
    res.json({ debtors: parsedData.debtors || [], source: "gemini" });
  } catch (error: any) {
    console.error("Erro no endpoint /api/extract-debtors:", error);
    res.status(550).json({ error: error?.message || "Internal server error" });
  }
});

// REST Endpoint to generate collection message
app.post("/api/generate-message", requireAuth, requirePermission('Editar'), async (req: AuthenticatedRequest, res) => {
  try {
    const { 
      name, 
      amount, 
      dueDate, 
      daysOverdue, 
      description, 
      tone = 'formal', 
      companyName = 'WA Fort', 
      paymentMethods = 'Pix, Boleto Bancário',
      pixKey = '',
      customSignature = '',
      customFriendlyPrompt = '',
      customFormalPrompt = '',
      customUrgentPrompt = '',
      customNegotiationPrompt = '',
      customFriendlyTemplate = '',
      customFormalTemplate = '',
      customUrgentTemplate = '',
      customNegotiationTemplate = ''
    } = req.body;

    if (!name || amount === undefined || !dueDate) {
      return res.status(400).json({ error: "Missing required fields: name, amount, and dueDate are required." });
    }

    let activeTemplate = "";
    if (tone === "friendly") activeTemplate = customFriendlyTemplate;
    else if (tone === "urgent") activeTemplate = customUrgentTemplate;
    else if (tone === "negotiation") activeTemplate = customNegotiationTemplate;
    else activeTemplate = customFormalTemplate;

    const client = getGeminiClient();
    
    if (!client) {
      const fallback = getFallbackMessage(
        name, 
        amount, 
        dueDate, 
        daysOverdue || 0, 
        description || "Serviço WA Fort", 
        tone, 
        companyName, 
        paymentMethods,
        pixKey,
        activeTemplate
      );
      return res.json({ text: fallback, source: "fallback" });
    }

    const formattedAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
    
    let toneInstruction = "";
    switch (tone) {
      case "friendly":
        toneInstruction = customFriendlyPrompt || "Seja leve, amigável e cortês. Trate como um lembrete sutil, pois o cliente pode apenas ter esquecido devido à rotina. Use emojis amigáveis de forma comedida.";
        break;
      case "urgent":
        toneInstruction = customUrgentPrompt || "Seja sério, direto, formal e use um tom de aviso importante/alerta de urgência física ou contratual. Mencione educadamente que o atraso prolongado pode suspender temporariamente os serviços da WA Fort ou gerar encargos, encorajando a resolução rápida.";
        break;
      case "negotiation":
        toneInstruction = customNegotiationPrompt || "Foque na flexibilidade, acolhimento e oferta de acordo ou parcelamento facilitado. Mostre que a empresa quer ajudar o parceiro/cliente e manter o relacionamento. Ofereça opções amigáveis.";
        break;
      case "formal":
      default:
        toneInstruction = customFormalPrompt || "Seja estritamente profissional, claro, corporativo e polido. Use termos financeiros corretos, mantendo um tom firme de cobrança formal respeitosa.";
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
- Referente a: ${description || "Mensalidade WA Fort"}
- Tom da mensagem: ${tone ? tone.toUpperCase() : "FORMAL"} (${toneInstruction})
- Métodos de pagamento aceitos: ${paymentMethods}
${pixKey ? `- Chave Pix de Pagamento: ${pixKey}` : ""}
${customSignature ? `- Assinatura personalizada a incluir no final: ${customSignature}` : ""}`;

    if (activeTemplate && activeTemplate.trim()) {
      userPrompt += `\n\nATENÇÃO: O usuário definiu um modelo global preferencial de mensagem para este tom. Use este modelo como esqueleto/estrutura de referência, substituindo as tags correspondentes e aprimorando levemente o fluxo textual profissional conforme necessário:\n"""\n${activeTemplate}\n"""`;
    }

    userPrompt += `\n\nLembrete de tom: Gere apenas a mensagem final refinada e pronta para o WhatsApp. Não coloque aspas nem introduções no início ou no fim.`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction,
        temperature: 0.8,
      }
    });

    res.json({ text: response.text?.trim() || "Erro ao obter resposta da IA.", source: "gemini" });
  } catch (error: any) {
    console.error("Gemini API server error:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

// User profile synchronization and RBAC management API endpoints
app.get("/api/users/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({ user: req.user });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    // 1. Try to find the user profile directly by their authenticated UID
    const userDoc = await dbAdmin.collection('usuarios').doc(req.user!.uid).get();
    if (userDoc.exists) {
      return res.json({ user: { uid: req.user!.uid, ...userDoc.data() } });
    }

    // 2. Check if there is a pre-approved email record
    const emailToFind = req.user!.email.trim().toLowerCase();
    const emailQuery = await dbAdmin.collection('usuarios')
      .where('email', '==', emailToFind)
      .limit(1)
      .get();

    if (!emailQuery.empty) {
      const preApprovedDoc = emailQuery.docs[0];
      const preApprovedData = preApprovedDoc.data();

      // Create the definitive user profile mapped to their UID
      const newProfile = {
        nome: preApprovedData.nome || req.user!.nome || 'Operador',
        email: emailToFind,
        role: preApprovedData.role || 'Operador',
        permissoes: preApprovedData.permissoes || ROLE_PERMISSIONS[(preApprovedData.role || 'Operador') as UserRole]
      };

      await dbAdmin.collection('usuarios').doc(req.user!.uid).set(newProfile);

      // Clean up the temporary pre-approved record if it has a temporary document ID
      if (preApprovedDoc.id !== req.user!.uid) {
        await dbAdmin.collection('usuarios').doc(preApprovedDoc.id).delete();
      }

      return res.json({ user: { uid: req.user!.uid, ...newProfile } });
    }

    // 3. Special case: If the database is completely empty (no users at all), bootstrap the first user as Admin
    const allUsersSnap = await dbAdmin.collection('usuarios').limit(1).get();
    if (allUsersSnap.empty) {
      const newProfile = {
        nome: req.user!.nome || 'Administrador Inicial',
        email: emailToFind,
        role: 'Administrador',
        permissoes: ROLE_PERMISSIONS['Administrador']
      };
      await dbAdmin.collection('usuarios').doc(req.user!.uid).set(newProfile);
      return res.json({ user: { uid: req.user!.uid, ...newProfile } });
    }

    // 4. Otherwise, reject access
    console.warn(`[RBAC Security] Rejected login attempt from unapproved email: ${emailToFind}`);
    return res.status(403).json({
      error: 'Este e-mail não está pré-aprovado ou cadastrado no sistema. Solicite acesso ao administrador.'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/users", requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    if (req.user?.isDemo) {
      return res.json({
        users: [
          { uid: 'demo-user-admin', nome: 'Operador Demonstrativo (Admin)', email: 'admin@wa-fort.com', role: 'Administrador', permissoes: ROLE_PERMISSIONS['Administrador'] },
          { uid: 'demo-user-financeiro', nome: 'Financeiro Demonstrativo', email: 'financeiro@wa-fort.com', role: 'Financeiro', permissoes: ROLE_PERMISSIONS['Financeiro'] },
          { uid: 'demo-user-operador', nome: 'Operador Demonstrativo', email: 'operador@wa-fort.com', role: 'Operador', permissoes: ROLE_PERMISSIONS['Operador'] },
          { uid: 'demo-user-supervisor', nome: 'Supervisor Demonstrativo', email: 'supervisor@wa-fort.com', role: 'Supervisor', permissoes: ROLE_PERMISSIONS['Supervisor'] },
          { uid: 'demo-user-auditor', nome: 'Auditor Demonstrativo', email: 'auditor@wa-fort.com', role: 'Auditor', permissoes: ROLE_PERMISSIONS['Auditor'] }
        ]
      });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const snapshot = await dbAdmin.collection('usuarios').get();
    const users: any[] = [];
    snapshot.forEach(doc => {
      users.push({ uid: doc.id, ...doc.data() });
    });
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/users", requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    const { email, nome, role } = req.body;
    if (!email || !nome || !role) {
      return res.status(400).json({ error: 'Todos os campos (email, nome, role) são obrigatórios.' });
    }

    if (req.user?.isDemo) {
      return res.json({ success: true, user: { uid: `demo-pre-approved-${Date.now()}`, email, nome, role, permissoes: ROLE_PERMISSIONS[role as UserRole] } });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    const emailToCreate = email.trim().toLowerCase();

    // Check if user already exists with this email
    const existingEmailSnap = await dbAdmin.collection('usuarios')
      .where('email', '==', emailToCreate)
      .limit(1)
      .get();
      
    if (!existingEmailSnap.empty) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado ou autorizado.' });
    }

    const defaultPermissions = ROLE_PERMISSIONS[role as UserRole] || [];
    
    // Create a pre-approved user document with a unique ID
    const preApprovedId = `pre-approved-${Date.now()}`;
    const newProfile = {
      nome: nome.trim(),
      email: emailToCreate,
      role,
      permissoes: defaultPermissions
    };

    await dbAdmin.collection('usuarios').doc(preApprovedId).set(newProfile);
    res.json({ success: true, user: { uid: preApprovedId, ...newProfile } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/users/:uid", requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
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

    await dbAdmin.collection('usuarios').doc(uid).update({
      role,
      permissoes
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/users/:uid", requireAuth, requireRole('Administrador'), async (req: AuthenticatedRequest, res) => {
  try {
    const { uid } = req.params;
    if (req.user?.isDemo) {
      return res.json({ success: true });
    }

    const dbAdmin = getFirestoreAdmin();
    if (!dbAdmin) {
      return res.status(500).json({ error: 'Firebase Admin não configurado.' });
    }

    await dbAdmin.collection('usuarios').doc(uid).delete();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default app;
