/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  X, 
  Plus, 
  Calendar, 
  User, 
  Search, 
  RefreshCw, 
  Edit, 
  Ban, 
  Copy, 
  CheckCircle2, 
  ShieldCheck, 
  QrCode, 
  Barcode, 
  Info, 
  DollarSign, 
  FileText, 
  AlertCircle,
  FileSpreadsheet,
  Check,
  TrendingUp,
  Clock,
  Layers,
  ArrowRightLeft
} from "lucide-react";
import { UserProfile, UserPermission } from "../types";
import { API_URL } from "../config";

interface DuplicatasModalProps {
  onClose: () => void;
  userProfile: UserProfile | null;
  currentUser: any;
  showAlert: (message: string, title?: string) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
}

interface Duplicata {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteDocumento: string;
  numeroDuplicata: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: 'Pendente' | 'Pago' | 'Vencido' | 'Cancelado' | 'Negociado';
  observacoes?: string;
  pixCopiaECola?: string;
  boletoBarCode?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
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

export function DuplicatasModal({ onClose, userProfile, currentUser, showAlert, showConfirm }: DuplicatasModalProps) {
  const [activeTab, setActiveTab] = useState<'gestao' | 'auditoria'>('gestao');
  
  // Data lists
  const [duplicatas, setDuplicatas] = useState<Duplicata[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitLoading, setIsSubmitLoading] = useState(false);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formClienteNome, setFormClienteNome] = useState('');
  const [formClienteDocumento, setFormClienteDocumento] = useState('');
  const [formNumeroDuplicata, setFormNumeroDuplicata] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formVencimento, setFormVencimento] = useState(() => new Date().toISOString().split('T')[0]);
  const [formDescricao, setFormDescricao] = useState('');
  const [formObservacoes, setFormObservacoes] = useState('');
  const [formStatus, setFormStatus] = useState<'Pendente' | 'Pago' | 'Vencido' | 'Cancelado' | 'Negociado'>('Pendente');

  // Filters
  const [filterCliente, setFilterCliente] = useState('');
  const [filterDocumento, setFilterDocumento] = useState('');
  const [filterVencimento, setFilterVencimento] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');

  // Copied indicator
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const isDemo = currentUser?.isDemo;

  const hasPermission = (permission: UserPermission): boolean => {
    if (!userProfile) return false;
    return userProfile.permissoes.includes(permission);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const resetForm = () => {
    setEditingId(null);
    setFormClienteNome('');
    setFormClienteDocumento('');
    setFormNumeroDuplicata('');
    setFormValor('');
    setFormVencimento(new Date().toISOString().split('T')[0]);
    setFormDescricao('');
    setFormObservacoes('');
    setFormStatus('Pendente');
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      let queryUrl = `${API_URL}/api/duplicatas?`;
      if (filterCliente) queryUrl += `cliente=${encodeURIComponent(filterCliente)}&`;
      if (filterDocumento) queryUrl += `documento=${encodeURIComponent(filterDocumento)}&`;
      if (filterVencimento) queryUrl += `vencimento=${filterVencimento}&`;
      if (filterStatus !== 'todos') queryUrl += `status=${filterStatus}&`;

      const res = await fetch(queryUrl, { headers });
      if (res.ok) {
        const data = await res.json();
        setDuplicatas(data.duplicatas || []);
      }

      if (activeTab === 'auditoria') {
        const auditRes = await fetch(`${API_URL}/api/duplicatas/auditoria`, { headers });
        if (auditRes.ok) {
          const data = await auditRes.json();
          setAuditLogs(data.logs || []);
        }
      }
    } catch (err) {
      console.error("Erro ao carregar duplicatas:", err);
      showAlert("Não foi possível carregar as duplicatas do servidor.", "Erro de Comunicação");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterCliente, filterDocumento, filterVencimento, filterStatus, activeTab]);

  const handleRegisterDuplicata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formClienteNome.trim() || !formClienteDocumento.trim() || !formNumeroDuplicata.trim() || !formValor || Number(formValor) <= 0 || !formVencimento) {
      showAlert("Por favor, preencha todos os campos obrigatórios corretamente.", "Campos Inválidos");
      return;
    }

    setIsSubmitLoading(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        clienteNome: formClienteNome.trim(),
        clienteDocumento: formClienteDocumento.trim(),
        numeroDuplicata: formNumeroDuplicata.trim(),
        valor: Number(formValor),
        vencimento: formVencimento,
        descricao: formDescricao.trim(),
        observacoes: formObservacoes.trim()
      };

      let res;
      if (editingId) {
        res = await fetch(`${API_URL}/api/duplicatas/${editingId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...payload, status: formStatus })
        });
      } else {
        res = await fetch(`${API_URL}/api/duplicatas`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        resetForm();
        showAlert(editingId ? "Duplicata atualizada com sucesso." : "Duplicata criada com sucesso no sistema da WA Fort.", "Sucesso");
        fetchData();
      } else {
        const data = await res.json();
        showAlert(data.error || "Ocorreu um erro ao salvar a duplicata.", "Falha de Registro");
      }
    } catch (err) {
      console.error("Erro ao salvar duplicata:", err);
      showAlert("Não foi possível salvar a duplicata no servidor.", "Erro de Conexão");
    } finally {
      setIsSubmitLoading(false);
    }
  };

  const handleEditClick = (d: Duplicata) => {
    setEditingId(d.id);
    setFormClienteNome(d.clienteNome);
    setFormClienteDocumento(d.clienteDocumento);
    setFormNumeroDuplicata(d.numeroDuplicata);
    setFormValor(String(d.valor));
    setFormVencimento(d.vencimento);
    setFormDescricao(d.descricao || '');
    setFormObservacoes(d.observacoes || '');
    setFormStatus(d.status);
    
    // Smooth scroll to form in small screens
    const formElement = document.getElementById("duplicata-form");
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCancelClick = (id: string, numero: string) => {
    showConfirm(
      `Tem certeza absoluta de que deseja cancelar a duplicata número "${numero}"? O status será alterado para Cancelado permanente e registrado nos logs de auditoria.`,
      async () => {
        try {
          const token = isDemo ? 'demo-token-admin' : await currentUser.getIdToken();
          const headers: any = { 'Content-Type': 'application/json' };
          if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${API_URL}/api/duplicatas/${id}/cancelar`, {
            method: 'POST',
            headers
          });

          if (res.ok) {
            showAlert("Duplicata cancelada com sucesso.", "Cancelada");
            fetchData();
          } else {
            const data = await res.json();
            showAlert(data.error || "Não foi possível cancelar a duplicata.", "Falha de Operação");
          }
        } catch (err) {
          console.error("Erro ao cancelar:", err);
          showAlert("Erro de conexão ao tentar cancelar no servidor.", "Erro de Conexão");
        }
      },
      "Confirmar Cancelamento"
    );
  };

  const handleQuickStatusUpdate = (id: string, numero: string, targetStatus: 'Pago' | 'Negociado' | 'Pendente') => {
    const actionText = targetStatus === 'Pago' ? 'marcar como Pago' : targetStatus === 'Negociado' ? 'marcar como Negociado' : 'retornar para Pendente';
    showConfirm(
      `Confirma a ação de ${actionText} para a duplicata "${numero}"? Isso registrará seu operador no log de auditoria.`,
      async () => {
        try {
          const token = isDemo ? 'demo-token-admin' : await currentUser.getIdToken();
          const headers: any = { 'Content-Type': 'application/json' };
          if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${API_URL}/api/duplicatas/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ status: targetStatus })
          });

          if (res.ok) {
            showAlert(`Duplicata atualizada com sucesso.`, "Status Atualizado");
            fetchData();
          } else {
            const data = await res.json();
            showAlert(data.error || "Não foi possível atualizar o status.", "Falha de Status");
          }
        } catch (err) {
          console.error("Erro ao alterar status:", err);
          showAlert("Erro de conexão com o servidor ao alterar o status.", "Erro de Conexão");
        }
      },
      "Confirmar Mudança de Status"
    );
  };

  const handleCopyClipboard = (text: string, labelId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(labelId);
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  const handleExportCSV = () => {
    if (duplicatas.length === 0) {
      showAlert("Não há dados de duplicatas para exportar.", "Erro");
      return;
    }

    const headers = ["ID", "Nº Duplicata", "Cliente", "CPF/CNPJ", "Vencimento", "Valor (BRL)", "Status", "Descrição", "Criador", "Criado Em"];
    const rows = duplicatas.map(d => [
      d.id,
      d.numeroDuplicata,
      d.clienteNome,
      d.clienteDocumento,
      d.vencimento.split('-').reverse().join('/'),
      d.valor.toFixed(2),
      d.status.toUpperCase(),
      d.descricao || '',
      d.createdByName,
      d.createdAt
    ]);

    const csvContent = "\uFEFF" + [
      headers.join(";"),
      ...rows.map(line => line.map(field => `"${String(field).replace(/"/g, '""')}"`).join(";"))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `WA_FORT_Duplicatas_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Stats calculation
  const getStats = () => {
    let totalEmitido = 0;
    let totalPendente = 0;
    let totalVencido = 0;
    let totalPago = 0;
    let totalNegociado = 0;

    duplicatas.forEach(d => {
      if (d.status !== 'Cancelado') {
        totalEmitido += d.valor;
      }
      if (d.status === 'Pendente') totalPendente += d.valor;
      else if (d.status === 'Vencido') totalVencido += d.valor;
      else if (d.status === 'Pago') totalPago += d.valor;
      else if (d.status === 'Negociado') totalNegociado += d.valor;
    });

    return { totalEmitido, totalPendente, totalVencido, totalPago, totalNegociado };
  };

  const stats = getStats();

  return (
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto antialiased">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-6xl w-full flex flex-col my-8 outline-hidden">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[#C5A021] shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg font-display text-[#1E3A8A] flex items-center gap-2">
                Controle de Duplicatas & Cobranças
                <span className="text-[10px] bg-amber-600 font-bold px-1.5 py-0.5 rounded text-white tracking-widest uppercase">
                  Boleto & Pix Ready
                </span>
              </h3>
              <p className="text-xs text-slate-500">Gestão integrada de duplicatas comerciais, termos de responsabilidade e auditoria</p>
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
        <div className="px-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('gestao')}
              className={`py-3.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'gestao' 
                  ? 'border-[#C5A021] text-[#C5A021] font-black' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Duplicatas Comerciais
            </button>
            <button
              onClick={() => setActiveTab('auditoria')}
              className={`py-3.5 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'auditoria' 
                  ? 'border-[#C5A021] text-[#C5A021] font-black' 
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              Auditoria de Duplicatas
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

        {/* SCROLLABLE MAIN CONTAINER */}
        <div className="p-6 overflow-y-auto max-h-[72vh] space-y-6 flex-1">
          
          {/* DASHBOARD STATS WIDGETS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            <div className="bg-[#1E3A8A]/5 border border-[#1E3A8A]/10 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-blue-650 tracking-wider">Total Emitido</span>
                <span className="text-lg font-bold font-display text-slate-900 leading-tight">
                  {formatCurrency(stats.totalEmitido)}
                </span>
                <span className="block text-[9px] text-slate-450 mt-0.5">Emissão ativa total</span>
              </div>
              <div className="p-2 rounded-xl bg-blue-105 text-[#1E3A8A]">
                <Layers className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-emerald-600 tracking-wider">Total Recebido</span>
                <span className="text-lg font-bold font-display text-emerald-700 leading-tight">
                  {formatCurrency(stats.totalPago)}
                </span>
                <span className="block text-[9px] text-emerald-500 font-semibold mt-0.5">Liquidados</span>
              </div>
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-amber-600 tracking-wider">Pendente</span>
                <span className="text-lg font-bold font-display text-amber-700 leading-tight">
                  {formatCurrency(stats.totalPendente)}
                </span>
                <span className="block text-[9px] text-amber-500 font-semibold mt-0.5">A vencer em aberto</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
                <Clock className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-red-50 border border-red-150 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-red-650 tracking-wider">Vencido</span>
                <span className="text-lg font-bold font-display text-red-700 leading-tight">
                  {formatCurrency(stats.totalVencido)}
                </span>
                <span className="block text-[9px] text-red-400 font-semibold mt-0.5">Inadimplência líquida</span>
              </div>
              <div className="p-2 rounded-xl bg-red-105 text-red-700">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <span className="block text-[10px] font-black uppercase text-purple-600 tracking-wider">Negociado</span>
                <span className="text-lg font-bold font-display text-purple-700 leading-tight">
                  {formatCurrency(stats.totalNegociado)}
                </span>
                <span className="block text-[9px] text-purple-500 font-semibold mt-0.5">Acordos fiscais</span>
              </div>
              <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
            </div>

          </div>

          {activeTab === 'gestao' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* LEFT COLUMN: launch/edit form */}
              <div id="duplicata-form" className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <h4 className="font-bold text-xs text-[#1E3A8A] flex items-center gap-1.5 uppercase tracking-wider">
                  {editingId ? <Edit className="w-4 h-4 text-amber-600 animate-pulse" /> : <Plus className="w-4 h-4 text-amber-600" />} 
                  {editingId ? `Editar Duplicata #${formNumeroDuplicata}` : "Criar Nova Duplicata"}
                </h4>

                {hasPermission('Criar') || (editingId && hasPermission('Editar')) ? (
                  <form onSubmit={handleRegisterDuplicata} className="space-y-3.5">
                    
                    <div>
                      <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                        Nome do Cliente *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Carlos Silva Santos"
                        value={formClienteNome}
                        onChange={(e) => setFormClienteNome(e.target.value)}
                        className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                          CPF ou CNPJ *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="000.000.000-00"
                          value={formClienteDocumento}
                          onChange={(e) => setFormClienteDocumento(e.target.value)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021]"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                          Nº da Duplicata *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="DUP-1001"
                          value={formNumeroDuplicata}
                          onChange={(e) => setFormNumeroDuplicata(e.target.value)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                          Valor da Duplicata (R$) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="Ex: 350.00"
                          value={formValor}
                          onChange={(e) => setFormValor(e.target.value)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021]"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                          Vencimento *
                        </label>
                        <input
                          type="date"
                          required
                          value={formVencimento}
                          onChange={(e) => setFormVencimento(e.target.value)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021] font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                        Descrição do Serviço / Produto
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Mensalidade Conectividade Premium"
                        value={formDescricao}
                        onChange={(e) => setFormDescricao(e.target.value)}
                        className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021]"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                        Observações
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Observações de cobrança ou restrições"
                        value={formObservacoes}
                        onChange={(e) => setFormObservacoes(e.target.value)}
                        className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021] resize-none"
                      />
                    </div>

                    {editingId && (
                      <div>
                        <label className="block text-[9px] uppercase font-black tracking-wider text-slate-500 mb-1">
                          Status Operacional
                        </label>
                        <select
                          value={formStatus}
                          onChange={(e) => setFormStatus(e.target.value as any)}
                          className="w-full bg-white border border-slate-250 text-slate-800 text-xs rounded-xl p-2.5 outline-none focus:border-[#C5A021]"
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Pago">Pago</option>
                          <option value="Vencido">Vencido</option>
                          <option value="Negociado">Negociado</option>
                          <option value="Cancelado">Cancelado</option>
                        </select>
                      </div>
                    )}

                    <div className="pt-2 flex gap-2">
                      {editingId && (
                        <button
                          type="button"
                          onClick={resetForm}
                          className="flex-1 py-3 text-xs font-bold rounded-xl text-slate-650 bg-slate-200 hover:bg-slate-250 transition cursor-pointer border border-transparent shadow-xs"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSubmitLoading}
                        className={`flex-1 py-3 text-xs font-black rounded-xl text-white transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 bg-[#C5A021] hover:bg-[#b08e1a]`}
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        {isSubmitLoading ? "Gravando..." : editingId ? "Salvar Alterações" : "Gravar Duplicata"}
                      </button>
                    </div>

                  </form>
                ) : (
                  <div className="bg-slate-55 border border-slate-200 rounded-2xl p-5 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto text-slate-350 mb-2" />
                    <span className="text-xs font-semibold block">Acesso restrito para gravação</span>
                    <span className="text-[10px] mt-1 block">Sua conta atual não possui a permissão de Criar ou Editar duplicatas.</span>
                  </div>
                )}

                <div className="p-3 bg-blue-50 border border-blue-150 text-[10px] text-[#1E3A8A] rounded-xl flex items-start gap-2 leading-relaxed">
                  <Info className="w-4 h-4 text-[#1E3A8A] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Emissão Segura Enforced</span>
                    <p className="mt-0.5 text-slate-600">Por segurança, nenhuma duplicata comercial pode ser gravada sem passar pela API backend, garantindo logs de conciliação e dados de auditoria.</p>
                  </div>
                </div>

              </div>

              {/* RIGHT COLUMN: filters & database list */}
              <div className="lg:col-span-2 space-y-4">
                
                {/* FILTERS ACCORDION */}
                <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                  <h5 className="font-bold text-[10px] uppercase text-slate-500 tracking-wider flex items-center gap-1">
                    <Search className="w-3.5 h-3.5 text-slate-400" /> Filtrar Duplicatas Comerciais
                  </h5>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[8px] uppercase font-black text-slate-455 mb-1">Cliente</label>
                      <input
                        type="text"
                        placeholder="Nome..."
                        value={filterCliente}
                        onChange={(e) => setFilterCliente(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] outline-none focus:border-[#C5A021]"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-black text-slate-455 mb-1">CPF / CNPJ</label>
                      <input
                        type="text"
                        placeholder="Documento..."
                        value={filterDocumento}
                        onChange={(e) => setFilterDocumento(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] outline-none focus:border-[#C5A021]"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-black text-slate-455 mb-1">Vencimento</label>
                      <input
                        type="date"
                        value={filterVencimento}
                        onChange={(e) => setFilterVencimento(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] font-mono outline-none focus:border-[#C5A021]"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] uppercase font-black text-slate-455 mb-1">Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] outline-none focus:border-[#C5A021]"
                      >
                        <option value="todos">Todos</option>
                        <option value="Pendente">Pendentes</option>
                        <option value="Vencido">Vencidas</option>
                        <option value="Pago">Pagas</option>
                        <option value="Negociado">Negociadas</option>
                        <option value="Cancelado">Canceladas</option>
                      </select>
                    </div>
                  </div>

                  {(filterCliente || filterDocumento || filterVencimento || filterStatus !== 'todos') && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setFilterCliente('');
                          setFilterDocumento('');
                          setFilterVencimento('');
                          setFilterStatus('todos');
                        }}
                        className="text-[9px] text-[#C5A021] font-bold hover:underline"
                      >
                        Limpar Filtros
                      </button>
                    </div>
                  )}
                </div>

                {/* DATA TABLE */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Duplicatas Registradas ({duplicatas.length})</span>
                    <button
                      onClick={handleExportCSV}
                      className="text-[10px] bg-slate-900 hover:bg-slate-950 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1 font-bold transition cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Exportar Lista (.CSV)
                    </button>
                  </div>

                  <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                            <th className="p-3 pl-4">Nº / Status</th>
                            <th className="p-3">Cliente / CPF-CNPJ</th>
                            <th className="p-3">Vencimento</th>
                            <th className="p-3 text-right">Valor</th>
                            <th className="p-3 text-right pr-4">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {isLoading ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400">
                                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C5A021] mb-2" />
                                Buscando duplicatas comerciais no banco seguro...
                              </td>
                            </tr>
                          ) : duplicatas.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-slate-400">
                                Nenhuma duplicata encontrada com os filtros selecionados.
                              </td>
                            </tr>
                          ) : (
                            duplicatas.map(d => {
                              const isExpanded = expandedId === d.id;
                              
                              let badge = (
                                <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-250">
                                  Pendente
                                </span>
                              );
                              if (d.status === 'Pago') {
                                badge = (
                                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-250">
                                    Pago
                                  </span>
                                );
                              } else if (d.status === 'Vencido') {
                                badge = (
                                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-rose-700 bg-rose-50 border border-rose-250">
                                    Vencido
                                  </span>
                                );
                              } else if (d.status === 'Negociado') {
                                badge = (
                                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-purple-700 bg-purple-50 border border-purple-250">
                                    Acordo
                                  </span>
                                );
                              } else if (d.status === 'Cancelado') {
                                badge = (
                                  <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-slate-500 bg-slate-50 border border-slate-200">
                                    Cancelada
                                  </span>
                                );
                              }

                              const isLocked = d.status === 'Pago' || d.status === 'Cancelado';

                              return (
                                <React.Fragment key={d.id}>
                                  <tr 
                                    className={`hover:bg-slate-50/50 cursor-pointer ${isExpanded ? 'bg-slate-50/60 font-semibold' : ''} ${d.status === 'Cancelado' ? 'opacity-55 line-through' : ''}`}
                                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                                  >
                                    <td className="p-3 pl-4">
                                      <span className="block font-mono text-[10px] text-slate-450">{d.numeroDuplicata}</span>
                                      <div className="mt-0.5">{badge}</div>
                                    </td>
                                    <td className="p-3">
                                      <span className="block font-bold text-slate-800">{d.clienteNome}</span>
                                      <span className="block text-[10px] text-slate-450 font-mono">{d.clienteDocumento}</span>
                                    </td>
                                    <td className="p-3 text-slate-650 font-mono text-[11px]">
                                      {d.vencimento.split('-').reverse().join('/')}
                                    </td>
                                    <td className={`p-3 text-right font-black font-mono text-[11px] ${
                                      d.status === 'Pago' ? 'text-emerald-600' :
                                      d.status === 'Vencido' ? 'text-rose-600' :
                                      d.status === 'Negociado' ? 'text-purple-600' : 'text-slate-800'
                                    }`}>
                                      {formatCurrency(d.valor)}
                                    </td>
                                    <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        onClick={() => setExpandedId(isExpanded ? null : d.id)}
                                        className="text-[10px] text-blue-650 hover:underline font-bold mr-3"
                                      >
                                        {isExpanded ? "Fechar" : "Gerenciar"}
                                      </button>
                                    </td>
                                  </tr>

                                  {/* EXPANDED AREA FOR PAYMENT / EDIT CONTROLS */}
                                  {isExpanded && (
                                    <tr>
                                      <td colSpan={5} className="bg-slate-50/70 p-4 border-y border-slate-200">
                                        <div className="space-y-4">
                                          
                                          {/* Details text */}
                                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                            <div>
                                              <span className="text-slate-400 block font-bold uppercase text-[9px]">Serviço / Descrição</span>
                                              <p className="text-slate-700 font-medium">{d.descricao || "Não informada"}</p>
                                            </div>
                                            <div>
                                              <span className="text-slate-400 block font-bold uppercase text-[9px]">Observações Internas</span>
                                              <p className="text-slate-700 font-medium">{d.observacoes || "Nenhuma observação registrada"}</p>
                                            </div>
                                          </div>

                                          {/* Payment section (only for non-cancelled and non-paid items) */}
                                          {d.status !== 'Cancelado' && d.status !== 'Pago' && (
                                            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
                                              <span className="font-bold text-[10px] text-[#1E3A8A] uppercase tracking-wider flex items-center gap-1">
                                                <DollarSign className="w-3.5 h-3.5 text-brand-gold" /> Integrações de Pagamentos (Futuras Emissões)
                                              </span>
                                              
                                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                
                                                {/* PIX */}
                                                <div className="border border-slate-100 rounded-lg p-2 flex items-start gap-2.5">
                                                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                                                    <QrCode className="w-4 h-4" />
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                    <span className="block text-[9px] uppercase font-bold text-slate-400">Pix Copia e Cola</span>
                                                    <span className="block text-[10px] text-slate-800 font-mono truncate">{d.pixCopiaECola || "Indisponível"}</span>
                                                    <button
                                                      onClick={() => handleCopyClipboard(d.pixCopiaECola || '', `pix-${d.id}`)}
                                                      className="mt-1 text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-650 px-2 py-0.5 rounded flex items-center gap-1 font-semibold transition"
                                                    >
                                                      {copiedId === `pix-${d.id}` ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                                      {copiedId === `pix-${d.id}` ? "Copiado!" : "Copiar Chave"}
                                                    </button>
                                                  </div>
                                                </div>

                                                {/* BOLETO */}
                                                <div className="border border-slate-100 rounded-lg p-2 flex items-start gap-2.5">
                                                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                                                    <Barcode className="w-4 h-4" />
                                                  </div>
                                                  <div className="flex-1 min-w-0">
                                                    <span className="block text-[9px] uppercase font-bold text-slate-400">Linha Digitável Boleto</span>
                                                    <span className="block text-[10px] text-slate-800 font-mono truncate">{d.boletoBarCode || "Indisponível"}</span>
                                                    <button
                                                      onClick={() => handleCopyClipboard(d.boletoBarCode || '', `boleto-${d.id}`)}
                                                      className="mt-1 text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-650 px-2 py-0.5 rounded flex items-center gap-1 font-semibold transition"
                                                    >
                                                      {copiedId === `boleto-${d.id}` ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                                      {copiedId === `boleto-${d.id}` ? "Copiado!" : "Copiar Linha"}
                                                    </button>
                                                  </div>
                                                </div>

                                              </div>
                                            </div>
                                          )}

                                          {/* Control buttons */}
                                          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 justify-between items-center text-xs">
                                            <div className="text-[10px] text-slate-400">
                                              Criado por: <b className="text-slate-600">{d.createdByName}</b> às {new Date(d.createdAt).toLocaleString('pt-BR')}
                                            </div>

                                            <div className="flex gap-2">
                                              {/* Mark as paid */}
                                              {d.status !== 'Pago' && d.status !== 'Cancelado' && hasPermission('Aprovar') && (
                                                <button
                                                  onClick={() => handleQuickStatusUpdate(d.id, d.numeroDuplicata, 'Pago')}
                                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition shadow-xs"
                                                >
                                                  <CheckCircle2 className="w-3.5 h-3.5" /> Quitar Fatura
                                                </button>
                                              )}

                                              {/* Negotiate */}
                                              {d.status !== 'Pago' && d.status !== 'Cancelado' && d.status !== 'Negociado' && hasPermission('Editar') && (
                                                <button
                                                  onClick={() => handleQuickStatusUpdate(d.id, d.numeroDuplicata, 'Negociado')}
                                                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition shadow-xs"
                                                >
                                                  <ArrowRightLeft className="w-3.5 h-3.5" /> Fazer Acordo
                                                </button>
                                              )}

                                              {/* Return to pending if it was Negotiated or Overdue */}
                                              {(d.status === 'Negociado' || d.status === 'Vencido') && hasPermission('Editar') && (
                                                <button
                                                  onClick={() => handleQuickStatusUpdate(d.id, d.numeroDuplicata, 'Pendente')}
                                                  className="bg-slate-100 border border-slate-250 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg transition"
                                                >
                                                  Voltar p/ Pendente
                                                </button>
                                              )}

                                              {/* Edit form loader */}
                                              {!isLocked && hasPermission('Editar') && (
                                                <button
                                                  onClick={() => handleEditClick(d)}
                                                  className="bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
                                                >
                                                  <Edit className="w-3.5 h-3.5" /> Editar Cadastro
                                                </button>
                                              )}

                                              {/* Cancel Duplicata */}
                                              {d.status !== 'Pago' && d.status !== 'Cancelado' && hasPermission('Editar') && (
                                                <button
                                                  onClick={() => handleCancelClick(d.id, d.numeroDuplicata)}
                                                  className="bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition border border-rose-200"
                                                >
                                                  <Ban className="w-3.5 h-3.5" /> Cancelar Duplicata
                                                </button>
                                              )}
                                            </div>

                                          </div>

                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
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
          ) : (
            
            /* AUDIT LOGS TAB */
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-xs text-[#1E3A8A] flex items-center gap-1.5 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-[#C5A021]" /> Auditoria de Duplicatas
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Histórico de ações de conciliação, criação, alteração e cancelamento de duplicatas capturadas no backend.</p>
              </div>

              <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                      <th className="p-3 pl-4">Timestamp</th>
                      <th className="p-3">Operação</th>
                      <th className="p-3">Operador</th>
                      <th className="p-3">ID do Documento Ref</th>
                      <th className="p-3 font-mono">Endereço IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-sans">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C5A021] mb-2" />
                          Buscando registros na auditoria...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-slate-400 font-sans">
                          Nenhum registro de auditoria encontrado para duplicatas.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map(log => {
                        let actionBadge = (
                          <span className="px-2 py-0.5 rounded-sm bg-slate-100 text-slate-650 border border-slate-200 font-black uppercase text-[8px]">
                            {log.acao}
                          </span>
                        );
                        if (log.acao === 'CRIAR_DUPLICATA') {
                          actionBadge = (
                            <span className="px-2 py-0.5 rounded-sm bg-blue-50 text-blue-700 border border-blue-200 font-black uppercase text-[8px]">
                              Criar
                            </span>
                          );
                        } else if (log.acao === 'EDITAR_DUPLICATA') {
                          actionBadge = (
                            <span className="px-2 py-0.5 rounded-sm bg-amber-50 text-amber-700 border border-amber-200 font-black uppercase text-[8px]">
                              Editar
                            </span>
                          );
                        } else if (log.acao === 'CANCELAR_DUPLICATA') {
                          actionBadge = (
                            <span className="px-2 py-0.5 rounded-sm bg-rose-50 text-rose-700 border border-rose-200 font-black uppercase text-[8px]">
                              Cancelar
                            </span>
                          );
                        }

                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50">
                            <td className="p-3 pl-4 text-slate-500 font-mono text-[10px]">
                              {new Date(log.createdAt).toLocaleString('pt-BR')}
                            </td>
                            <td className="p-3 font-semibold">
                              {actionBadge}
                            </td>
                            <td className="p-3 text-slate-650 font-sans font-medium text-[11px]">
                              {log.operadorNome}
                              <span className="block text-[8px] text-slate-400 font-mono">ID: {log.operadorId}</span>
                            </td>
                            <td className="p-3 text-slate-500 text-[9px]">
                              {log.entidadeId}
                            </td>
                            <td className="p-3 text-slate-650 text-[10px]">
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

      </div>
    </div>
  );
}
