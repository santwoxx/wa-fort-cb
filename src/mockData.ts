/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Debtor, AppConfig } from "./types";

export const DEFAULT_CONFIG: AppConfig = {
  companyName: "WA Fort Telecom & Segurança",
  customSignature: "Financeiro WA Fort | WhatsApp +55 (11) 4003-8291",
  paymentMethods: "Pix Copia e Cola, Código de Barras de Boleto ou Cartão",
  pixKey: "financeiro@wafort.com.br",
  promptFriendly: "Seja leve, amigável e cortês. Trate como um lembrete sutil, pois o cliente pode apenas ter esquecido devido à rotina. Use emojis amigáveis de forma comedida e passe uma sensação de parceria positiva.",
  promptFormal: "Seja estritamente profissional, claro, corporativo e polido. Use termos financeiros corretos, mantendo um tom firme de cobrança formal respeitosa.",
  promptUrgent: "Seja sério, direto, formal e use um tom de aviso importante/alerta de urgência contratual. Mencione educadamente que o atraso prolongado pode resultar na suspensão temporária dos serviços da WA Fort de forma a evitar desgastes.",
  promptNegotiation: "Foque na flexibilidade, acolhimento e oferta de acordo ou parcelamento facilitado. Mostre que a empresa quer ajudar o parceiro/cliente e encontrar uma melhor solução juntos.",
  templateFriendly: "Olá, {{cliente}}! Tudo bem? 🌸\n\nPassando aqui com um lembrete sutil sobre o vencimento da sua fatura de *{{servico}}*, no valor de *{{valor}}*, que venceu em *{{vencimento}}*. \n\nSabemos que a rotina é corrida e pode ter passado despercebido! Se precisar de qualquer ajuda ou de um novo link, estamos à disposição aqui para te dar suporte.\n\nComo pagar? É super rápido pelo Pix Copia e Cola:\n🔑 `{{chave_pix}}`\n\nSe você já realizou o pagamento, pode desconsiderar essa mensagem ou nos enviar o comprovante para darmos baixa automática. \n\nTenha um excelente dia!\nAtenciosamente,\n*{{empresa}}*",
  templateFormal: "Prezado(a) {{cliente}}, \n\nEntramos em contato para informar sobre o débito pendente em nosso sistema, referente a *{{servico}}*, no valor de *{{valor}}*, com vencimento original em *{{vencimento}}*.\n\nSolicitamos a regularização do débito para evitar cobranças adicionais e interrupções em seus serviços cadastrados.\n\nChave Pix para pagamento:\n🔑 `{{chave_pix}}`\n\nCaso já tenha efetuado o pagamento, por gentileza, nos envie uma foto ou arquivo do comprovante em resposta a este atendimento para conciliação bancária.\n\nPermanecemos à disposição para quaisquer esclarecimentos através deste canal oficial.\n\nAtenciosamente,\n*Setor Financeiro - {{empresa}}*",
  templateUrgent: "⚠️ NOTIFICAÇÃO DE COBRANÇA DE URGÊNCIA\n\nPrezado(a) {{cliente}},\n\nIdentificamos que a fatura de *{{servico}}* no valor de *{{valor}}*, vencida em *{{vencimento}}*, encontra-se com atraso acumulado significativo em nossos sistemas.\n\nSolicitamos a regularização imediata do saldo em aberto para evitar a suspensão temporária dos serviços e demais desdobramentos operacionais previstos em contrato.\n\nRealize o pagamento de forma segura através de transferência Pix:\n🔑 `{{chave_pix}}`\n\nApós o pagamento, favor enviar o comprovante de transação imediatamente por aqui para reativação imediata.\n\nCaso o pagamento já tenha sido efetuado nas últimas horas, favor desconsiderar.\n\nAtenciosamente,\n*Cobrança e Contencioso - {{empresa}}*",
  templateNegotiation: "Olá, {{cliente}}! 🤝\n\nEstamos entrando em contato pois valorizamos imensamente a nossa parceria e o seu relacionamento com a *{{empresa}}*. \n\nNotamos que a fatura de *{{servico}}* no valor de *{{valor}}* (vencida em *{{vencimento}}*) ainda consta pendente em nosso sistema. Queremos apoiar você a colocar suas contas em dia sem pesar no seu orçamento! \n\nPor isso, preparamos condições facilitadas de parcelamento ou desconto para quitação à vista. Vamos conversar e achar a melhor proposta juntos?\n\nPara quitação imediata, utilize a nossa chave Pix:\n🔑 `{{chave_pix}}`\n\nResponda a esta mensagem dizendo qual a melhor forma de negociarmos para você. Estamos prontos para te ajudar!\n\nAtenciosamente,\n*Setor de Acordos e Conciliação - {{empresa}}*"
};

