/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  TrendingUp, 
  HelpCircle, 
  CheckCircle, 
  AlertTriangle, 
  MessageSquare, 
  Users 
} from "lucide-react";
import { CollectionSummary } from "../types";

interface SummaryStatsProps {
  summary: CollectionSummary;
  onFilterChange: (status: string) => void;
  activeFilter: string;
}

export function SummaryStats({ summary, onFilterChange, activeFilter }: SummaryStatsProps) {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const statItems = [
    {
      id: "stat-total",
      label: "Inadimplência Total",
      value: formatCurrency(summary.totalOverdueAmount),
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50 border-red-100",
      filterValue: "all"
    },
    {
      id: "stat-pending",
      label: "Contatos Pendentes",
      value: summary.totalPendingContacts,
      icon: HelpCircle,
      color: "text-amber-600 bg-amber-50 border-amber-100",
      filterValue: "pending"
    },
    {
      id: "stat-notified",
      label: "Clientes Notificados",
      value: summary.totalNotifiedContacts,
      icon: MessageSquare,
      color: "text-blue-600 bg-blue-50 border-blue-100",
      filterValue: "notified"
    },
    {
      id: "stat-negotiating",
      label: "Em Negociação",
      value: summary.totalNegotiatingContacts,
      icon: TrendingUp,
      color: "text-purple-600 bg-purple-50 border-purple-100",
      filterValue: "negotiating"
    },
    {
      id: "stat-paid",
      label: "Dívidas Recuperadas",
      value: summary.totalPaidContacts,
      icon: CheckCircle,
      color: "text-emerald-600 bg-emerald-50 border-emerald-100",
      filterValue: "paid"
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {statItems.map((item) => {
        const IconComponent = item.icon;
        const isActive = activeFilter === item.filterValue;

        return (
          <button
            key={item.id}
            id={item.id}
            onClick={() => onFilterChange(item.filterValue)}
            className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
              isActive 
                ? "bg-white border-brand-blue border-2 shadow-md ring-2 ring-brand-blue/10 scale-[1.02]" 
                : "bg-white hover:bg-slate-50 border-slate-200 shadow-sm hover:shadow-md"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {item.label}
              </span>
              <div className={`p-2 rounded-lg border ${item.color}`}>
                <IconComponent className="w-5 h-5" />
              </div>
            </div>
            
            <div className="flex items-baseline space-x-2">
              <span className="text-xl md:text-2xl font-bold font-display text-slate-900">
                {item.value}
              </span>
            </div>

            {item.filterValue === "paid" && (
              <div className="mt-2 flex items-center text-xs text-emerald-600 font-medium">
                <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-sm mr-1 font-semibold">
                  {summary.recoveryRate.toFixed(1)}%
                </span>
                taxa de recuperação
              </div>
            )}
            
            {item.filterValue !== "paid" && (
              <div className="mt-2 text-[10px] text-slate-400">
                Clique para filtrar lista
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
