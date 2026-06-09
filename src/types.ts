/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type DebtStatus = 'pending' | 'notified' | 'negotiating' | 'paid';

export type CollectionTone = 'friendly' | 'formal' | 'urgent' | 'negotiation';

export interface Debtor {
  id: string;
  name: string;
  phone: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  description: string;
  status: DebtStatus;
  customMessage?: string;
  tone: CollectionTone;
}

export interface CollectionSummary {
  totalOverdueAmount: number;
  totalPendingContacts: number;
  totalNotifiedContacts: number;
  totalPaidContacts: number;
  totalNegotiatingContacts: number;
  recoveryRate: number;
}

export interface AppConfig {
  companyName: string;
  customSignature: string;
  paymentMethods: string; // e.g. "Pix, Boleto Bancário"
  pixKey?: string;
  securityPin?: string;
  promptFriendly?: string;
  promptFormal?: string;
  promptUrgent?: string;
  promptNegotiation?: string;
  templateFriendly?: string;
  templateFormal?: string;
  templateUrgent?: string;
  templateNegotiation?: string;
}

// --- RBAC TYPES & ROLES ---
export type UserRole = 'Administrador' | 'Financeiro' | 'Operador' | 'Supervisor' | 'Auditor';

export type UserPermission = 'Visualizar' | 'Criar' | 'Editar' | 'Excluir' | 'Aprovar';

export interface UserProfile {
  uid: string;
  nome: string;
  email: string;
  role: UserRole;
  permissoes: UserPermission[];
}

export const ROLE_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  Administrador: ['Visualizar', 'Criar', 'Editar', 'Excluir', 'Aprovar'],
  Financeiro: ['Visualizar', 'Criar', 'Editar', 'Aprovar'],
  Supervisor: ['Visualizar', 'Criar', 'Editar', 'Aprovar'],
  Operador: ['Visualizar', 'Criar'],
  Auditor: ['Visualizar']
};

