import React, { useState, useEffect, useRef } from 'react';
import { X, DollarSign, Search, Download, Upload, RefreshCw, FileText, AlertCircle, CheckCircle, RotateCcw, Eye, Plus, Filter, Calendar, User, CreditCard, Ban, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Pagamento, UserProfile, UserPermission } from '../types';

const API_URL = ((import.meta as any).env.VITE_API_URL || 'https://wa-fort-cb.onrender.com').replace(/\/$/, "");

type FormaPagamento = 'pix' | 'boleto' | 'dinheiro' | 'cartao' | 'transferencia' | 'outros';

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartão de Crédito/Débito' },
  { value: 'transferencia', label: 'Transferência Bancária' },
  { value: 'outros', label: 'Outros' },
];

interface PagamentosModalProps {
  onClose: () => void;
  userProfile: UserProfile | null;
  currentUser: any;
  showAlert: (message: string, title?: string) => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
  duplicataId?: string;
  duplicataNumero?: string;
  clienteId?: string;
  clienteNome?: string;
}

export function PagamentosModal({
  onClose,
  userProfile,
  currentUser,
  showAlert,
  showConfirm,
  duplicataId: initialDuplicataId,
  duplicataNumero: initialDuplicataNumero,
  clienteId: initialClienteId,
  clienteNome: initialClienteNome,
}: PagamentosModalProps) {
  const isDemo = currentUser?.isDemo;

  const hasPermission = (permission: UserPermission): boolean => {
    if (!userProfile) return false;
    return userProfile.permissoes.includes(permission);
  };

  const [activeTab, setActiveTab] = useState<'historico' | 'registrar' | 'baixa'>('historico');
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [filterCliente, setFilterCliente] = useState(initialClienteNome || '');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterForma, setFilterForma] = useState('');

  const [selectedPagamento, setSelectedPagamento] = useState<Pagamento | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showEstornoMotivo, setShowEstornoMotivo] = useState(false);
  const [estornoPagamentoId, setEstornoPagamentoId] = useState<string | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const fetchPagamentos = async () => {
    setIsLoading(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser!.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      let url = `${API_URL}/api/pagamentos?`;

      if (initialDuplicataId) url += `duplicataId=${encodeURIComponent(initialDuplicataId)}&`;
      if (filterCliente) url += `clienteNome=${encodeURIComponent(filterCliente)}&`;
      if (filterStartDate) url += `startDate=${filterStartDate}&`;
      if (filterForma) url += `formaPagamento=${filterForma}&`;

      const res = await fetch(url, { headers });
      const data = await res.json();
      setPagamentos(data.pagamentos || []);
    } catch (err: any) {
      console.error('Erro ao buscar pagamentos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPagamentos();
  }, [filterCliente, filterStartDate, filterForma]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const formatDate = (date: string) => {
    if (!date) return '-';
    try {
      const [y, m, d] = date.split('-');
      return `${d}/${m}/${y}`;
    } catch { return date; }
  };

  const formatDateTime = (iso: string) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('pt-BR');
    } catch { return iso; }
  };

  const getStatusBadge = (p: Pagamento) => {
    if (p.status === 'estornado') {
      return <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-bold text-[9px]">Estornado</span>;
    }
    if (p.baixado) {
      return <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-bold text-[9px]">Baixado</span>;
    }
    if (p.conciliado) {
      return <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[9px]">Conciliado</span>;
    }
    return <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold text-[9px]">Pendente</span>;
  };

  const getFormaLabel = (value: string) => {
    const found = FORMAS_PAGAMENTO.find(f => f.value === value);
    return found ? found.label : value;
  };

  const handleUploadComprovante = async (pagamentoId: string, file: File) => {
    setIsUploading(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser!.getIdToken();
      const formData = new FormData();
      formData.append('comprovante', file);

      const headers: any = {};
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/pagamentos/${pagamentoId}/comprovante`, {
        method: 'POST',
        headers,
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showAlert('Comprovante enviado com sucesso!', 'Upload Realizado');
      fetchPagamentos();
    } catch (err: any) {
      showAlert(err.message || 'Erro ao enviar comprovante.', 'Erro');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEstornar = async () => {
    if (!estornoPagamentoId) return;
    setIsSubmitting(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser!.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/pagamentos/${estornoPagamentoId}/estorno`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ motivo: motivoEstorno })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showAlert('Pagamento estornado com sucesso! Duplicata e caixa atualizados.', 'Estorno Realizado');
      setShowEstornoMotivo(false);
      setEstornoPagamentoId(null);
      setMotivoEstorno('');
      fetchPagamentos();
    } catch (err: any) {
      showAlert(err.message || 'Erro ao estornar pagamento.', 'Erro');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBaixaManual = async () => {
    if (!selectedPagamento) return;
    setIsSubmitting(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser!.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/pagamentos/${selectedPagamento.id}/baixa`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ observacoes: 'Baixa manual via módulo de pagamentos' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showAlert('Baixa manual realizada com sucesso!', 'Baixa Efetuada');
      setSelectedPagamento(null);
      setActiveTab('historico');
      fetchPagamentos();
    } catch (err: any) {
      showAlert(err.message || 'Erro ao dar baixa.', 'Erro');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-100/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-5xl w-full flex flex-col my-4 max-h-[90vh]">
        {/* MODAL HEADER */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-brand-blue/5 border border-brand-blue/10 shrink-0">
              <DollarSign className="w-6 h-6 text-brand-blue" />
            </div>
            <div>
              <h3 className="font-bold text-lg font-display text-brand-blue">Pagamentos Financeiros</h3>
              <p className="text-xs text-slate-500">Registrar, baixar e acompanhar pagamentos de duplicatas</p>
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

        {/* Tabs */}
        <div className="flex border-b border-slate-100 px-5 bg-white shrink-0">
          <button
            onClick={() => setActiveTab('historico')}
            className={`py-3 px-4 font-semibold text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'historico'
                ? 'border-brand-blue text-brand-blue'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Search className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            Histórico
          </button>
          {hasPermission('Criar') && (
            <button
              onClick={() => setActiveTab('registrar')}
              className={`py-3 px-4 font-semibold text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === 'registrar'
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Plus className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Registrar Pagamento
            </button>
          )}
          {hasPermission('Aprovar') && (
            <button
              onClick={() => setActiveTab('baixa')}
              className={`py-3 px-4 font-semibold text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeTab === 'baixa'
                  ? 'border-brand-blue text-brand-blue'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Baixa Manual
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* TAB: HISTÓRICO */}
          {activeTab === 'historico' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filtrar por cliente..."
                    value={filterCliente}
                    onChange={(e) => setFilterCliente(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue"
                  />
                </div>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue"
                  />
                </div>
                <div className="relative">
                  <CreditCard className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={filterForma}
                    onChange={(e) => setFilterForma(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue appearance-none bg-white"
                  >
                    <option value="">Todas formas</option>
                    {FORMAS_PAGAMENTO.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => { setFilterCliente(''); setFilterStartDate(''); setFilterForma(''); }}
                  className="px-3 py-2 text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition cursor-pointer font-medium flex items-center justify-center gap-1"
                >
                  <Filter className="w-3.5 h-3.5" /> Limpar Filtros
                </button>
              </div>

              {/* Table */}
              <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                      <th className="p-3 pl-4">Status</th>
                      <th className="p-3">Cliente / Duplicata</th>
                      <th className="p-3">Valor Pago</th>
                      <th className="p-3">Data Pagamento</th>
                      <th className="p-3">Forma</th>
                      <th className="p-3">Operador</th>
                      <th className="p-3 text-right pr-4">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-brand-blue mb-2" />
                          Carregando pagamentos...
                        </td>
                      </tr>
                    ) : pagamentos.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          <DollarSign className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                          Nenhum pagamento encontrado.
                        </td>
                      </tr>
                    ) : (
                      pagamentos.map(p => (
                        <React.Fragment key={p.id}>
                          <tr
                            className={`hover:bg-slate-50/50 transition cursor-pointer ${p.status === 'estornado' ? 'opacity-60' : ''}`}
                            onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                          >
                            <td className="p-3 pl-4">
                              <div className="flex items-center gap-2">{getStatusBadge(p)}</div>
                            </td>
                            <td className="p-3">
                              <span className="font-medium text-slate-800">{p.clienteNome}</span>
                              <span className="block text-[9px] text-slate-400 font-mono">{p.duplicataNumero}</span>
                            </td>
                            <td className="p-3 font-mono font-bold text-slate-800">{formatCurrency(p.valorPago)}</td>
                            <td className="p-3 text-slate-600">{formatDate(p.dataPagamento)}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-semibold">
                                {getFormaLabel(p.formaPagamento)}
                              </span>
                            </td>
                            <td className="p-3 text-slate-500 text-[10px]">{p.createdByName}</td>
                            <td className="p-3 pr-4 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === p.id ? null : p.id); }}
                                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
                                title="Detalhes"
                              >
                                {expandedId === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                            </td>
                          </tr>
                          {expandedId === p.id && (
                            <tr>
                              <td colSpan={7} className="p-4 bg-slate-50/50">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <h5 className="text-[10px] uppercase font-black tracking-wider text-slate-500">Informações do Pagamento</h5>
                                    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2 text-xs">
                                      <div className="flex justify-between"><span className="text-slate-500">Comprovante:</span>
                                        {p.comprovanteUrl ? (
                                          <a href={p.comprovanteUrl} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline font-medium flex items-center gap-1">
                                            <Eye className="w-3 h-3" /> Visualizar
                                          </a>
                                        ) : (
                                          <span className="text-slate-400">Não enviado</span>
                                        )}
                                      </div>
                                      <div className="flex justify-between"><span className="text-slate-500">Conciliado:</span>
                                        <span className={p.conciliado ? 'text-green-600 font-medium' : 'text-slate-400'}>
                                          {p.conciliado ? `Sim (${p.conciliadoPor ? 'por ' + p.conciliadoPor : ''})` : 'Não'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between"><span className="text-slate-500">Registrado em:</span>
                                        <span className="text-slate-700">{formatDateTime(p.createdAt)}</span>
                                      </div>
                                      <div className="flex justify-between"><span className="text-slate-500">Operador:</span>
                                        <span className="text-slate-700">{p.createdByName}</span>
                                      </div>
                                      {p.motivoEstorno && (
                                        <div className="flex justify-between"><span className="text-slate-500">Motivo Estorno:</span>
                                          <span className="text-red-600">{p.motivoEstorno}</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <h5 className="text-[10px] uppercase font-black tracking-wider text-slate-500">Ações</h5>
                                    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
                                      {p.status !== 'estornado' && (
                                        <>
                                          {hasPermission('Editar') && (
                                            <label className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition text-xs">
                                              <Upload className="w-4 h-4 text-brand-blue" />
                                              <span>{p.comprovanteUrl ? 'Trocar Comprovante' : 'Enviar Comprovante'}</span>
                                              <input
                                                type="file"
                                                accept="image/*,.pdf"
                                                className="hidden"
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) handleUploadComprovante(p.id, file);
                                                }}
                                              />
                                            </label>
                                          )}
                                          {hasPermission('Aprovar') && !p.baixado && (
                                            <button
                                              onClick={() => {
                                                setSelectedPagamento(p);
                                                setActiveTab('baixa');
                                              }}
                                              className="w-full flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg transition text-xs text-left cursor-pointer"
                                            >
                                              <CheckCircle className="w-4 h-4 text-green-600" />
                                              Dar Baixa Manual
                                            </button>
                                          )}
                                          {hasPermission('Aprovar') && (
                                            <button
                                              onClick={() => {
                                                setEstornoPagamentoId(p.id);
                                                setShowEstornoMotivo(true);
                                              }}
                                              className="w-full flex items-center gap-2 p-2 hover:bg-red-50 rounded-lg transition text-xs text-left text-red-600 cursor-pointer"
                                            >
                                              <RotateCcw className="w-4 h-4" />
                                              Estornar Pagamento
                                            </button>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: REGISTRAR */}
          {activeTab === 'registrar' && (
            <RegistrarPagamentoForm
              currentUser={currentUser}
              userProfile={userProfile}
              isDemo={isDemo}
              showAlert={showAlert}
              onSuccess={() => { setActiveTab('historico'); fetchPagamentos(); }}
              duplicataId={initialDuplicataId}
              duplicataNumero={initialDuplicataNumero}
              clienteNome={initialClienteNome}
            />
          )}

          {/* TAB: BAIXA MANUAL */}
          {activeTab === 'baixa' && (
            <BaixaManualForm
              currentUser={currentUser}
              userProfile={userProfile}
              isDemo={isDemo}
              showAlert={showAlert}
              pagamentos={pagamentos}
              selectedPagamento={selectedPagamento}
              onSelectPagamento={setSelectedPagamento}
              onSuccess={() => { setActiveTab('historico'); fetchPagamentos(); }}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
              getFormaLabel={getFormaLabel}
            />
          )}

          {/* Totals */}
          {activeTab === 'historico' && pagamentos.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-4 text-xs">
              <div><span className="text-slate-500">Total Registros:</span> <strong className="text-slate-800">{pagamentos.length}</strong></div>
              <div><span className="text-slate-500">Valor Total:</span> <strong className="text-green-700 font-mono">
                {formatCurrency(pagamentos.reduce((s, p) => s + (p.status !== 'estornado' ? p.valorPago : 0), 0))}
              </strong></div>
              <div><span className="text-slate-500">Estornados:</span> <strong className="text-red-600">{pagamentos.filter(p => p.status === 'estornado').length}</strong></div>
              <div><span className="text-slate-500">Baixados:</span> <strong className="text-green-600">{pagamentos.filter(p => p.baixado).length}</strong></div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-between items-center shrink-0">
          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 uppercase tracking-wider">
            <DollarSign className="w-3.5 h-3.5" /> Módulo de Pagamentos WA Fort
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs bg-brand-blue hover:bg-blue-900 text-white font-bold rounded-xl cursor-pointer transition shadow-sm"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Estorno Motivo Modal */}
      {showEstornoMotivo && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6">
            <h4 className="font-bold text-sm text-slate-800 mb-1">Motivo do Estorno</h4>
            <p className="text-xs text-slate-500 mb-4">Informe o motivo pelo qual este pagamento está sendo estornado. A duplicata será revertida para pendente/vencido.</p>
            <textarea
              value={motivoEstorno}
              onChange={(e) => setMotivoEstorno(e.target.value)}
              placeholder="Descreva o motivo do estorno..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue resize-none"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowEstornoMotivo(false); setEstornoPagamentoId(null); setMotivoEstorno(''); }}
                className="flex-1 py-2 text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleEstornar}
                disabled={isSubmitting || !motivoEstorno.trim()}
                className="flex-1 py-2 text-xs bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RegistrarPagamentoForm({
  currentUser,
  userProfile,
  isDemo,
  showAlert,
  onSuccess,
  duplicataId: initialDuplicataId,
  duplicataNumero: initialDuplicataNumero,
  clienteNome: initialClienteNome,
}: {
  currentUser: any;
  userProfile: UserProfile | null;
  isDemo: boolean;
  showAlert: (message: string, title?: string) => void;
  onSuccess: () => void;
  duplicataId?: string;
  duplicataNumero?: string;
  clienteNome?: string;
}) {
  const [duplicataId, setDuplicataId] = useState(initialDuplicataId || '');
  const [duplicataNumero, setDuplicataNumero] = useState(initialDuplicataNumero || '');
  const [clienteNome, setClienteNome] = useState(initialClienteNome || '');
  const [valorPago, setValorPago] = useState('');
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().split('T')[0]);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('pix');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNome.trim() || !valorPago || !dataPagamento) {
      showAlert('Preencha todos os campos obrigatórios.', 'Validação');
      return;
    }
    const valorNumerico = parseFloat(valorPago.replace(/[^\d,]/g, '').replace(',', '.'));
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      showAlert('Valor do pagamento deve ser maior que zero.', 'Validação');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser!.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/pagamentos`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          duplicataId: duplicataId || undefined,
          duplicataNumero: duplicataNumero || `MANUAL-${Date.now()}`,
          clienteId: '',
          clienteNome: clienteNome.trim(),
          valorPago: valorNumerico,
          valorOriginal: valorNumerico,
          dataPagamento,
          formaPagamento
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showAlert(`Pagamento de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorNumerico)} registrado com sucesso!`, 'Pagamento Registrado');
      onSuccess();
    } catch (err: any) {
      showAlert(err.message || 'Erro ao registrar pagamento.', 'Erro');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatInputCurrency = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (!digits) return '';
    const num = parseInt(digits) / 100;
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-4">
      <div className="p-3.5 bg-blue-50/60 border border-blue-100/70 rounded-xl flex items-start gap-2.5">
        <DollarSign className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Registre um pagamento recebido. Se vinculado a uma duplicata, o status será atualizado automaticamente para <strong>Pago</strong> e uma <strong>entrada no caixa</strong> será gerada.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-[10px] uppercase font-black tracking-wider text-slate-500 mb-1">Cliente *</label>
          <input
            type="text"
            required
            value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
            placeholder="Nome do cliente"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-slate-500 mb-1">Valor Pago (R$) *</label>
          <input
            type="text"
            required
            value={valorPago}
            onChange={(e) => setValorPago(formatInputCurrency(e.target.value))}
            placeholder="R$ 0,00"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-slate-500 mb-1">Data Pagamento *</label>
          <input
            type="date"
            required
            value={dataPagamento}
            onChange={(e) => setDataPagamento(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-slate-500 mb-1">Forma de Pagamento *</label>
          <select
            required
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue appearance-none bg-white"
          >
            {FORMAS_PAGAMENTO.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase font-black tracking-wider text-slate-500 mb-1">Nº Duplicata (opcional)</label>
          <input
            type="text"
            value={duplicataNumero}
            onChange={(e) => setDuplicataNumero(e.target.value)}
            placeholder="Ex: DUP-1001"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 text-xs font-black rounded-xl text-white transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50 bg-brand-blue hover:bg-blue-900"
      >
        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
        {isSubmitting ? 'Registrando...' : 'Registrar Pagamento'}
      </button>
    </form>
  );
}

function BaixaManualForm({
  currentUser,
  userProfile,
  isDemo,
  showAlert,
  pagamentos,
  selectedPagamento,
  onSelectPagamento,
  onSuccess,
  formatCurrency,
  formatDate,
  getFormaLabel,
}: {
  currentUser: any;
  userProfile: UserProfile | null;
  isDemo: boolean;
  showAlert: (message: string, title?: string) => void;
  pagamentos: Pagamento[];
  selectedPagamento: Pagamento | null;
  onSelectPagamento: (p: Pagamento | null) => void;
  onSuccess: () => void;
  formatCurrency: (v: number) => string;
  formatDate: (d: string) => string;
  getFormaLabel: (v: string) => string;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const pendentes = pagamentos.filter(p =>
    p.status !== 'estornado' && !p.baixado &&
    (p.clienteNome.toLowerCase().includes(searchTerm.toLowerCase()) ||
     p.duplicataNumero.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleBaixar = async () => {
    if (!selectedPagamento) return;
    setIsSubmitting(true);
    try {
      const token = isDemo ? 'demo-token-admin' : await currentUser!.getIdToken();
      const headers: any = { 'Content-Type': 'application/json' };
      if (!isDemo) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/api/pagamentos/${selectedPagamento.id}/baixa`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ observacoes: 'Baixa manual' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showAlert(`Baixa manual realizada para ${selectedPagamento.clienteNome} - ${formatCurrency(selectedPagamento.valorPago)}`, 'Baixa Efetuada');
      onSelectPagamento(null);
      setSearchTerm('');
      onSuccess();
    } catch (err: any) {
      showAlert(err.message || 'Erro ao dar baixa.', 'Erro');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (selectedPagamento) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className="p-3.5 bg-amber-50/60 border border-amber-100/70 rounded-xl flex items-start gap-2.5">
          <CheckCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Confirmar baixa manual para o pagamento abaixo. Esta ação não altera o caixa nem a duplicata vinculada.
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><strong className="text-slate-800">{selectedPagamento.clienteNome}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Duplicata:</span><span className="text-slate-700">{selectedPagamento.duplicataNumero}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Valor:</span><strong className="text-green-700 font-mono">{formatCurrency(selectedPagamento.valorPago)}</strong></div>
          <div className="flex justify-between"><span className="text-slate-500">Data:</span><span className="text-slate-700">{formatDate(selectedPagamento.dataPagamento)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Forma:</span><span className="text-slate-700">{getFormaLabel(selectedPagamento.formaPagamento)}</span></div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => { onSelectPagamento(null); setSearchTerm(''); }}
            className="flex-1 py-2.5 text-xs border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer font-medium"
          >
            Voltar
          </button>
          <button
            onClick={handleBaixar}
            disabled={isSubmitting}
            className="flex-1 py-2.5 text-xs bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Confirmar Baixa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3.5 bg-blue-50/60 border border-blue-100/70 rounded-xl flex items-start gap-2.5">
        <Search className="w-5 h-5 text-brand-blue shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Selecione um pagamento pendente de baixa para confirmar manualmente.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por cliente ou duplicata..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/10 focus:border-brand-blue"
        />
      </div>

      <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <th className="p-3 pl-4">Cliente</th>
              <th className="p-3">Duplicata</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Data</th>
              <th className="p-3">Forma</th>
              <th className="p-3 text-right pr-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pendentes.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400">
                  Nenhum pagamento pendente de baixa.
                </td>
              </tr>
            ) : (
              pendentes.map(p => (
                <tr key={p.id} className="hover:bg-slate-50/50 transition">
                  <td className="p-3 pl-4 font-medium text-slate-800">{p.clienteNome}</td>
                  <td className="p-3 text-slate-600 font-mono text-[10px]">{p.duplicataNumero}</td>
                  <td className="p-3 font-mono font-bold text-slate-800">{formatCurrency(p.valorPago)}</td>
                  <td className="p-3 text-slate-600">{formatDate(p.dataPagamento)}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-semibold">{getFormaLabel(p.formaPagamento)}</span>
                  </td>
                  <td className="p-3 pr-4 text-right">
                    <button
                      onClick={() => onSelectPagamento(p)}
                      className="px-3 py-1.5 text-[10px] bg-brand-blue hover:bg-blue-900 text-white font-bold rounded-lg transition cursor-pointer"
                    >
                      Selecionar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}