export const DEMO_DEBTORS: Debtor[] = [
  {
    id: "demo-1",
    name: "Carlos Silva Santos",
    phone: "5511999998888",
    amount: 189.90,
    dueDate: "2026-05-10",
    daysOverdue: 23,
    description: "Mensalidade Fibra Óptica 500 Mega + IP Fixo",
    status: "pending",
    tone: "friendly",
    customMessage: ""
  },
  {
    id: "demo-2",
    name: "Mariana Costa Oliveira",
    phone: "5521988887777",
    amount: 320.00,
    dueDate: "2026-04-20",
    daysOverdue: 43,
    description: "Mensalidade Central de Rastreamento & Alarme Pro",
    status: "notified",
    tone: "formal",
    customMessage: ""
  },
  {
    id: "demo-3",
    name: "Roberto de Souza Lima",
    phone: "5511977776666",
    amount: 750.00,
    dueDate: "2026-03-15",
    daysOverdue: 79,
    description: "Locação de Aparelhos de Segurança e Câmeras HD WA Fort Pro",
    status: "pending",
    tone: "urgent",
    customMessage: ""
  },
  {
    id: "demo-4",
    name: "Beatriz Ribeiro Mendes",
    phone: "5531966665555",
    amount: 120.00,
    dueDate: "2026-05-25",
    daysOverdue: 8,
    description: "Plano Conexão VoIP Ilimitada WA Fort",
    status: "negotiating",
    tone: "negotiation",
    customMessage: ""
  },
  {
    id: "demo-5",
    name: "Juliana Mendes Garcia",
    phone: "5541955554444",
    amount: 149.90,
    dueDate: "2026-05-28",
    daysOverdue: 5,
    description: "Manutenção Técnica Local & Upgrade de Roteador",
    status: "paid",
    tone: "friendly",
    customMessage: ""
  }
];

export const INITIAL_DEBTORS: Debtor[] = [];

// Helper to calculate days overdue relative to the current date 2026-06-02
export function calculateDaysDifference(dueDateString: string): number {
  try {
    const currentSystemDate = new Date("2026-06-02");
    const dueDate = new Date(dueDateString);
    
    // Set hours to zero for precise comparison
    currentSystemDate.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    
    const diffTime = currentSystemDate.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays > 0 ? diffDays : 0;
  } catch (error) {
    return 0;
  }
}

// Phone standard format: clean symbols and ensure correct country prefix
export function formatWhatsAppNumber(phone: string): string {
  // Remove spaces, parentheses, hiphens
  let cleaned = phone.replace(/\D/g, "");
  
  // If no country code, add Brazilian code (55)
  if (cleaned.length === 11 || cleaned.length === 10) {
    cleaned = "55" + cleaned;
  }
  
  return cleaned;
}

// Display format helper (e.g. "55 (11) 99999-8888")
export function formatPhoneNumberDisplay(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  
  // If it starts with 55
  if (cleaned.startsWith("55")) {
    cleaned = cleaned.substring(2);
  }
  
  if (cleaned.length === 11) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 7)}-${cleaned.substring(7)}`;
  } else if (cleaned.length === 10) {
    return `(${cleaned.substring(0, 2)}) ${cleaned.substring(2, 6)}-${cleaned.substring(6)}`;
  }
  return phone;
}
