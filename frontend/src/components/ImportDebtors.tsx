/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { 
  PlusCircle, 
  FileSpreadsheet, 
  X, 
  HelpCircle, 
  Save, 
  Upload, 
  Sparkles, 
  FileText, 
  Loader2, 
  AlertTriangle,
  Clipboard,
  CheckCircle2
} from "lucide-react";
import { Debtor, CollectionTone, UserProfile } from "../types";
import { calculateDaysDifference, formatWhatsAppNumber } from "../mockData";
import { API_URL } from "../config";

interface ImportDebtorsProps {
  onImport: (newDebtors: Omit<Debtor, "id" | "daysOverdue">[]) => void;
  onClose: () => void;
  showAlert?: (message: string, title?: string) => void;
  currentUser: any;
  userProfile: UserProfile | null;
}

export function ImportDebtors({ onImport, onClose, showAlert, currentUser, userProfile }: ImportDebtorsProps) {
  const [activeTab, setActiveTab] = useState<"single" | "bulk" | "ai">("single");
  
  // Single debtor states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("2026-05-15");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<CollectionTone>("formal");
  
  // Bulk debtor paste state
  const [bulkText, setBulkText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<Omit<Debtor, "id" | "daysOverdue">[]>([]);
  const [parsingError, setParsingError] = useState("");

  // AI unstructured extraction states
  const [aiText, setAiText] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [aiExtractionError, setAiExtractionError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayAlert = (msg: string, title?: string) => {
    if (showAlert) {
      showAlert(msg, title);
    } else {
      alert(msg);
    }
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !amount.trim() || !dueDate) {
      displayAlert("Por favor, preencha todos os campos obrigatórios.", "Campos Vazios");
      return;
    }

    const parsedAmount = parseFloat(amount.replace(/[^\d.-]/g, "").replace(",", "."));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      displayAlert("Valor inválido de cobrança.", "Erro de Validação");
      return;
    }

    const cleanPhone = formatWhatsAppNumber(phone);
    if (cleanPhone.length < 10) {
      displayAlert("Número de telefone inválido. Insira pelo menos o DDD e o número.", "Telefone Inválido");
      return;
    }

    onImport([{
      name: name.trim(),
      phone: cleanPhone,
      amount: parsedAmount,
      dueDate,
      description: description.trim() || "Mensalidade WA Fort",
      status: "pending",
      tone,
      customMessage: ""
    }]);

    // Reset
    setName("");
    setPhone("");
    setAmount("");
    setDescription("");
    onClose();
  };

  const parseBulkText = (textValue: string) => {
    if (!textValue.trim()) {
      setParsingError("Cole algum texto para processar.");
      return;
    }

    const lines = textValue.split("\n");
    const results: Omit<Debtor, "id" | "daysOverdue">[] = [];
    let errorCount = 0;

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (!cleanLine) return; // skip empty line

      // Splitted by semi-colon, tab or comma
      let parts = cleanLine.split("\t");
      if (parts.length < 2) parts = cleanLine.split(";");
      if (parts.length < 2) parts = cleanLine.split(",");

      if (parts.length < 2) {
        errorCount++;
        return;
      }

      const clientName = parts[0]?.trim();
      const clientPhone = parts[1]?.replace(/[^\d]/g, "") || "";
      
      // Extract amount (usually R$ 123,45 or just 123.45)
      let rawAmount = parts[2] || "150.00";
      const cleanAmount = parseFloat(rawAmount.replace(/[^\d.-]/g, "").split(",").join("."));
      const clientAmount = isNaN(cleanAmount) ? 150 : cleanAmount;

      const clientDueDate = parts[3]?.trim() || "2026-05-15";
      const clientDesc = parts[4]?.trim() || "Mensalidade WA Fort";

      if (clientName && clientPhone.length >= 8) {
        results.push({
          name: clientName,
          phone: formatWhatsAppNumber(clientPhone),
          amount: clientAmount,
          dueDate: clientDueDate,
          description: clientDesc,
          status: "pending",
          tone: "formal",
          customMessage: ""
        });
      } else {
        errorCount++;
      }
    });

    if (results.length === 0) {
      setParsingError("Não foi possível extrair nenhum contato válido. Verifique as instruções.");
      setParsedPreview([]);
    } else {
      setParsedPreview(results);
      setParsingError(errorCount > 0 ? `Identificados ${results.length} contatos. ${errorCount} linhas apresentaram aviso de consistência.` : "");
    }
  };

  const handleBulkParse = () => {
    parseBulkText(bulkText);
  };

  const handleBulkSubmit = () => {
    if (parsedPreview.length === 0) {
      displayAlert("Nenhum contato importado para salvar.", "Importação Vazia");
      return;
    }
    onImport(parsedPreview);
    setBulkText("");
    setParsedPreview([]);
    onClose();
  };

  // AI Unstructured extractor
  const handleAIExtract = async () => {
    if (!aiText.trim()) {
      setAiExtractionError("Por favor, digite ou cole algum texto desestruturado para processar.");
      return;
    }

    setIsExtracting(true);
    setAiExtractionError("");

    try {
      const token = currentUser?.isDemo
        ? `demo-token-${userProfile?.role || 'Operador'}`
        : await currentUser?.getIdToken();

      const response = await fetch(`${API_URL}/api/extract-debtors`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ text: aiText })
      });

      if (!response.ok) {
        throw new Error("Erro de comunicação com o servidor de inteligência artificial.");
      }

      const data = await response.json();
      if (data.debtors && data.debtors.length > 0) {
        const processedDebtors = data.debtors.map((d: any) => ({
          name: d.name,
          phone: formatWhatsAppNumber(d.phone),
          amount: typeof d.amount === "number" ? d.amount : parseFloat(String(d.amount).replace(/[^\d.-]/g, "") || "0"),
          dueDate: d.dueDate || "2026-05-15",
          description: d.description || "Mensalidade WA Fort",
          status: "pending" as const,
          tone: "formal" as const,
          customMessage: ""
        }));

        setParsedPreview(processedDebtors);
        setAiExtractionError("");
      } else {
        setAiExtractionError("A Inteligência Artificial não conseguiu identificar devedores no texto fornecido. Tente incluir nomes, valores e telefones mais explícitos.");
      }
    } catch (error: any) {
      console.error(error);
      setAiExtractionError(error.message || "Falha ao processar texto com a IA.");
    } finally {
      setIsExtracting(false);
    }
  };

  // File Upload reading
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    readAndStoreFile(file);
  };

  const readAndStoreFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      if (activeTab === "ai") {
        setAiText(text);
      } else {
        setBulkText(text);
        // Auto parse for bulk tab
        parseBulkText(text);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readAndStoreFile(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-150 max-w-2xl w-full max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-brand-blue text-white">
              <PlusCircle className="w-5 h-5 text-brand-gold" />
            </div>
            <div>
              <h3 className="font-bold text-lg font-display text-brand-blue">Adicionar Inadimplentes</h3>
              <p className="text-xs text-slate-500">Agregue novos registros de cobrança de forma manual ou em lote estruturado</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-100 px-5 bg-slate-50/50">
          <button
            onClick={() => {
              setActiveTab("single");
              setParsedPreview([]);
              setParsingError("");
            }}
            className={`py-3 px-4 font-semibold text-xs uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === "single"
                ? "border-brand-blue text-brand-blue"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Único Cliente
          </button>
          
          <button
            onClick={() => {
              setActiveTab("bulk");
              setParsedPreview([]);
              setParsingError("");
            }}
            className={`py-3 px-4 font-semibold text-xs uppercase tracking-wider border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === "bulk"
                ? "border-brand-blue text-brand-blue"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Colar Excel / CSV</span>
          </button>

          <button
            onClick={() => {
              setActiveTab("ai");
              setParsedPreview([]);
              setAiExtractionError("");
            }}
            className={`py-3 px-4 font-semibold text-xs uppercase tracking-wider border-b-2 transition-all flex items-center space-x-2 cursor-pointer ${
              activeTab === "ai"
                ? "border-brand-blue text-brand-blue font-bold text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles className="w-4 h-4 text-brand-gold fill-brand-gold/20" />
            <span>Extrator por IA (PDF / E-mail / Foto)</span>
          </button>
        </div>

        {/* Hidden File Input for convenience */}
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".txt,.csv"
          className="hidden"
        />

        {/* Form Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
          
          {/* SINGLE CLIENT FORM */}
          {activeTab === "single" && (
            <form onSubmit={handleSingleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nome Completo do Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Ricardo Almeida"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    WhatsApp com DDD *
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: (11) 97777-6666"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue bg-white text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Valor Total do Débito (R$) *
                  </label>
                  <input
                    type="text"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Ex: 1240,50"
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue bg-white text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Data de Vencimento *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue bg-white text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Descrição do Serviço / Fatura
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Locação de Câmeras de Portaria WA Fort"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 text-slate-700">
                  Tom Inicial da Mensagem IA
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(["friendly", "formal", "urgent", "negotiation"] as CollectionTone[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={`py-2 px-1 text-xs font-medium rounded-lg border text-center cursor-pointer capitalize transition ${
                        tone === t
                          ? "bg-brand-blue text-white border-transparent"
                          : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700"
                      }`}
                    >
                      {t === "friendly" && "🌸 Amigável"}
                      {t === "formal" && "💼 Formal"}
                      {t === "urgent" && "⚠️ Urgente"}
                      {t === "negotiation" && "🤝 Acordo"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm bg-brand-blue hover:bg-blue-900 text-white font-bold rounded-xl shadow-xs transition flex items-center space-x-2 cursor-pointer border border-transparent"
                >
                  <Save className="w-4 h-4 text-brand-gold" />
                  <span>Salvar Inadimplente</span>
                </button>
              </div>
            </form>
          )}

          {/* BULK TAB COPIED SLATE / FILE TXT-CSV */}
          {activeTab === "bulk" && (
            <div className="space-y-4">
              <div className="p-3.5 bg-blue-50/60 border border-blue-100/70 rounded-xl flex items-start space-x-2.5">
                <HelpCircle className="w-5 h-5 text-blue-800 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-900 leading-relaxed">
                  <p className="font-semibold mb-1">Como importar dados de tabelas:</p>
                  <p>Copie as linhas da planilha Excel ou Google Planilhas. Cada linha deve conter colunas separadas por ponto e vírgula (;), vírgulas, ou tabulações na ordem:</p>
                  <p className="font-mono bg-white px-2 py-1 my-1.5 border border-blue-200 rounded-sm text-[10px] font-semibold text-slate-700">Nome do Cliente [Divisor] WhatsApp [Divisor] Valor [Divisor] Data [Divisor] Descrição</p>
                  <p>Exemplo: <code className="font-mono text-emerald-800 font-bold bg-emerald-50 px-1 py-0.5 rounded">Ana Paula Souza; 11988887777; 450,00; 2026-05-15; Mensalidade WA Pro</code></p>
                </div>
              </div>

              {/* Drag and Drop Zone */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed p-6 rounded-xl flex flex-col items-center justify-center transition-colors text-center cursor-pointer ${
                  isDragOver 
                    ? "border-brand-gold bg-amber-50/20 text-brand-blue" 
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100/50 text-slate-500"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className={`w-8 h-8 mb-2 ${isDragOver ? "text-brand-gold" : "text-slate-400"}`} />
                <span className="text-xs font-semibold text-slate-700">
                  Arraste e solte seu arquivo de cobrança (.csv ou .txt) aqui
                </span>
                <span className="text-[10px] text-slate-400 mt-1">
                  Ou clique para navegar em sua máquina
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Ou cole os dados copiados abaixo:
                </label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="Nome do Cliente; 11999998888; 150,00; 2026-05-20; Assinatura de Monitoramento&#10;Maria Oliveira; 21988887777; 320,00; 2026-05-18; Internet Banda Larga"
                  rows={4}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue bg-white text-slate-800"
                />
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleBulkParse}
                  className="px-4 py-1.5 text-xs bg-brand-blue hover:bg-blue-900 text-white font-semibold rounded-lg transition cursor-pointer"
                >
                  Analisar Conteúdo
                </button>
                {parsingError && <span className="text-xs text-amber-600 font-semibold">{parsingError}</span>}
              </div>

              {parsedPreview.length > 0 && (
                <div className="border border-slate-100 rounded-xl overflow-hidden mt-3 max-h-40 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="p-2">Cliente</th>
                        <th className="p-2">WhatsApp</th>
                        <th className="p-2 text-right">Valor</th>
                        <th className="p-2">Vencimento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {parsedPreview.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 font-medium text-slate-800 truncate max-w-[120px]">{item.name}</td>
                          <td className="p-2 font-mono text-slate-600">{item.phone}</td>
                          <td className="p-2 text-right font-semibold text-[#1E293B]">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                          </td>
                          <td className="p-2 text-slate-500">{item.dueDate}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={parsedPreview.length === 0}
                  className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition flex items-center space-x-2 cursor-pointer border border-transparent"
                >
                  <PlusCircle className="w-4 h-4 text-white" />
                  <span>Importar {parsedPreview.length} Contatos</span>
                </button>
              </div>
            </div>
          )}

          {/* AI TAB FOR UNSTRUCTURED AND PDF TEXT COPYPASTE */}
          {activeTab === "ai" && (
            <div className="space-y-4">
              <div className="p-3.5 bg-brand-gold/5 border border-brand-gold/20 rounded-xl flex items-start space-x-2.5">
                <Sparkles className="w-5 h-5 text-brand-gold shrink-0 mt-0.5 fill-brand-gold/15" />
                <div className="text-xs text-slate-700 leading-relaxed">
                  <p className="font-bold text-brand-blue mb-1">Mecanismo Inteligente de Reconhecimento:</p>
                  <p>Copie o texto de relatórios em PDF, telas de sistemas legados, e-mails de cobrança ou faturas e cole abaixo. Nosso robô de inteligência artificial irá decifrar os nomes dos clientes, telefones de contato, valores devidos e datas de vencimento automaticamente.</p>
                </div>
              </div>

              {/* Drag activity */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border border-dashed p-4 rounded-xl flex flex-col items-center justify-center transition-colors text-center cursor-pointer ${
                  isDragOver 
                    ? "border-brand-gold bg-amber-50/10 text-brand-blue" 
                    : "border-slate-200 bg-slate-50 hover:bg-slate-100/30 text-slate-400"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <p className="text-[11px] font-medium text-slate-600">
                  Opcional: Arraste aqui uma fatura ou relatório em formato de texto (.txt, .csv) para colar automaticamente
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1 flex justify-between">
                  <span>Conteúdo Desestruturado para Inteligência Artificial ler:</span>
                  <span className="text-[10px] text-brand-blue font-bold">PDF / WhatsApp / Email</span>
                </label>
                <textarea
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder="Cole aqui por exemplo:&#10;'O cliente Ricardo Almeida que mora em SP (11) 97777-6666 ficou de pagar R$ 1.240,50 correspondente ao plano de segurança WA mas o boleto que vencia em 15/03/2026 continua em aberto. Além disso, favor avisar o devedor Fernando Jorge no cel 11980007000 sobre o vencimento de R$ 980,00 do dia 02/06/2026 da mensalidade.'"
                  rows={5}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-xs font-sans focus:outline-none focus:ring-2 focus:ring-brand-blue/20 focus:border-brand-blue bg-white text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div className="flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleAIExtract}
                  disabled={isExtracting}
                  className="px-5 py-2 bg-brand-blue hover:bg-blue-900 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl flex items-center space-x-2 transition cursor-pointer"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-brand-gold" />
                      <span>Processando com IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-brand-gold fill-brand-gold/10" />
                      <span>Analisar e Organizar por IA</span>
                    </>
                  )}
                </button>
                {aiExtractionError && (
                  <span className="text-xs text-red-600 font-semibold max-w-[50%] leading-tight text-right flex items-center space-x-1 justify-end">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 mr-1 flex-shrink-0" />
                    <span>Falha na leitura</span>
                  </span>
                )}
              </div>

              {parsedPreview.length > 0 && (
                <div className="space-y-2 mt-4">
                  <div className="flex items-center space-x-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100 p-2.5 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>IA estruturou {parsedPreview.length} devedor(es). Por favor, confira a prévia das dívidas abaixo:</span>
                  </div>
                  
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-left text-xs bg-white">
                      <thead className="bg-[#1E293B]/5 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="p-2">Nome extraído</th>
                          <th className="p-2">Telefone</th>
                          <th className="p-2 text-right">Valor</th>
                          <th className="p-2">Vencimento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedPreview.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="p-2 font-medium text-slate-850 truncate max-w-[130px]">{item.name}</td>
                            <td className="p-2 font-mono text-slate-650">{item.phone}</td>
                            <td className="p-2 text-right font-bold text-slate-800">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.amount)}
                            </td>
                            <td className="p-2 text-slate-500">{item.dueDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={parsedPreview.length === 0}
                  className="px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition flex items-center space-x-2 cursor-pointer border border-transparent"
                >
                  <PlusCircle className="w-4 h-4 text-white" />
                  <span>Importar {parsedPreview.length} Contatos</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
