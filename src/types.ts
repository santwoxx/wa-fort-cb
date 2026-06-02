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
