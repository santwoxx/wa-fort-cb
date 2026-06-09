import { Request, Response, NextFunction } from 'express';
import { getAuthAdmin, getFirestoreAdmin } from './backendAuth';
import { UserRole, UserPermission, ROLE_PERMISSIONS } from '../types';

// Extend Express Request type to include user information
export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
    nome?: string;
    isDemo?: boolean;
    role?: UserRole;
    permissoes?: UserPermission[];
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Cabeçalho Authorization ausente ou inválido.' });
  }

  const token = authHeader.split(' ')[1];

  // Graceful Demo/Mock Fallback for local sandbox or demo runs
  if (token.startsWith('demo-token-')) {
    if (process.env.NODE_ENV === 'production') {
      console.error("[RBAC Middleware] REJECTED: Demo token used in production mode.");
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
      permissoes: permissions
    };
    return next();
  }

  try {
    const authAdmin = getAuthAdmin();
    if (!authAdmin) {
      // Local dev fallback if firebase admin service account is not provided
      console.warn("[RBAC Middleware] Firebase Admin Auth SDK not initialized. Refusing API access.");
      return res.status(500).json({ error: 'Erro de autenticação: Servidor Firebase Admin não configurado.' });
    }

    const decodedToken = await authAdmin.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      nome: decodedToken.name || ''
    };
    next();
  } catch (error: any) {
    console.error('Erro na autenticação do token:', error);
    return res.status(401).json({ error: 'Token de autenticação inválido ou expirado.' });
  }
}

export function requirePermission(permission: UserPermission) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    // Direct mock handling for Demo Mode
    if (req.user.isDemo && req.user.permissoes) {
      if (req.user.permissoes.includes(permission)) {
        return next();
      }
      return res.status(403).json({ 
        error: `Acesso negado. A permissão '${permission}' é necessária para esta ação.` 
      });
    }

    try {
      const dbAdmin = getFirestoreAdmin();
      if (!dbAdmin) {
        return res.status(500).json({ error: 'Erro no banco de dados do servidor: Firebase Admin não configurado.' });
      }

      // Query usuarios collection for the user's role and permissions
      const userDoc = await dbAdmin.collection('usuarios').doc(req.user.uid).get();
      
      if (!userDoc.exists) {
        return res.status(403).json({ error: 'Cadastro do usuário não encontrado na base de dados.' });
      }

      const userData = userDoc.data();
      const userPermissions = (userData?.permissoes || []) as UserPermission[];

      if (userPermissions.includes(permission)) {
        next();
      } else {
        return res.status(403).json({ 
          error: `Acesso negado. A permissão '${permission}' é necessária para executar esta ação.` 
        });
      }
    } catch (error) {
      console.error('Erro na autorização RBAC:', error);
      return res.status(500).json({ error: 'Erro interno ao verificar permissões do usuário.' });
    }
  };
}

export function requireRole(role: UserRole) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    // Direct mock handling for Demo Mode
    if (req.user.isDemo && req.user.role) {
      if (req.user.role === role) {
        return next();
      }
      return res.status(403).json({ 
        error: `Acesso negado. Apenas a função '${role}' pode acessar este recurso.` 
      });
    }

    try {
      const dbAdmin = getFirestoreAdmin();
      if (!dbAdmin) {
        return res.status(500).json({ error: 'Erro no banco de dados do servidor: Firebase Admin não configurado.' });
      }

      const userDoc = await dbAdmin.collection('usuarios').doc(req.user.uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: 'Cadastro do usuário não encontrado na base de dados.' });
      }

      const userData = userDoc.data();
      if (userData?.role === role) {
        next();
      } else {
        return res.status(403).json({ 
          error: `Acesso negado. Apenas a função '${role}' pode executar esta ação.` 
        });
      }
    } catch (error) {
      console.error('Erro na autorização de função:', error);
      return res.status(500).json({ error: 'Erro interno ao verificar permissões do usuário.' });
    }
  };
}
