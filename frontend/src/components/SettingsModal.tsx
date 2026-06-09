/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Settings, X, Save, AlertCircle, Sparkles, Sliders, DollarSign, MessageSquare } from "lucide-react";
import { AppConfig, UserProfile, UserRole, UserPermission, ROLE_PERMISSIONS } from "../types";
import { API_URL } from "../config";

interface SettingsModalProps {
  config: AppConfig;
  onSave: (newConfig: AppConfig) => void;
  onClose: () => void;
  userProfile: UserProfile | null;
  currentUser: any;
}

export function SettingsModal({ config, onSave, onClose, userProfile, currentUser }: SettingsModalProps) {
  const [companyName, setCompanyName] = useState(config.companyName);
  const [customSignature, setCustomSignature] = useState(config.customSignature);
  const [paymentMethods, setPaymentMethods] = useState(config.paymentMethods);
  const [pixKey, setPixKey] = useState(config.pixKey || "");
  const [securityPin, setSecurityPin] = useState(config.securityPin || "1234");

  // Custom tone guidelines states (default backends exist in sever if empty)
  const [promptFriendly, setPromptFriendly] = useState(
    config.promptFriendly || 
    "Seja leve, amigável e cortês. Trate como um lembrete sutil, pois o cliente pode apenas ter esquecido devido à rotina. Use emojis amigáveis de forma comedida e passe uma sensação de parceria positiva."
  );
  const [promptFormal, setPromptFormal] = useState(
    config.promptFormal || 
    "Seja estritamente profissional, claro, corporativo e polido. Use termos financeiros corretos, mantendo um tom firme de cobrança formal respeitosa."
  );
  const [promptUrgent, setPromptUrgent] = useState(
    config.promptUrgent || 
    "Seja sério, direto, formal e use um tom de aviso importante/alerta de urgência contratual. Mencione educadamente que o atraso prolongado pode resultar na suspensão temporária dos serviços da WA Fort de forma a evitar desgastes."
  );
  const [promptNegotiation, setPromptNegotiation] = useState(
    config.promptNegotiation || 
    "Foque na flexibilidade, acolhimento e oferta de acordo ou parcelamento facilitado. Mostre que a empresa quer ajudar o parceiro/cliente e encontrar uma melhor solução juntos."
  );

  // General templates variables (these can be edited globally and applied automatically)
  const [templateFriendly, setTemplateFriendly] = useState(
    config.templateFriendly ||
    "Olá, {{cliente}}! Tudo bem? 🌸\n\nPassando aqui com um lembrete sutil sobre o vencimento da sua fatura de *{{servico}}*, no valor de *{{valor}}*, que venceu em *{{vencimento}}*. \n\nSabemos que a rotina é corrida e pode ter passado despercebido! Se precisar de qualquer ajuda ou de um novo link, estamos à disposição aqui para te dar suporte.\n\nComo pagar? É super rápido pelo Pix Copia e Cola:\n🔑 `{{chave_pix}}`\n\nSe você já realizou o pagamento, pode desconsiderar essa mensagem ou nos enviar o comprovante para darmos baixa automática. \n\nTenha um excelente dia!\nAtenciosamente,\n*{{empresa}}*"
  );
  const [templateFormal, setTemplateFormal] = useState(
    config.templateFormal ||
    "Prezado(a) {{cliente}}, \n\nEntramos em contato para informar sobre o débito pendente em nosso sistema, referente a *{{servico}}*, no valor de *{{valor}}*, com vencimento original em *{{vencimento}}*.\n\nSolicitamos a regularização do débito para evitar cobranças adicionais e interrupções em seus serviços cadastrados.\n\nChave Pix para pagamento:\n🔑 `{{chave_pix}}`\n\nCaso já tenha efetuado o pagamento, por gentileza, nos envie uma foto ou arquivo do comprovante em resposta a este atendimento para conciliação bancária.\n\nPermanecemos à disposição para quaisquer esclarecimentos através deste canal oficial.\n\nAtenciosamente,\n*Setor Financeiro - {{empresa}}*"
  );
  const [templateUrgent, setTemplateUrgent] = useState(
    config.templateUrgent ||
    "⚠️ NOTIFICAÇÃO DE COBRANÇA DE URGÊNCIA\n\nPrezado(a) {{cliente}},\n\nIdentificamos que a fatura de *{{servico}}* no valor de *{{valor}}*, vencida em *{{vencimento}}*, encontra-se com atraso acumulado significativo em nossos sistemas.\n\nSolicitamos a regularização imediata do saldo em aberto para evitar a suspensão temporária dos serviços e demais desdobramentos operacionais previstos em contrato.\n\nRealize o pagamento de forma segura através de transferência Pix:\n🔑 `{{chave_pix}}`\n\nApós o pagamento, favor enviar o comprovante de transação imediatamente por aqui para reativação imediata.\n\nCaso o pagamento já tenha sido efetuado nas últimas horas, favor desconsiderar.\n\nAtenciosamente,\n*Cobrança e Contencioso - {{empresa}}*"
  );
  const [templateNegotiation, setTemplateNegotiation] = useState(
    config.templateNegotiation ||
    "Olá, {{cliente}}! 🤝\n\nEstamos entrando em contato pois valorizamos imensamente a nossa parceria e o seu relacionamento com a *{{empresa}}*. \n\nNotamos que a fatura de *{{servico}}* no valor de *{{valor}}* (vencida em *{{vencimento}}*) ainda consta pendente em nosso sistema. Queremos apoiar você a colocar suas contas em dia sem pesar no seu orçamento! \n\nPor isso, preparamos condições facilitadas de parcelamento ou desconto para quitação à vista. Vamos conversar e achar a melhor proposta juntos?\n\nPara quitação imediata, utilize a nossa chave Pix:\n🔑 `{{chave_pix}}`\n\nResponda a esta mensagem dizendo qual a melhor forma de negociarmos para você. Estamos prontos para te ajudar!\n\nAtenciosamente,\n*Setor de Acordos e Conciliation - {{empresa}}*"
  );

  const [activeTab, setActiveTab] = useState<'finance' | 'tones' | 'templates' | 'rbac'>('finance');

  // RBAC User list and update states
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [userActionFeedback, setUserActionFeedback] = useState<string | null>(null);

  // New pre-approved email whitelist states
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("Operador");

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !newName.trim()) return;

    setUserActionFeedback("Adicionando...");
    try {
      const token = currentUser.isDemo 
        ? `demo-token-${userProfile?.role}` 
        : await currentUser.getIdToken();
        
      const res = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          nome: newName.trim(),
          role: newRole
        })
      });

      if (res.ok) {
        const data = await res.json();
        setUserActionFeedback("Usuário pré-aprovado!");
        setUsersList(prev => [...prev, data.user]);
        setNewEmail("");
        setNewName("");
      } else {
        const errData = await res.json();
        setUserActionFeedback(`Erro: ${errData.error || 'Falha ao registrar'}`);
      }
    } catch (err) {
      setUserActionFeedback("Erro ao registrar.");
    } finally {
      setTimeout(() => setUserActionFeedback(null), 3000);
    }
  };

  const handleDeleteUser = async (targetUid: string) => {
    if (!window.confirm("Deseja realmente revogar o acesso/pré-aprovação deste e-mail?")) return;

    setUserActionFeedback("Excluindo...");
    try {
      const token = currentUser.isDemo 
        ? `demo-token-${userProfile?.role}` 
        : await currentUser.getIdToken();
        
      const res = await fetch(`${API_URL}/api/users/${targetUid}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (res.ok) {
        setUserActionFeedback("Acesso revogado!");
        setUsersList(prev => prev.filter(u => u.uid !== targetUid));
      } else {
        const errData = await res.json();
        setUserActionFeedback(`Erro: ${errData.error || 'Falha ao excluir'}`);
      }
    } catch (err) {
      setUserActionFeedback("Erro ao excluir.");
    } finally {
      setTimeout(() => setUserActionFeedback(null), 3000);
    }
  };

  React.useEffect(() => {
    if (activeTab === 'rbac' && userProfile?.role === 'Administrador') {
      const fetchUsers = async () => {
        setIsUsersLoading(true);
        try {
          const token = currentUser.isDemo 
            ? `demo-token-${userProfile.role}` 
            : await currentUser.getIdToken();
          const res = await fetch(`${API_URL}/api/users`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setUsersList(data.users || []);
          }
        } catch (err) {
          console.error("Erro ao carregar usuários:", err);
        } finally {
          setIsUsersLoading(false);
        }
      };
      fetchUsers();
    }
  }, [activeTab, userProfile, currentUser]);

  const handleUpdateUser = async (targetUid: string, updatedRole: UserRole, updatedPermissions: UserPermission[]) => {
    setUserActionFeedback("Salvando...");
    try {
      const token = currentUser.isDemo 
        ? `demo-token-${userProfile?.role}` 
        : await currentUser.getIdToken();
        
      const res = await fetch(`${API_URL}/api/users/${targetUid}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ role: updatedRole, permissoes: updatedPermissions })
      });

      if (res.ok) {
        setUserActionFeedback("Usuário atualizado!");
        setUsersList(prev => prev.map(u => u.uid === targetUid ? { ...u, role: updatedRole, permissoes: updatedPermissions } : u));
      } else {
        const errorData = await res.json();
        setUserActionFeedback(`Erro: ${errorData.error || 'Falha ao salvar'}`);
      }
    } catch (err) {
      setUserActionFeedback("Erro ao atualizar usuário.");
    } finally {
      setTimeout(() => setUserActionFeedback(null), 3000);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      companyName: companyName.trim() || "WA Fort",
      customSignature: customSignature.trim(),
      paymentMethods: paymentMethods.trim() || "Pix, Boleto",
      pixKey: pixKey.trim(),
      securityPin: securityPin.trim() || "1234",
      promptFriendly: promptFriendly.trim(),
      promptFormal: promptFormal.trim(),
      promptUrgent: promptUrgent.trim(),
      promptNegotiation: promptNegotiation.trim(),
      templateFriendly: templateFriendly,
      templateFormal: templateFormal,
      templateUrgent: templateUrgent,
      templateNegotiation: templateNegotiation
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-150 max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-brand-gold/10 border border-brand-gold/25 text-[#C5A021] shrink-0">
              <Settings className="w-5 h-5 text-brand-gold" />
            </div>
            <div>
              <h3 className="font-bold text-base font-display text-[#1E3A8A]">Painel de Controle WA Fort</h3>
              <p className="text-[11px] text-slate-500">Ajuste dados de recebimento e personalize as mensagens enviadas para todos os contatos</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TABS SELECTOR */}
        <div className="px-5 pt-3 flex border-b border-slate-100 bg-white space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('finance')}
            className={`px-3 py-2 text-xs font-bold transition flex items-center gap-1 border-b-2 ${
              activeTab === 'finance'
                ? 'border-[#1E3A8A] text-[#1E3A8A]'
                : 'border-transparent text-slate-400 hover:text-slate-650'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Financeiro & PIN
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`px-3 py-2 text-xs font-bold transition flex items-center gap-1 border-b-2 ${
              activeTab === 'templates'
                ? 'border-[#1E3A8A] text-[#1E3A8A]'
                : 'border-transparent text-slate-400 hover:text-slate-655'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Roteiros de Mensagens 📝
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tones')}
            className={`px-3 py-2 text-xs font-bold transition flex items-center gap-1 border-b-2 ${
              activeTab === 'tones'
                ? 'border-[#1E3A8A] text-[#1E3A8A]'
                : 'border-transparent text-slate-400 hover:text-slate-500'
            }`}
          >
            <Sparkles className="w-3 h-3 text-brand-gold" />
            Personalidade da IA
          </button>

          {userProfile?.role === 'Administrador' && (
            <button
              type="button"
              onClick={() => setActiveTab('rbac')}
              className={`px-3 py-2 text-xs font-bold transition flex items-center gap-1 border-b-2 ${
                activeTab === 'rbac'
                  ? 'border-[#1E3A8A] text-[#1E3A8A]'
                  : 'border-transparent text-indigo-400 hover:text-indigo-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-650 shrink-0" />
              Controle de Acesso 🔒
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">
            
            {activeTab === 'finance' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Nome Fantasia da Empresa
                  </label>
                  <input
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex: WA Fort Telecom & Central"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10 focus:border-[#1E3A8A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Chave Pix Principal para Recebimento
                  </label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    placeholder="Ex: financeiro@wafort.com.br ou CNPJ"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10 focus:border-[#1E3A8A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Métodos de Pagamento Aceitos
                  </label>
                  <input
                    type="text"
                    required
                    value={paymentMethods}
                    onChange={(e) => setPaymentMethods(e.target.value)}
                    placeholder="Ex: Pix, Código de Barras de Boleto ou Cartão"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10 focus:border-[#1E3A8A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    Assinatura das Mensagens (WhatsApp)
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={customSignature}
                    onChange={(e) => setCustomSignature(e.target.value)}
                    placeholder="Assinatura que acompanhará o rodapé dos textos gerados"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10 focus:border-[#1E3A8A]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center justify-between">
                    <span>PIN de Proteção do Terminal Financeiro 🔒</span>
                    <span className="text-[9px] text-[#1E3A8A] font-bold bg-slate-100 px-1.5 py-0.5 rounded">Apenas Números</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={securityPin}
                    onChange={(e) => setSecurityPin(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder="Padrão: 1234"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10 focus:border-[#1E3A8A]"
                  />
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    PIN de 4 a 6 dígitos para destravar o painel de cobrança financeira da WA Fort. Senha inicial padrão: <strong className="text-slate-600 font-mono">1234</strong>
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'templates' && (
              <div className="space-y-4">
                <div className="p-3 bg-[#1E3A8A]/5 border border-brand-blue/15 rounded-xl flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-[#1E3A8A]">Roteiros Gerais / Mensagens Globais</h5>
                    <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                      Estes são os modelos padrão para todos os contatos. Você pode usar as seguintes tags para que o sistema preencha os dados de cada cliente automaticamente ao selecionar o tom correspondente:
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1 bg-white p-1.5 border border-slate-200 rounded">
                      <code className="text-[9px] text-[#EAB308] bg-slate-50 px-1 font-bold">{"{{cliente}}"}</code>
                      <code className="text-[9px] text-[#EAB308] bg-slate-50 px-1 font-bold">{"{{valor}}"}</code>
                      <code className="text-[9px] text-[#EAB308] bg-slate-50 px-1 font-bold">{"{{vencimento}}"}</code>
                      <code className="text-[9px] text-[#EAB308] bg-slate-50 px-1 font-bold">{"{{servico}}"}</code>
                      <code className="text-[9px] text-[#EAB308] bg-slate-50 px-1 font-bold">{"{{chave_pix}}"}</code>
                      <code className="text-[9px] text-[#EAB308] bg-slate-50 px-1 font-bold">{"{{empresa}}"}</code>
                    </div>
                  </div>
                </div>

                {/* Friendly Template */}
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/25">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between mb-1.5">
                    <span>🌸 1. Tom Amigável (Modelo Geral)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={templateFriendly}
                    onChange={(e) => setTemplateFriendly(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-250 rounded-lg text-[11px] leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                  />
                </div>

                {/* Formal Template */}
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/25">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between mb-1.5">
                    <span>💼 2. Tom Formal (Modelo Geral)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={templateFormal}
                    onChange={(e) => setTemplateFormal(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-250 rounded-lg text-[11px] leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                  />
                </div>

                {/* Urgent Template */}
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/25">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between mb-1.5">
                    <span>⚠️ 3. Tom Urgência (Modelo Geral)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={templateUrgent}
                    onChange={(e) => setTemplateUrgent(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-250 rounded-lg text-[11px] leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                  />
                </div>

                {/* Negotiation Template */}
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50/25">
                  <label className="block text-xs font-bold text-slate-700 flex items-center justify-between mb-1.5">
                    <span>🤝 4. Tom Acordo / Flexível (Modelo Geral)</span>
                  </label>
                  <textarea
                    rows={4}
                    value={templateNegotiation}
                    onChange={(e) => setTemplateNegotiation(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-250 rounded-lg text-[11px] leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                  />
                </div>
              </div>
            )}

            {activeTab === 'tones' && (
              <div className="space-y-4">
                <div className="p-3 bg-[#EAB308]/5 border border-brand-gold/15 rounded-xl flex items-start space-x-2.5">
                  <Sparkles className="w-4 h-4 text-brand-gold shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Você pode refinar o comportamento da IA para cada um dos tons abaixo. A inteligência artificial <b>Gemini 3.5 Flash</b> lerá estas diretrizes adicionais para adaptar o vocabulário e a abordagem ao redigir mensagens dinâmicas!
                  </p>
                </div>

                {/* Friendly Tone */}
                <div className="border border-slate-100 rounded-xl p-3.5 space-y-1.5 bg-slate-50/20">
                  <label className="block text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase">
                    <span>🌸 1. Amigável</span>
                  </label>
                  <textarea
                    rows={2}
                    value={promptFriendly}
                    onChange={(e) => setPromptFriendly(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs leading-normal focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10"
                  />
                </div>

                {/* Formal Tone */}
                <div className="border border-slate-100 rounded-xl p-3.5 space-y-1.5 bg-slate-50/20">
                  <label className="block text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase">
                    <span>💼 2. Formal</span>
                  </label>
                  <textarea
                    rows={2}
                    value={promptFormal}
                    onChange={(e) => setPromptFormal(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs leading-normal focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10"
                  />
                </div>

                {/* Urgent Tone */}
                <div className="border border-slate-100 rounded-xl p-3.5 space-y-1.5 bg-slate-50/20">
                  <label className="block text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase">
                    <span>⚠️ 3. Urgente</span>
                  </label>
                  <textarea
                    rows={2}
                    value={promptUrgent}
                    onChange={(e) => setPromptUrgent(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs leading-normal focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10"
                  />
                </div>

                {/* Negotiation Tone */}
                <div className="border border-slate-100 rounded-xl p-3.5 space-y-1.5 bg-slate-50/20">
                  <label className="block text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase">
                    <span>🤝 4. Acordo</span>
                  </label>
                  <textarea
                    rows={2}
                    value={promptNegotiation}
                    onChange={(e) => setPromptNegotiation(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs leading-normal focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/10 font-sans"
                  />
                </div>
              </div>
            )}

            {activeTab === 'rbac' && (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50/50 border border-indigo-150 rounded-xl flex items-start space-x-2">
                  <Sliders className="w-4 h-4 text-indigo-800 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-indigo-900">Gerenciamento de Perfis & Permissões (RBAC)</h5>
                    <p className="text-[10px] text-slate-500 leading-normal mt-0.5">
                      Como administrador, você pode pré-aprovar novos e-mails Google, alterar funções de operadores e habilitar/desabilitar permissões específicas de rotas.
                    </p>
                  </div>
                </div>

                {/* Form to Pre-approve E-mails */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <h6 className="text-xs font-bold text-slate-700">Pré-aprovar E-mail (Novo Operador)</h6>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome completo"
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                    />
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="E-mail Google"
                      className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1E3A8A]"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as UserRole)}
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-800 font-bold focus:outline-none focus:ring-1 focus:ring-[#1E3A8A] flex-1"
                      >
                        <option value="Administrador">Admin</option>
                        <option value="Supervisor">Supervisor</option>
                        <option value="Financeiro">Financeiro</option>
                        <option value="Operador">Operador</option>
                        <option value="Auditor">Auditor</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleCreateUser}
                        className="px-3 bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold text-xs rounded-lg shadow-sm cursor-pointer"
                      >
                        Adicionar
                      </button>
                    </div>
                  </div>
                </div>

                {userActionFeedback && (
                  <div className="p-2 text-xs font-bold text-center bg-indigo-100 text-indigo-800 rounded-lg">
                    {userActionFeedback}
                  </div>
                )}

                {isUsersLoading ? (
                  <div className="text-center py-6 text-slate-500 text-xs">Carregando operadores cadastrados...</div>
                ) : (
                  <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                    {usersList.length === 0 ? (
                      <div className="text-center py-4 text-slate-400 text-xs">Nenhum outro usuário registrado no banco.</div>
                    ) : (
                      usersList.map((user) => (
                        <div key={user.uid} className="border border-slate-100 rounded-xl p-3 bg-slate-50/30 flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-xs font-bold text-slate-800">{user.nome}</span>
                              <span className="block text-[10px] text-slate-400 font-mono">{user.email}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {/* Role Selector */}
                              <select
                                value={user.role}
                                onChange={(e) => {
                                  const newRole = e.target.value as UserRole;
                                  const newPerms = ROLE_PERMISSIONS[newRole];
                                  handleUpdateUser(user.uid, newRole, newPerms);
                                }}
                                className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1 font-bold outline-none cursor-pointer"
                              >
                                <option value="Administrador">Administrador</option>
                                <option value="Supervisor">Supervisor</option>
                                <option value="Financeiro">Financeiro</option>
                                <option value="Operador">Operador</option>
                                <option value="Auditor">Auditor</option>
                              </select>

                              {/* Delete button (do not show for the current admin user to prevent self-deletion) */}
                              {user.email !== userProfile?.email && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user.uid)}
                                  className="p-1 hover:bg-red-50 text-red-500 rounded hover:text-red-700 transition cursor-pointer"
                                  title="Excluir / Revogar Acesso"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Permissions Checkbox Grid */}
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">Permissões Específicas:</span>
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-1.5">
                              {(['Visualizar', 'Criar', 'Editar', 'Excluir', 'Aprovar'] as UserPermission[]).map((p) => {
                                const hasPerm = user.permissoes.includes(p);
                                return (
                                  <label key={p} className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-650 font-medium select-none">
                                    <input
                                      type="checkbox"
                                      checked={hasPerm}
                                      onChange={() => {
                                        const newPerms = hasPerm
                                          ? user.permissoes.filter(x => x !== p)
                                          : [...user.permissoes, p];
                                        handleUpdateUser(user.uid, user.role, newPerms);
                                      }}
                                      className="rounded text-[#1E3A8A] focus:ring-[#1E3A8A]/20"
                                    />
                                    <span>{p}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer Info Statement */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Sliders className="w-3 h-3 text-slate-350" /> Ajuste em tempo real
            </span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl transition font-bold cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs bg-[#1E3A8A] hover:bg-blue-950 text-white font-bold rounded-xl shadow-md transition flex items-center space-x-1.5 border border-transparent cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                <span>Salvar Tudo</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
