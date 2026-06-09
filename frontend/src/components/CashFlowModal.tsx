/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  X, 
  Layers, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  ArrowRightLeft,
  Calendar, 
  User, 
  Clock, 
  Coins, 
  AlertCircle, 
  RefreshCw,
  FileSpreadsheet,
  ShieldCheck,
  Search
} from "lucide-react";
import { UserProfile, UserRole, UserPermission } from "../types";
import { API_URL } from "../config";

interface CashFlowModalProps {
  onClose: () => void;
  userProfile: UserProfile | null;
  currentUser: any;
  showAlert: (message: string, title?: string) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
}

interface CaixaMovimento {
  id: string;
  tipo: 'entrada' | 'saida' | 'transferencia';
  categoria: string;
  descricao: string;
  valor: number;
  operadorId: string;
  operadorNome: string;
  dataMovimento: string;
  createdAt: string;
  status: 'ativo' | 'estornado';
}

interface AuditLog {
  id: string;
  operadorId: string;
  operadorNome: string;
  acao: string;
  entidade: string;
  entidadeId: string;
  ip: string;
  createdAt: string;
}

interface SummaryData {
  saldoAtual: number;
  entradasHoje: number;
  saidasHoje: number;
  fluxoMensal: number;
}

export function CashFlowModal({ onClose, userProfile, currentUser, showAlert, showConfirm }: CashFlowModalProps) {
  const [activeTab, setActiveTab] = useState<'operacional' | 'auditoria'>('operacional');
  
  // Data lists
  const [movements, setMovements] = useState<CaixaMovimento[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<SummaryData>({
    saldoAtual: 0,
    entradasHoje: 0,
    saidasHoje: 0,
    fluxoMensal: 0
  });

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form states
  const [formType, setFormType] = useState<'entrada' | 'saida' | 'transferencia'>('entrada');
  const [formCategoria, setFormCategoria] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formDataMovimento, setFormDataMovimento] = useState(() => new Date().toISOString().split('T')[0]);

  // Filters
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterOperadorId, setFilterOperadorId] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');

  // Operators list for filter (computed from movements/logs to avoid extra fetches)
  const [operators, setOperators] = useState<{ id: string; name: string }[]>([]);

  // Permission checking
  const hasPermission = (permission: UserPermission): boolean => {
    if (!userProfile) return false;
    return userProfile.permissoes.includes(permission);
  };

  const isDemo = currentUser?.isDemo;

  // Format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Fetch summaries and movements
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      // 1. Fetch summary
      const summaryRes = await fetch(`${API_URL}/api/caixa/resumo`, { headers });
      if (summaryRes.ok) {
        const data = await summaryRes.json();
        setSummary(data);
      }

      // 2. Fetch movements with active filters
      let queryUrl = `${API_URL}/api/caixa?`;
      if (filterStartDate) queryUrl += `startDate=${filterStartDate}&`;
      if (filterEndDate) queryUrl += `endDate=${filterEndDate}&`;
      if (filterOperadorId) queryUrl += `operadorId=${filterOperadorId}&`;
      if (filterStatus !== 'todos') queryUrl += `status=${filterStatus}&`;

      const movementsRes = await fetch(queryUrl, { headers });
      if (movementsRes.ok) {
        const data = await movementsRes.json();
        setMovements(data.movements || []);

        // Build operators list dynamically for filter dropdown
        const opsMap = new Map<string, string>();
        (data.movements || []).forEach((m: CaixaMovimento) => {
          if (m.operadorId && m.operadorNome) {
            opsMap.set(m.operadorId, m.operadorNome);
          }
        });
        const opsList: { id: string; name: string }[] = [];
        opsMap.forEach((name, id) => {
          opsList.push({ id, name });
        });
        setOperators(opsList);
      }

      // 3. Fetch audit logs if audit tab is active
      if (activeTab === 'auditoria') {
        const auditRes = await fetch(`${API_URL}/api/caixa/auditoria`, { headers });
        if (auditRes.ok) {
          const data = await auditRes.json();
          setAuditLogs(data.logs || []);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados do caixa:", err);
      showAlert("Não foi possível carregar os dados financeiros do servidor.", "Erro de Comunicação");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterStartDate, filterEndDate, filterOperadorId, filterStatus, activeTab]);

  // Set default categories when form type changes
  useEffect(() => {
    if (formType === 'entrada') {
      setFormCategoria('Recebimento de Cliente');
    } else if (formType === 'saida') {
      setFormCategoria('Infraestrutura');
    } else {
      setFormCategoria('Transferência Bancária');
    }
  }, [formType]);

  // Form Submit handler
  const handleRegisterMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategoria.trim() || !formDescricao.trim() || !formValor || Number(formValor) <= 0) {
      showAlert("Por favor, preencha todos os campos corretamente com um valor positivo.", "Campos Inválidos");
      return;
    }

    setIsSubmitLoading(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        categoria: formCategoria,
        descricao: formDescricao,
        valor: Number(formValor),
        dataMovimento: formDataMovimento
      };

      const res = await fetch(`${API_URL}/api/caixa/${formType}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setFormDescricao('');
        setFormValor('');
        showAlert("Movimentação registrada com sucesso no caixa e log de auditoria criado.", "Sucesso");
        fetchData();
      } else {
        const data = await res.json();
        showAlert(data.error || "Ocorreu um erro ao registrar a movimentação.", "Falha de Registro");
      }
    } catch (err) {
      console.error("Erro ao enviar movimento:", err);
      showAlert("Não foi possível registrar a movimentação no servidor.", "Erro de Conexão");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  // Reversal handler
  const handleReversal = (id: string, description: string, value: number) => {
    showConfirm(
      `Tem certeza absoluta de que deseja estornar a movimentação "${description}" no valor de ${formatCurrency(value)}? O saldo será recalculado e a auditoria registrará o seu usuário.`,
      async () => {
        try {
          const token = isDemo ? 'demo-token-admin' : await currentUser.getIdToken();
          const headers: any = { 'Content-Type': 'application/json' };
          if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${API_URL}/api/caixa/${id}/estorno`, {
            method: 'POST',
            headers
          });

          if (res.ok) {
            showAlert("Movimentação estornada com sucesso e saldo atualizado.", "Estornado");
            fetchData();
          } else {
            const data = await res.json();
            showAlert(data.error || "Não foi possível estornar a movimentação.", "Falha de Estorno");
          }
        } catch (err) {
          console.error("Erro ao estornar:", err);
          showAlert("Erro de conexão ao tentar estornar no servidor.", "Erro de Conexão");
        }
      },
      "Confirmar Estorno"
    );
  };

  // Export CSV
  const handleExportCSV = () => {
    if (movements.length === 0) {
      showAlert("Não há dados de caixa para exportar.", "Erro");
      return;
    }

    const headers = ["ID", "Tipo", "Categoria", "Descrição", "Valor (BRL)", "Operador", "Data Movimento", "Criado Em", "Status"];
    const rows = movements.map(m => [
      m.id,
      m.tipo.toUpperCase(),
      m.categoria,
      m.descricao,
      m.valor.toFixed(2),
      m.operadorNome,
      m.dataMovimento.split('-').reverse().join('/'),
      m.createdAt,
      m.status.toUpperCase()
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(";"),
      ...rows.map(line => line.map(field => `"${String(field).replace(/"/g, '""')}"`).join(";"))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `WA_FORT_Movimento_Caixa_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-slate-100/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-5xl w-full flex flex-col my-8">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-brand-blue/5 border border-brand-blue/10 shrink-0">
              <Layers className="w-6 h-6 text-brand-blue" />
            </div>
            <div>
              <h3 className="font-bold text-lg font-display text-brand-blue flex items-center gap-2">
                Fluxo de Caixa & Movimentações
                <span className="text-[10px] bg-emerald-600 font-bold px-1.5 py-0.5 rounded text-white tracking-widest uppercase">
                  Auditoria Ativa
                </span>
              </h3>
              <p className="text-xs text-slate-500">Módulo financeiro de entradas, saídas, transferências e conciliação de auditoria</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TABS SELECTOR */}
        <div className="px-6 border-b border-slate-100 bg-white flex items-center justify-between">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('operacional')}
              className={`py-3.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'operacional' 
                  ? 'border-brand-blue text-brand-blue' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Movimentações & Lançamentos
            </button>
            <button
              onClick={() => setActiveTab('auditoria')}
              className={`py-3.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'auditoria' 
                  ? 'border-brand-blue text-brand-blue' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Histórico de Auditoria Geral
            </button>
          </div>

          <button
            onClick={fetchData}
            disabled={isLoading}
            className="text-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
        </div>

        {/* SCROLLABLE CONTAINER */}
        <div className="p-6 overflow-y-auto max-h-[68vh] space-y-6 flex-1">
          
          {/* DASHBOARD SUMMARY WIDGETS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-brand-blue/5 border border-brand-blue/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-brand-blue tracking-wider">Saldo em Caixa</span>
                <span className="text-xl font-bold font-display text-slate-900 leading-tight">
                  {formatCurrency(summary.saldoAtual)}
                </span>
                <span className="block text-[9px] text-slate-400 mt-0.5">Saldo acumulado ativo</span>
              </div>
              <div className="p-2.5 rounded-xl bg-brand-blue/10 text-brand-blue">
                <Coins className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-emerald-600 tracking-wider">Entradas (Hoje)</span>
                <span className="text-xl font-bold font-display text-emerald-700 leading-tight">
                  {formatCurrency(summary.entradasHoje)}
                </span>
                <span className="block text-[9px] text-emerald-500 font-semibold mt-0.5">Créditos de hoje</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-red-650 tracking-wider">Saídas (Hoje)</span>
                <span className="text-xl font-bold font-display text-red-700 leading-tight">
                  {formatCurrency(summary.saidasHoje)}
                </span>
                <span className="block text-[9px] text-red-400 font-semibold mt-0.5">Débitos liquidados</span>
              </div>
              <div className="p-2.5 rounded-xl bg-red-105 text-red-700">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-blue-50/70 border border-blue-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-blue-600 tracking-wider">Fluxo Mensal (Líquido)</span>
                <span className="text-xl font-bold font-display text-blue-700 leading-tight">
                  {formatCurrency(summary.fluxoMensal)}
                </span>
                <span className="block text-[9px] text-blue-500 font-semibold mt-0.5">Balanço do mês atual</span>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
            </div>

          </div>

          {activeTab === 'operacional' ? (
            <>
              {/* TWO COLUMN INTERFACE: Launch Form & History */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                
                {/* COLUMN 1: FORM TO REGISTER TRANSACTION */}
                {hasPermission('Criar') ? (
                  <form onSubmit={handleRegisterMovement} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                    <h4 className="font-bold text-xs text-brand-blue flex items-center gap-1.5 uppercase tracking-wider">
                      <Plus className="w-4 h-4 text-emerald-600" /> Lançar Nova Movimentação
                    </h4>

                    {/* Form Type Tab Selector */}
                    <div className="grid grid-cols-3 gap-1 p-1 bg-slate-200/80 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setFormType('entrada')}
                        className={`py-1 text-[9px] font-black uppercase rounded-md transition cursor-pointer ${formType === 'entrada' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Entrada
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormType('saida')}
                        className={`py-1 text-[9px] font-black uppercase rounded-md transition cursor-pointer ${formType === 'saida' ? 'bg-rose-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Saída
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormType('transferencia')}
                        className={`py-1 text-[9px] font-black uppercase rounded-md transition cursor-pointer ${formType === 'transferencia' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Transferência
                      </button>
                    </div>

                    {/* Category Selection */}
                    <div>
                      <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                        Categoria
                      </label>
                      {formType === 'entrada' && (
                        <select
                          value={formCategoria}
                          onChange={(e) => setFormCategoria(e.target.value)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-emerald-600"
                        >
                          <option value="Recebimento de Cliente">Recebimento de Cliente</option>
                          <option value="Mensalidades">Mensalidades</option>
                          <option value="Aporte Financeiro">Aporte Financeiro</option>
                          <option value="Outros Recebimentos">Outros Recebimentos</option>
                        </select>
                      )}
                      {formType === 'saida' && (
                        <select
                          value={formCategoria}
                          onChange={(e) => setFormCategoria(e.target.value)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-rose-600"
                        >
                          <option value="Infraestrutura">Infraestrutura</option>
                          <option value="Servidores e APIs">Servidores e APIs</option>
                          <option value="Salários / Comissões">Salários / Comissões</option>
                          <option value="Marketing / Comercial">Marketing / Comercial</option>
                          <option value="Impostos / Encargos">Impostos / Encargos</option>
                          <option value="Despesas Gerais">Despesas Gerais</option>
                        </select>
                      )}
                      {formType === 'transferencia' && (
                        <select
                          value={formCategoria}
                          onChange={(e) => setFormCategoria(e.target.value)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-blue-600"
                        >
                          <option value="Transferência Bancária">Transferência Bancária</option>
                          <option value="Caixa Geral -> Banco">Caixa Geral {"->"} Banco</option>
                          <option value="Banco -> Caixa Geral">Banco {"->"} Caixa Geral</option>
                          <option value="Ajuste de Saldo">Ajuste de Saldo</option>
                        </select>
                      )}
                    </div>

                    {/* Value Field */}
                    <div>
                      <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                        Valor (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="Ex: 150.00"
                        value={formValor}
                        onChange={(e) => setFormValor(e.target.value)}
                        className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-slate-500"
                      />
                    </div>

                    {/* Date Field */}
                    <div>
                      <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                        Data da Movimentação
                      </label>
                      <input
                        type="date"
                        required
                        value={formDataMovimento}
                        onChange={(e) => setFormDataMovimento(e.target.value)}
                        className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-slate-500 font-mono"
                      />
                    </div>

                    {/* Description Field */}
                    <div>
                      <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                        Descrição / Detalhes
                      </label>
                      <textarea
                        required
                        rows={2}
                        placeholder="Descreva o motivo desta transação"
                        value={formDescricao}
                        onChange={(e) => setFormDescricao(e.target.value)}
                        className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-slate-500 resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitLoading}
                      className={`w-full py-3 text-xs font-black rounded-xl text-white transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 ${
                        formType === 'entrada' ? 'bg-emerald-600 hover:bg-emerald-700' :
                        formType === 'saida' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      {isSubmitLoading ? "Processando..." : "Registrar Transação"}
                    </button>
                  </form>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <span className="text-xs font-semibold block">Acesso restrito para criar lançamentos</span>
                    <span className="text-[10px] mt-1 block">Sua conta atual não possui a permissão de Criar movimentações.</span>
                  </div>
                )}

                {/* COLUMN 2 & 3: HISTORY LIST AND FILTERS */}
                <div className="lg:col-span-2 space-y-4">
                  
                  {/* FILTERS PANEL */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                    <h5 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider flex items-center gap-1">
                      <Search className="w-3.5 h-3.5" /> Filtrar Histórico de Caixa
                    </h5>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[8px] uppercase font-black text-slate-400 mb-1">Data Início</label>
                        <input
                          type="date"
                          value={filterStartDate}
                          onChange={(e) => setFilterStartDate(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase font-black text-slate-400 mb-1">Data Fim</label>
                        <input
                          type="date"
                          value={filterEndDate}
                          onChange={(e) => setFilterEndDate(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] font-mono outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase font-black text-slate-400 mb-1">Operador</label>
                        <select
                          value={filterOperadorId}
                          onChange={(e) => setFilterOperadorId(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] outline-none"
                        >
                          <option value="">Todos</option>
                          {operators.map(op => (
                            <option key={op.id} value={op.id}>{op.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[8px] uppercase font-black text-slate-400 mb-1">Status</label>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] outline-none"
                        >
                          <option value="todos">Todos</option>
                          <option value="ativo">Ativos</option>
                          <option value="estornado">Estornados</option>
                        </select>
                      </div>
                    </div>

                    {(filterStartDate || filterEndDate || filterOperadorId || filterStatus !== 'todos') && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            setFilterStartDate('');
                            setFilterEndDate('');
                            setFilterOperadorId('');
                            setFilterStatus('todos');
                          }}
                          className="text-[9px] text-brand-blue font-bold hover:underline"
                        >
                          Limpar Filtros
                        </button>
                      </div>
                    )}
                  </div>

                  {/* DATATABLE */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">Lançamentos Recentes</span>
                      <button
                        onClick={handleExportCSV}
                        className="text-[10px] bg-brand-blue hover:bg-blue-900 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-bold transition cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3 h-3" />
                        Exportar (.CSV)
                      </button>
                    </div>

                    <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                              <th className="p-3 pl-4">Tipo</th>
                              <th className="p-3">Data</th>
                              <th className="p-3">Categoria/Motivo</th>
                              <th className="p-3">Operador</th>
                              <th className="p-3 text-right">Valor</th>
                              <th className="p-3 text-right pr-4">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-slate-400">
                                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-2" />
                                  Carregando movimentações do servidor...
                                </td>
                              </tr>
                            ) : movements.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="p-8 text-center text-slate-400">
                                  Nenhuma movimentação de caixa encontrada.
                                </td>
                              </tr>
                            ) : (
                              movements.map(m => {
                                let badge = (
                                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-250">
                                    Entrada
                                  </span>
                                );
                                if (m.tipo === 'saida') {
                                  badge = (
                                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-rose-700 bg-rose-50 border border-rose-250">
                                      Saída
                                    </span>
                                  );
                                } else if (m.tipo === 'transferencia') {
                                  badge = (
                                    <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-blue-700 bg-blue-50 border border-blue-250">
                                      Transf
                                    </span>
                                  );
                                }

                                const isReversed = m.status === 'estornado';

                                return (
                                  <tr key={m.id} className={`hover:bg-slate-50/50 ${isReversed ? 'opacity-55 line-through bg-slate-50' : ''}`}>
                                    <td className="p-3 pl-4 font-semibold">
                                      {badge}
                                    </td>
                                    <td className="p-3 text-slate-650 font-mono text-[11px]">
                                      {m.dataMovimento.split('-').reverse().join('/')}
                                    </td>
                                    <td className="p-3 max-w-[150px] truncate">
                                      <span className="block font-bold text-slate-800">{m.categoria}</span>
                                      <span className="block text-[10px] text-slate-400 truncate">{m.descricao}</span>
                                    </td>
                                    <td className="p-3 text-slate-600 font-medium text-[11px]">
                                      {m.operadorNome}
                                    </td>
                                    <td className={`p-3 text-right font-black font-mono text-[11px] ${
                                      isReversed ? 'text-slate-500' :
                                      m.tipo === 'entrada' ? 'text-emerald-600' : 
                                      m.tipo === 'saida' ? 'text-rose-600' : 'text-blue-600'
                                    }`}>
                                      {formatCurrency(m.valor)}
                                    </td>
                                    <td className="p-3 text-right pr-4">
                                      {!isReversed && hasPermission('Aprovar') ? (
                                        <button
                                          onClick={() => handleReversal(m.id, m.descricao, m.valor)}
                                          className="text-[9px] bg-red-500/10 hover:bg-red-500 text-red-650 hover:text-white px-2 py-1 rounded border border-red-500/20 transition cursor-pointer"
                                        >
                                          Estornar
                                        </button>
                                      ) : isReversed ? (
                                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase border border-slate-200">
                                          Estornado
                                        </span>
                                      ) : (
                                        <span className="text-slate-350 text-[10px]">-</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                  </div>

                </div>

              </div>
            </>
          ) : (
            /* AUDIT LOG TAB */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-xs text-brand-blue flex items-center gap-1.5 uppercase tracking-wider">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 animate-pulse" /> Registro Geral de Auditoria Operacional
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Logs de conciliação invioláveis gravados em tempo real pelas chaves do servidor.</p>
                </div>
              </div>

              <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                      <th className="p-3 pl-4">Timestamp</th>
                      <th className="p-3">Ação</th>
                      <th className="p-3">Operador</th>
                      <th className="p-3">Entidade Ref</th>
                      <th className="p-3 font-mono">Endereço IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-450 font-sans">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-2" />
                          Carregando logs de auditoria...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-sans">
                          Nenhum log de auditoria gravado no sistema.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map(log => {
                        let actionBadge = (
                          <span className="px-2 py-0.5 rounded-sm bg-slate-100 text-slate-600 border border-slate-200 font-black uppercase text-[8px]">
                            {log.acao}
                          </span>
                        );
                        if (log.acao === 'REGISTRAR_ENTRADA') {
                          actionBadge = (
                            <span className="px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200 font-black uppercase text-[8px]">
                              Entrada
                            </span>
                          );
                        } else if (log.acao === 'REGISTRAR_SAIDA') {
                          actionBadge = (
                            <span className="px-2 py-0.5 rounded-sm bg-rose-50 text-rose-700 border border-rose-250 font-black uppercase text-[8px]">
                              Saída
                            </span>
                          );
                        } else if (log.acao === 'REGISTRAR_TRANSFERENCIA') {
                          actionBadge = (
                            <span className="px-2 py-0.5 rounded-sm bg-blue-50 text-blue-700 border border-blue-200 font-black uppercase text-[8px]">
                              Transferência
                            </span>
                          );
                        } else if (log.acao === 'ESTORNAR_MOVIMENTO') {
                          actionBadge = (
                            <span className="px-2 py-0.5 rounded-sm bg-red-500/10 text-red-650 border border-red-500/20 font-black uppercase text-[8px]">
                              Estorno
                            </span>
                          );
                        }

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50">
                            <td className="p-3 pl-4 text-slate-400">
                              {new Date(log.createdAt).toLocaleString('pt-BR')}
                            </td>
                            <td className="p-3 font-semibold">
                              {actionBadge}
                            </td>
                            <td className="p-3 text-slate-700 font-sans font-semibold">
                              {log.operadorNome} <span className="text-slate-400 font-mono text-[9px]">({log.operadorId.substring(0,6)}...)</span>
                            </td>
                            <td className="p-3 text-slate-500">
                              {log.entidade}/{log.entidadeId}
                            </td>
                            <td className="p-3 text-slate-500 font-bold select-all">
                              {log.ip}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* FOOTER Close Buttons */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-between items-center">
          <span className="text-[9px] text-slate-400 font-semibold tracking-wider uppercase flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Canal Seguro WA Fort
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs bg-brand-blue hover:bg-blue-900 text-white font-bold rounded-xl cursor-pointer transition shadow-sm"
          >
            Fechar Painel Financeiro
          </button>
        </div>

      </div>
    </div>
  );
}
