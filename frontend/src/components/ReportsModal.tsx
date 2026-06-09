/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  X, 
  FileDown, 
  Printer, 
  CheckCircle, 
  TrendingUp, 
  AlertTriangle, 
  BarChart3, 
  FileSpreadsheet,
  Award,
  Calendar,
  Building2,
  Clock,
  UserCheck
} from "lucide-react";
import { Debtor, AppConfig } from "../types";

interface ReportsModalProps {
  debtors: Debtor[];
  config: AppConfig;
  onClose: () => void;
}

export function ReportsModal({ debtors, config, onClose }: ReportsModalProps) {
  const [filterType, setFilterType] = useState<'all' | 'paid' | 'not_paid'>('all');

  // Currency utility helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Calculations for analytics
  const totalAmount = debtors.reduce((acc, curr) => acc + curr.amount, 0);
  const recoveredAmount = debtors
    .filter(d => d.status === 'paid')
    .reduce((acc, curr) => acc + curr.amount, 0);
  const negotiatingAmount = debtors
    .filter(d => d.status === 'negotiating')
    .reduce((acc, curr) => acc + curr.amount, 0);
  const pendingAmount = debtors
    .filter(d => d.status === 'pending' || d.status === 'notified')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalCount = debtors.length;
  const recoveredCount = debtors.filter(d => d.status === 'paid').length;
  const negotiatingCount = debtors.filter(d => d.status === 'negotiating').length;
  const pendingCount = debtors.filter(d => d.status === 'pending' || d.status === 'notified').length;

  const recoveryRate = totalAmount > 0 ? (recoveredAmount / totalAmount) * 100 : 0;

  // Filter the debtors shown in preview table
  const previewDebtors = debtors.filter(d => {
    if (filterType === 'paid') return d.status === 'paid';
    if (filterType === 'not_paid') return d.status !== 'paid';
    return true;
  });

  // Export to CSV Function with UTF-8 BOM protection for smooth column parsing inside Microsoft Excel
  const handleExportCSV = (type: 'all' | 'recovered') => {
    const listToExport = type === 'all' 
      ? debtors 
      : debtors.filter(d => d.status === 'paid');

    if (listToExport.length === 0) {
      alert("Não há dados para exportar com o filtro selecionado.");
      return;
    }

    const headers = [
      "ID", 
      "Cliente Inadimplente", 
      "Telefone", 
      "Valor da Divida (BRL)", 
      "Data de Vencimento", 
      "Dias em Atraso", 
      "Status Atual", 
      "Regua Utilizada",
      "Mensagem IA Gerada"
    ];

    const rows = listToExport.map(d => {
      let statusLabel = "Pendente";
      if (d.status === 'paid') statusLabel = "Recuperado / Pago";
      else if (d.status === 'negotiating') statusLabel = "Em Negociação";
      else if (d.status === 'notified') statusLabel = "Notificado";

      return [
        d.id,
        d.name,
        d.phone,
        d.amount.toFixed(2),
        d.dueDate.split('-').reverse().join('/'),
        d.daysOverdue,
        statusLabel,
        d.tone.toUpperCase(),
        d.customMessage ? d.customMessage.replace(/[\n\r]/g, " ") : ""
      ];
    });

    // Create CSV content separating with semicolons for European/Latin spreadsheets integration
    const csvContent = "\uFEFF" + [
      headers.join(";"), 
      ...rows.map(line => line.map(field => `"${String(field).replace(/"/g, '""')}"`).join(";"))
    ].join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const today = new Date().toISOString().split('T')[0];
    
    link.href = url;
    link.setAttribute("download", `WA_FORT_Relatorio_Recuperacao_${type === 'all' ? 'Completo' : 'Pago'}_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Browser print styling trigger
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto antialiased">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-155 max-w-4xl w-full flex flex-col my-8 outline-hidden print:w-full print:border-none print:shadow-none print:p-0 print:m-0">
        
        {/* MODAL HEADER */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between no-print">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-brand-blue/10 border border-brand-blue/20 text-[#1E3A8A] shrink-0">
              <BarChart3 className="w-6 h-6 text-brand-blue" />
            </div>
            <div>
              <h3 className="font-bold text-lg font-display text-[#1E3A8A]">Relatórios & Performance Financeira</h3>
              <p className="text-xs text-slate-500">Métricas completas de eficiência e volumes de créditos recuperados</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition cursor-pointer"
            aria-label="Minimizar tela"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PRINTABLE HEADER (Hidden on normal screen display) */}
        <div className="hidden print:block p-8 border-b-2 border-slate-200">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-black font-display text-slate-900 tracking-tight uppercase">WA FORT DEBT RECOV REPORT</h1>
              <p className="text-xs text-slate-500 font-mono">EMISSÃO OPERACIONAL DE PERFORMANCE DE CRÉDITO</p>
            </div>
            <div className="text-right font-mono text-[10px] text-slate-500 leading-snug">
              <div><b>Empresa:</b> {config.companyName}</div>
              <div><b>Chave Pix Cadastrada:</b> {config.pixKey || "Não Informada"}</div>
              <div><b>Gerado em:</b> {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR')}</div>
            </div>
          </div>
          
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6 flex justify-between items-center">
            <div className="text-center flex-1">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Total Carteira Cobrada</span>
              <span className="text-xl font-bold font-display text-slate-900">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="border-l border-slate-200 h-10 w-px" />
            <div className="text-center flex-1">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-emerald-500">Total Recuperado de Caixa</span>
              <span className="text-xl font-bold font-display text-emerald-605">{formatCurrency(recoveredAmount)}</span>
            </div>
            <div className="border-l border-slate-200 h-10 w-px" />
            <div className="text-center flex-1">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-amber-500">Taxa de Sucesso (WA Fort)</span>
              <span className="text-xl font-bold font-display text-emerald-600">{recoveryRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>

        {/* SCROLLABLE SCROLL AREA FOR REPORT ANALYTICS */}
        <div className="p-6 overflow-y-auto max-h-[70vh] space-y-6 print:overflow-visible print:max-h-none print:p-0">
          
          {/* ANALYTICS HIGHLIGHT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
            
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between print:bg-transparent print:border-slate-250">
              <div>
                <span className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                  Total Lançado
                </span>
                <span className="text-lg font-bold font-display text-slate-900 leading-tight">
                  {formatCurrency(totalAmount)}
                </span>
                <span className="block text-[10px] text-slate-500 mt-1">
                  {totalCount} contatos registrados
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-600 no-print">
                <Building2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-100/80 rounded-2xl p-4 flex items-center justify-between print:bg-transparent print:border-slate-250">
              <div>
                <span className="block text-[10px] font-black uppercase text-emerald-600 tracking-wider">
                  Total Recuperado
                </span>
                <span className="text-lg font-bold font-display text-emerald-700 leading-tight">
                  {formatCurrency(recoveredAmount)}
                </span>
                <span className="block text-[10px] text-emerald-650 font-semibold mt-1 flex items-center gap-1">
                  <UserCheck className="w-3 h-3" />
                  {recoveredCount} acordos quitados
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 no-print">
                <CheckCircle className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-purple-50/70 border border-purple-100/80 rounded-2xl p-4 flex items-center justify-between print:bg-transparent print:border-slate-250">
              <div>
                <span className="block text-[10px] font-black uppercase text-purple-600 tracking-wider">
                  Acordos Ativos
                </span>
                <span className="text-lg font-bold font-display text-purple-700 leading-tight">
                  {formatCurrency(negotiatingAmount)}
                </span>
                <span className="block text-[10px] text-purple-500 mt-1">
                  {negotiatingCount} negociações iniciadas
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700 no-print">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-100/80 rounded-2xl p-4 flex items-center justify-between print:bg-transparent print:border-slate-250">
              <div>
                <span className="block text-[10px] font-black uppercase text-amber-600 tracking-wider">
                  Em Processo
                </span>
                <span className="text-lg font-bold font-display text-amber-700 leading-tight">
                  {formatCurrency(pendingAmount)}
                </span>
                <span className="block text-[10px] text-amber-500 mt-1">
                  {pendingCount} fichas em aberto
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 no-print">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>

          </div>

          {/* DYNAMIC PROGRESS ACCELERATOR PERFORMANCE BAR */}
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-5">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4 text-brand-gold shrink-0" />
                <span className="text-xs font-bold text-slate-700">Índice de Performance de Recuperação WA Fort</span>
              </div>
              <span className="text-xs font-black text-[#1E3A8A] bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                Taxa de Sucesso: {recoveryRate.toFixed(1)}%
              </span>
            </div>

            <div className="w-full bg-slate-250 rounded-full h-3 overflow-hidden flex">
              <div 
                className="bg-emerald-500 h-full transition-all duration-500 hover:opacity-90" 
                style={{ width: `${recoveryRate}%` }} 
                title={`Recuperado: ${recoveryRate.toFixed(1)}%`}
              />
              <div 
                className="bg-purple-400 h-full transition-all duration-500 hover:opacity-90" 
                style={{ width: `${totalAmount > 0 ? (negotiatingAmount / totalAmount) * 100 : 0}%` }}
                title={`Em Negociação: ${(totalAmount > 0 ? (negotiatingAmount / totalAmount) * 100 : 0).toFixed(1)}%`}
              />
              <div 
                className="bg-amber-400 h-full transition-all duration-500 hover:opacity-90" 
                style={{ width: `${totalAmount > 0 ? (pendingAmount / totalAmount) * 100 : 0}%` }}
                title={`Pendentes/Notificados: ${(totalAmount > 0 ? (pendingAmount / totalAmount) * 100 : 0).toFixed(1)}%`}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3 text-[10px] font-semibold text-slate-500">
              <div className="flex items-center gap-1.5 justify-center sm:justify-start">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span>Pago / Dinheiro no Caixa</span>
              </div>
              <div className="flex items-center gap-1.5 justify-center">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />
                <span>Em Negociação</span>
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                <span>Atrasados Pendentes</span>
              </div>
            </div>
          </div>

          {/* DOWNLOAD / ACTIONS PANEL */}
          <div className="bg-[#1E3A8A]/5 border border-brand-blue/15 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 no-print">
            <div className="text-center sm:text-left">
              <h4 className="font-bold text-sm text-[#1E3A8A] flex items-center justify-center sm:justify-start gap-1">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Exportar Planilhas de Auditoria
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">Prepare os relatórios operacionais completos para conciliação bancária.</p>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleExportCSV('recovered')}
                className="px-4 py-2 border-2 border-emerald-500 bg-white hover:bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <FileDown className="w-3.5 h-3.5" />
                Dívidas Recuperadas (.CSV)
              </button>

              <button
                type="button"
                onClick={() => handleExportCSV('all')}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-950 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Base Completa (.CSV)
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 bg-brand-gold hover:bg-[#b08e1a] text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir / PDF
              </button>
            </div>
          </div>

          {/* OPERATIONAL DATATABLE PREVIEW */}
          <div className="space-y-3">
            <div className="flex items-center justify-between no-print">
              <span className="text-xs font-bold text-slate-700">Prévia do Painel de Contatos</span>
              
              <div className="flex items-center space-x-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFilterType('all')}
                  className={`px-2.5 py-1 text-[10px] font-black rounded-md ${filterType === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  Todos ({debtors.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('paid')}
                  className={`px-2.5 py-1 text-[10px] font-black rounded-md ${filterType === 'paid' ? 'bg-emerald-100 text-emerald-800 shadow-xs' : 'text-slate-500 hover:text-emerald-700'}`}
                >
                  Recuperados ({recoveredCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterType('not_paid')}
                  className={`px-2.5 py-1 text-[10px] font-black rounded-md ${filterType === 'not_paid' ? 'bg-amber-100 text-amber-800 shadow-xs' : 'text-slate-500 hover:text-amber-700'}`}
                >
                  Outstanding ({negotiatingCount + pendingCount})
                </button>
              </div>
            </div>

            <div className="overflow-hidden border border-slate-200 rounded-2xl bg-white print:border-none print:shadow-none">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold print:bg-slate-100 print:border-b-2 print:border-slate-300">
                    <th className="p-3 pl-4">Inadimplente</th>
                    <th className="p-3">Data Venc.</th>
                    <th className="p-3 text-right">Valor Inicial</th>
                    <th className="p-3 text-center">Dias Overdue</th>
                    <th className="p-3 text-center">Régua Tone</th>
                    <th className="p-3 text-right pr-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewDebtors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 font-medium">
                        Nenhum registro encontrado neste filtro de relatórios.
                      </td>
                    </tr>
                  ) : (
                    previewDebtors.map(d => {
                      let statusBadge = (
                        <span className="px-2 py-0.5 rounded-sm text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200">
                          Pendente
                        </span>
                      );
                      if (d.status === 'paid') {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded-sm text-[9px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200">
                            Recuperado
                          </span>
                        );
                      } else if (d.status === 'negotiating') {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded-sm text-[9px] font-black uppercase text-purple-700 bg-purple-50 border border-purple-200">
                            Negociando
                          </span>
                        );
                      } else if (d.status === 'notified') {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded-sm text-[9px] font-black uppercase text-blue-700 bg-blue-50 border border-blue-200">
                            Notificado
                          </span>
                        );
                      }

                      return (
                        <tr key={d.id} className="hover:bg-slate-50/50 print:break-inside-avoid">
                          <td className="p-3 pl-4 max-w-[180px] truncate">
                            <span className="block font-bold text-slate-800">{d.name}</span>
                            <span className="block text-[10px] text-slate-400 font-mono select-all">{d.phone}</span>
                          </td>
                          <td className="p-3 text-slate-600 font-semibold font-mono">
                            {d.dueDate.split('-').reverse().join('/')}
                          </td>
                          <td className="p-3 text-right font-bold text-slate-900 font-mono">
                            {formatCurrency(d.amount)}
                          </td>
                          <td className="p-3 text-center font-mono">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${d.daysOverdue > 90 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                              {d.daysOverdue} dias
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[9px] uppercase font-black tracking-wider text-slate-500 font-mono">
                              {d.tone}
                            </span>
                          </td>
                          <td className="p-3 text-right pr-4 text-xs font-semibold">
                            {statusBadge}
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

        {/* MODAL FOOTER BUTTONS */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-3xl flex justify-between items-center no-print">
          <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5 uppercase tracking-wider">
            <Clock className="w-3.5 h-3.5 text-slate-350" /> Operação Integrada WA Fort &bull; 2026
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs bg-slate-900 hover:bg-slate-950 text-white font-black rounded-xl cursor-pointer transition shadow-sm"
          >
            Fechar Relatórios
          </button>
        </div>

        {/* PRINTABLE FOOTER INSCRIPTION */}
        <div className="hidden print:block p-8 border-t-2 border-slate-250 mt-16 text-center text-[10px] text-slate-400 font-mono leading-relaxed">
          <p>
            Relatório de performance gerado eletronicamente e conferido sob padrões do software de recuperação WA Fort.
          </p>
          <div className="mt-8 flex justify-around items-center">
            <div className="w-48 border-t border-slate-400 pt-1.5">
              <span>Assinatura Operador Geral</span>
            </div>
            <div className="w-48 border-t border-slate-400 pt-1.5">
              <span>Conferência WA Fort Financeiro</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
