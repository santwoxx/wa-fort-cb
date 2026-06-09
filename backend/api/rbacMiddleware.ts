import { Request, Response, NextFunction } from 'express';
import { getAuthAdmin, getFirestoreAdmin } from './backendAuth';
import { UserRole, UserPermission, ROLE_PERMISSIONS } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    nome?: string;
    isDemo?: boolean;
    role?: UserRole;
    permissoes?: UserPermission[];
    empresaId?: string;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Cabeçalho Authorization ausente ou inválido.' });
  }

  const token = authHeader.split(' ')[1];

  if (token.startsWith('demo-token-')) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[RBAC] REJECTED: Demo token in production.');
      return res.status(401).json({ error: 'Token de demonstração não é permitido em ambiente de produção.' });
    }
    const role = token.replace('demo-token-', '') as UserRole;
    const permissions = ROLE_PERMISSIONS[role] || [];
    req.user = {
      uid: `demo-user-${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@wa-fort.com`,
      nome: `Operador Demonstrativo (${role})`,
      isDemo: true,
      role: role,
      permissoes: permissions,
      empresaId: 'empresa-demo'
    };
    return next();
  }

  try {
    const authAdmin = getAuthAdmin();
    if (!authAdmin) {
      console.warn('[RBAC] Firebase Admin Auth not initialized.');
      return res.status(500).json({ error: 'Erro de autenticação: Servidor Firebase Admin não configurado.' });
    }

    // FASE 1: Verifica token e extrai Custom Claims
    const decodedToken = await authAdmin.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      nome: decodedToken.name || '',
      role: decodedToken.role as UserRole,
      permissoes: decodedToken.permissoes as UserPermission[],
      empresaId: decodedToken.empresaId as string
    };
    next();
  } catch (error: any) {
    console.error('[RBAC] Token verification error:', error);
    return res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
  }
}

export function requirePermission(permission: UserPermission) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const userPermissions = req.user.permissoes || [];

    // FASE 1: Verifica permissão via Custom Claims
    if (userPermissions.includes(permission)) {
      next();
    } else {
      return res.status(403).json({
        error: `Acesso negado. A permissão '${permission}' é necessária para executar esta ação.`
      });
    }
  };
}

export function requireRole(role: UserRole) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    // FASE 1: Verifica role via Custom Claims
    if (req.user.role === role) {
      next();
    } else {
      return res.status(403).json({
        error: `Acesso negado. Apenas a função '${role}' pode executar esta ação.`
      });
    }
  };
}

export function requireAnyRole(roles: UserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    if (roles.includes(req.user.role as UserRole)) {
      next();
    } else {
      return res.status(403).json({
        error: `Acesso negado. Uma das funções [${roles.join(', ')}] é necessária.`
      });
    }
  };
}

// FASE 5: Middleware para proteger campos críticos de alteração
const PROTECTED_FIELDS = [
  'valor',
  'clienteId',
  'numeroDuplicata',
  'numeroNota',
  'createdAt',
  'createdBy'
];

export function protectCriticalFields(collection: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    const body = req.body;
    const protectedChanges = PROTECTED_FIELDS.filter(f => f in body);

    if (protectedChanges.length > 0) {
      // FASE 5: Somente admin com permissão 'Aprovar' pode alterar campos críticos
      const userPermissions = req.user.permissoes || [];
      if (!userPermissions.includes('Aprovar')) {
        return res.status(403).json({
          error: `Acesso negado. Campos protegidos [${protectedChanges.join(', ')}] só podem ser alterados com permissão 'Aprovar'.`
        });
      }

      // NUNCA permitir alterar createdBy ou createdAt mesmo com Aprovar
      const neverAllowed = ['createdAt', 'createdBy'];
      const tampered = neverAllowed.filter(f => f in body);
      if (tampered.length > 0) {
        return res.status(403).json({
          error: `Os campos [${tampered.join(', ')}] são imutáveis e não podem ser alterados.`
        });
      }

      // FASE 8: Registro obrigatório de auditoria para alteração crítica
      req.criticalChanges = protectedChanges;
      req.requiresAudit = true;
    }

    next();
  };
}

// Estender o tipo para auditoria
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    nome?: string;
    isDemo?: boolean;
    role?: UserRole;
    permissoes?: UserPermission[];
    empresaId?: string;
  };
  criticalChanges?: string[];
  requiresAudit?: boolean;
  auditAction?: string;
}

// FASE 3 + 9: Middleware de auditoria automática
export async function auditLog(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Intercepta o método res.json para capturar a resposta
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    // Só registra auditoria se for uma operação de escrita bem-sucedida
    if (res.statusCode >= 200 && res.statusCode < 300 && req.method !== 'GET') {
      const dbAdmin = getFirestoreAdmin();
      if (dbAdmin && req.user && !req.user.isDemo) {
        const ip = (req.headers['x-forwarded-for'] as string || req.ip || '127.0.0.1').split(',')[0].trim();
        const userAgent = req.headers['user-agent'] || '';
        const empresaId = req.user!.empresaId || 'empresa-default';

        const entidade = req.path.split('/')[1] || 'unknown';
        const acao = req.auditAction || `${req.method}_${entidade}`.toUpperCase();

        dbAdmin.collection('auditoria').add({
          entidade,
          entidadeId: body?.id || body?.movimentoId || body?.duplicataId || body?.pagamentoId || req.params?.id || req.params?.movimentoId || 'unknown',
          acao,
          operadorId: req.user!.uid,
          operadorNome: req.user!.nome || 'Operador',
          ip,
          userAgent,
          dadosAnteriores: req.body?.dadosAnteriores || null,
          dadosNovos: req.criticalChanges ? { camposAlterados: req.criticalChanges, ...req.body } : req.body,
          empresaId,
          createdAt: new Date().toISOString()
        }).catch((err: any) => console.error('[AuditLog] Falha ao gravar:', err));
      }
    }
    return originalJson(body);
  };
  next();
}

// FASE 4: Middleware para garantir soft delete (impedir exclusão física)
export function enforceSoftDelete(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.method === 'DELETE') {
    return res.status(403).json({
      error: 'Exclusão física não permitida. Utilize marcação de status (cancelado, arquivado, estornado).'
    });
  }
  next();
}
