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
  paymentMethods: string;
  pixKey?: string;
  securityPin?: string;
  securityPinHash?: string;
  promptFriendly?: string;
  promptFormal?: string;
  promptUrgent?: string;
  promptNegotiation?: string;
  templateFriendly?: string;
  templateFormal?: string;
  templateUrgent?: string;
  templateNegotiation?: string;
}

export type UserRole = 'Administrador' | 'Financeiro' | 'Operador' | 'Supervisor' | 'Auditor';
export type UserPermission = 'Visualizar' | 'Criar' | 'Editar' | 'Excluir' | 'Aprovar';

export interface UserProfile {
  uid: string;
  nome: string;
  email: string;
  role: UserRole;
  permissoes: UserPermission[];
  empresaId?: string;
}

export const ROLE_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  Administrador: ['Visualizar', 'Criar', 'Editar', 'Excluir', 'Aprovar'],
  Financeiro: ['Visualizar', 'Criar', 'Editar', 'Aprovar'],
  Supervisor: ['Visualizar', 'Criar', 'Editar', 'Aprovar'],
  Operador: ['Visualizar', 'Criar'],
  Auditor: ['Visualizar']
};

// FASE 2: Tipos do módulo financeiro
export type FinancialStatus = 'ativo' | 'cancelado' | 'estornado' | 'arquivado';
export type DuplicataStatus = 'Pendente' | 'Pago' | 'Vencido' | 'Cancelado' | 'Negociado' | 'Estornado' | 'Arquivado';
export type CaixaTipo = 'entrada' | 'saida' | 'transferencia';

export interface MovimentoCaixa {
  id: string;
  tipo: CaixaTipo;
  categoria: string;
  descricao: string;
  valor: number;
  operadorId: string;
  operadorNome: string;
  dataMovimento: string;
  empresaId: string;
  status: FinancialStatus;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}

export interface Duplicata {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteDocumento: string;
  numeroDuplicata: string;
  descricao: string;
  valor: number;
  vencimento: string;
  status: DuplicataStatus;
  observacoes: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  empresaId: string;
  pixCopiaECola?: string;
  boletoBarCode?: string;
}

export interface Pagamento {
  id: string;
  duplicataId: string;
  duplicataNumero: string;
  clienteId: string;
  clienteNome: string;
  valorPago: number;
  valorOriginal: number;
  dataPagamento: string;
  formaPagamento: string;
  conciliado: boolean;
  conciliadoPor?: string;
  conciliadoEm?: string;
  comprovanteUrl?: string;
  comprovantePath?: string;
  observacoes?: string;
  baixado?: boolean;
  baixadoPor?: string;
  baixadoEm?: string;
  baixadoNome?: string;
  estornadoPor?: string;
  estornadoEm?: string;
  motivoEstorno?: string;
  createdBy: string;
  createdByName: string;
  empresaId: string;
  status: FinancialStatus;
  createdAt: string;
}

export interface LancamentoFinanceiro {
  id: string;
  tipo: 'receita' | 'despesa' | 'transferencia';
  categoria: string;
  descricao: string;
  valor: number;
  dataLancamento: string;
  centroCusto?: string;
  empresaId: string;
  status: FinancialStatus;
  createdAt: string;
}

export interface NotaFiscal {
  id: string;
  numeroNota: string;
  serie: string;
  clienteId: string;
  clienteNome: string;
  clienteDocumento: string;
  valor: number;
  dataEmissao: string;
  dataVencimento: string;
  descricao: string;
  tipoNota: 'NFS-e' | 'NF-e' | 'NFC-e';
  chaveAcesso?: string;
  empresaId: string;
  status: FinancialStatus;
  createdAt: string;
}

export interface AuditoriaLog {
  id: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  operadorId: string;
  operadorNome: string;
  ip: string;
  userAgent: string;
  dadosAnteriores: any;
  dadosNovos: any;
  empresaId: string;
  createdAt: string;
}
