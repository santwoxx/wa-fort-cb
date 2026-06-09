/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Building2, 
  Search, 
  Plus, 
  Trash2, 
  Send, 
  Sparkles, 
  RefreshCw, 
  Settings, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  UserPlus, 
  FileCheck, 
  MessageCircle, 
  HelpCircle,
  FileSpreadsheet,
  Layers,
  ChevronRight,
  Sparkle,
  Lock,
  Unlock,
  ShieldCheck,
  ShieldAlert,
  Copy,
  ChevronLeft,
  LogOut,
  User
} from "lucide-react";

import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { auth, db, signInWithGoogle, logout, handleFirestoreError, OperationType } from "./firebase";

import { Debtor, CollectionSummary, AppConfig, CollectionTone, DebtStatus, UserProfile, UserRole, UserPermission, ROLE_PERMISSIONS } from "./types";
import { SummaryStats } from "./components/SummaryStats";
import { ImportDebtors } from "./components/ImportDebtors";
import { SettingsModal } from "./components/SettingsModal";
import { ReportsModal } from "./components/ReportsModal";
import { 
  DEFAULT_CONFIG, 
  INITIAL_DEBTORS, 
  DEMO_DEBTORS,
  calculateDaysDifference, 
  formatWhatsAppNumber, 
  formatPhoneNumberDisplay 
} from "./mockData";
import { API_URL } from "./config";

export default function App() {
  // Authentication states
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);

  // RBAC operational states
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState<boolean>(true);
  const [demoRole, setDemoRole] = useState<UserRole>('Administrador');

  // Operator verification state (stored in sessionStorage to avoid unnecessary re-entries during active session)
  const [isAdminVerified, setIsAdminVerified] = useState<boolean>(() => {
    return sessionStorage.getItem("wafort_admin_verified") === "true";
  });
  const [adminLoginInput, setAdminLoginInput] = useState("");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);

  // Initialize state; actual sync is driven dynamically by Firestore once authenticated
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  // Operational states
  const [activeDebtorId, setActiveDebtorId] = useState<string>(debtors[0]?.id || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all"); // 'all', 'pending', 'notified', 'negotiating', 'paid'
  const [sortBy, setSortBy] = useState<"days" | "value_desc" | "value_asc">("days");
  const [previousDebtStatuses, setPreviousDebtStatuses] = useState<Record<string, DebtStatus>>({});
  
  // UI drawer/modal panels
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  
  // Loading and generation flags
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [globalMessageStatus, setGlobalMessageStatus] = useState<string | null>(null);

  // Security Workstation & Responsive states
  const [isTerminalLocked, setIsTerminalLocked] = useState<boolean>(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [mobileTab, setMobileTab] = useState<"list" | "editor">("list");

  // Custom alert & confirmation modal states to prevent iframe blockages
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: "alert" | "confirm";
    title: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    type: "alert",
    title: "",
    message: "",
  });

  // --- FIREBASE SECURITY AUTH & SYNC SYSTEM ---

  const [authDomainError, setAuthDomainError] = useState<string | null>(null);

  // Listen to Firebase Authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser((prev: any) => {
          if (prev && prev.isDemo) return prev;
          return user;
        });
      } else {
        setCurrentUser((prev: any) => {
          if (prev && prev.isDemo) return prev;
          return null;
        });
      }
      setIsAuthLoading(false);
    }, (error) => {
      console.error("Erro no observador de autenticação:", error);
      setIsAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  // Fetch/Sync User Profile for RBAC
  useEffect(() => {
    if (!currentUser) {
      setUserProfile(null);
      setIsProfileLoading(false);
      return;
    }

    if (currentUser.isDemo) {
      setUserProfile({
        uid: currentUser.uid,
        nome: currentUser.displayName || 'Operador Local',
        email: currentUser.email || 'local@wa-fort.com',
        role: demoRole,
        permissoes: ROLE_PERMISSIONS[demoRole]
      });
      setIsProfileLoading(false);
      return;
    }

    const fetchUserProfile = async () => {
      setIsProfileLoading(true);
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch(`${API_URL}/api/users/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setUserProfile(data.user);
        } else {
          console.error("Erro ao sincronizar perfil.");
        }
      } catch (err) {
        console.error("Erro de perfil:", err);
      } finally {
        setIsProfileLoading(false);
      }
    };

    fetchUserProfile();
  }, [currentUser, demoRole]);

  // Permission checking helper
  const hasPermission = (permission: UserPermission): boolean => {
    if (!userProfile) return false;
    return userProfile.permissoes.includes(permission);
  };

  // Synchronize debtors from Firestore or Local Storage
  useEffect(() => {
    if (!currentUser) {
      setDebtors([]);
      return;
    }

    if (currentUser.isDemo) {
      const saved = localStorage.getItem("wafort_debtors_db_demo");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setDebtors(parsed.map((d: Debtor) => ({
            ...d,
            daysOverdue: calculateDaysDifference(d.dueDate)
          })));
        } catch (e) {
          setDebtors(INITIAL_DEBTORS);
        }
      } else {
        setDebtors(INITIAL_DEBTORS);
      }
      
      // Select the first one or keep selection
      setActiveDebtorId(prev => {
        const stored = localStorage.getItem("wafort_debtors_db_demo");
        const currentList = stored ? JSON.parse(stored) : INITIAL_DEBTORS;
        if (currentList && currentList.length > 0) {
          if (!prev || !currentList.some((it: any) => it.id === prev)) {
            return currentList[0].id;
          }
          return prev;
        }
        return "";
      });
      return;
    }

    const debtorsRef = collection(db, "users", currentUser.uid, "debtors");
    const unsubscribe = onSnapshot(debtorsRef, (snapshot) => {
      const items: Debtor[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data() as Omit<Debtor, "id">;
        items.push({
          ...d,
          id: doc.id,
          daysOverdue: calculateDaysDifference(d.dueDate)
        });
      });
      setDebtors(items);
      
      // Keep track of active debtor selection
      if (items.length > 0) {
        setActiveDebtorId(prev => {
          if (!prev || !items.some(it => it.id === prev)) {
            return items[0].id;
          }
          return prev;
        });
      } else {
        setActiveDebtorId("");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${currentUser.uid}/debtors`);
    });

    return unsubscribe;
  }, [currentUser]);

  // Synchronize operator config from Firestore or Local Storage
  useEffect(() => {
    if (!currentUser) {
      setConfig(DEFAULT_CONFIG);
      return;
    }

    if (currentUser.isDemo) {
      const savedConfig = localStorage.getItem("wafort_config_demo");
      if (savedConfig) {
        try {
          setConfig(JSON.parse(savedConfig));
        } catch (err) {
          setConfig(DEFAULT_CONFIG);
        }
      } else {
        setConfig(DEFAULT_CONFIG);
      }
      return;
    }

    const configRef = doc(db, "users", currentUser.uid, "config", "main");
    const unsubscribe = onSnapshot(configRef, (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as AppConfig);
      } else {
        // Automatically bootstrap configuration for new operators to streamline onboarding
        setDoc(configRef, DEFAULT_CONFIG).catch((err) => {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/config/main`);
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}/config/main`);
    });

    return unsubscribe;
  }, [currentUser]);

  const handleLogin = async () => {
    setAuthDomainError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Erro no Login com Google:", err);
      const errMsg = err?.message || String(err);
      if (err?.code === "auth/unauthorized-domain" || errMsg.includes("unauthorized-domain") || errMsg.includes("unauthorized domain")) {
        setAuthDomainError(window.location.hostname);
      } else {
        showAlert("Não foi possível autenticar sua conta com o Google. Certifique-se de autorizar pop-ups se necessário.", "Falha de Login");
      }
    }
  };

  const handleEnterDemoMode = () => {
    const demoUser = {
      uid: "local-demo-user",
      displayName: "Operador Demonstrativo (Local)",
      email: "local@wa-fort.com",
      photoURL: null,
      isDemo: true
    };
    setCurrentUser(demoUser);
    setIsAdminVerified(false);
  };

  const handleLogout = async () => {
    try {
      if (currentUser && !currentUser.isDemo) {
        await logout();
      }
      sessionStorage.removeItem("wafort_admin_verified");
      setCurrentUser(null);
      setIsAdminVerified(false);
      setAdminLoginInput("");
      setAdminPasswordInput("");
      setAdminError(null);
    } catch (err) {
      showAlert("Não foi possível encerrar a sessão.", "Erro ao Sair");
    }
  };

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminLoginInput === "wafort" && adminPasswordInput === "@#wafort@#") {
      sessionStorage.setItem("wafort_admin_verified", "true");
      setIsAdminVerified(true);
      setAdminError(null);
    } else {
      setAdminError("Nome de usuário login ou senha de segurança incorretos.");
    }
  };

  // Wrap setConfig to write edits directly to users Firestore config
  const handleSaveConfig = async (newConfig: AppConfig) => {
    setConfig(newConfig);
    if (currentUser) {
      if (currentUser.isDemo) {
        localStorage.setItem("wafort_config_demo", JSON.stringify(newConfig));
        return;
      }
      try {
        const configRef = doc(db, "users", currentUser.uid, "config", "main");
        await setDoc(configRef, newConfig);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/config/main`);
      }
    }
  };

  const showAlert = (message: string, title = "Aviso") => {
    setDialog({
      isOpen: true,
      type: "alert",
      title,
      message,
      onConfirm: () => setDialog(prev => ({ ...prev, isOpen: false }))
    });
  };

  const showConfirm = (message: string, onConfirmAction: () => void, title = "Confirmação") => {
    setDialog({
      isOpen: true,
      type: "confirm",
      title,
      message,
      onConfirm: () => {
        setDialog(prev => ({ ...prev, isOpen: false }));
        onConfirmAction();
      },
      onCancel: () => setDialog(prev => ({ ...prev, isOpen: false }))
    });
  };

  // Workstation Inactivity Autolock (e.g., 10 minutes of complete idle)
  useEffect(() => {
    if (isTerminalLocked) return;
    
    let timeoutId: any;
    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsTerminalLocked(true);
      }, 10 * 60 * 1000); // 10 minutes autolock
    };

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("click", resetTimer);

    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [isTerminalLocked]);

  // Keyboard listener for physical numpad typing when locked
  useEffect(() => {
    if (!isTerminalLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      setPinError(null);
      if (e.key >= "0" && e.key <= "9") {
        if (pinInput.length < 6) {
          setPinInput(prev => prev + e.key);
        }
      } else if (e.key === "Backspace") {
        setPinInput(prev => prev.slice(0, -1));
      } else if (e.key === "Enter") {
        // Trigger verification manually
        const correctPin = config.securityPin || "1234";
        if (pinInput === correctPin) {
          setIsTerminalLocked(false);
          setPinInput("");
          setPinError(null);
        } else {
          setPinError("PIN operacional de segurança incorreto. Tente novamente.");
          setPinInput("");
        }
      } else if (e.key === "Escape") {
        setPinInput("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTerminalLocked, pinInput, config.securityPin]);

  // Active debtor pointer
  const activeDebtor = debtors.find(d => d.id === activeDebtorId);

  // Stats computation helper
  const computeSummary = (): CollectionSummary => {
    const totalOverdue = debtors
      .filter(d => d.status !== 'paid')
      .reduce((acc, curr) => acc + curr.amount, 0);

    const pending = debtors.filter(d => d.status === 'pending').length;
    const notified = debtors.filter(d => d.status === 'notified').length;
    const negotiating = debtors.filter(d => d.status === 'negotiating').length;
    const paid = debtors.filter(d => d.status === 'paid').length;

    const totalResolvedVal = debtors
      .filter(d => d.status === 'paid')
      .reduce((acc, curr) => acc + curr.amount, 0);
    const totalValAll = debtors.reduce((acc, curr) => acc + curr.amount, 0);
    
    const recoveryRate = totalValAll > 0 ? (totalResolvedVal / totalValAll) * 100 : 0;

    return {
      totalOverdueAmount: totalOverdue,
      totalPendingContacts: pending,
      totalNotifiedContacts: notified,
      totalPaidContacts: paid,
      totalNegotiatingContacts: negotiating,
      recoveryRate
    };
  };

  const summary = computeSummary();

  // Call API to generate customized warning script from Gemini model
  const generateAIMessageForDebtor = async (targetId: string, customTone?: CollectionTone) => {
    const debtor = debtors.find(d => d.id === targetId);
    if (!debtor || !currentUser) return;

    setIsGeneratingMessage(true);
    try {
      const selectedTone = customTone || debtor.tone;
      const token = currentUser.isDemo 
        ? `demo-token-${userProfile?.role || 'Operador'}` 
        : await currentUser.getIdToken();

      const response = await fetch(`${API_URL}/api/generate-message`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: debtor.name,
          amount: debtor.amount,
          dueDate: debtor.dueDate,
          daysOverdue: debtor.daysOverdue,
          description: debtor.description,
          tone: selectedTone,
          companyName: config.companyName,
          paymentMethods: config.paymentMethods,
          pixKey: config.pixKey,
          customSignature: config.customSignature,
          customFriendlyPrompt: config.promptFriendly,
          customFormalPrompt: config.promptFormal,
          customUrgentPrompt: config.promptUrgent,
          customNegotiationPrompt: config.promptNegotiation,
          customFriendlyTemplate: config.templateFriendly,
          customFormalTemplate: config.templateFormal,
          customUrgentTemplate: config.templateUrgent,
          customNegotiationTemplate: config.templateNegotiation
        })
      });

      if (!response.ok) {
        throw new Error("Não foi possível gerar a resposta do servidor.");
      }

      const data = await response.json();
      
      // Update customMessage in Firestore or Local Storage
      if (currentUser.isDemo) {
        const updated = debtors.map(d => {
          if (d.id === targetId) {
            return {
              ...d,
              customMessage: data.text,
              tone: selectedTone
            };
          }
          return d;
        });
        setDebtors(updated);
        localStorage.setItem("wafort_debtors_db_demo", JSON.stringify(updated));
      } else {
        const debtorRef = doc(db, "users", currentUser.uid, "debtors", targetId);
        await updateDoc(debtorRef, {
          customMessage: data.text,
          tone: selectedTone
        });
      }

    } catch (error) {
      console.error("Erro na geração da IA:", error);
      // Fallback local logic already handled inside the server so we won't get stuck, 
      // but if the network completely fails:
      showAlert("Houve uma inconsistência de conexão. No entanto, o sistema autogerará um modelo estruturado off-line.", "Instabilidade de Rede");
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  // Generate for all currently visible / unqualified debtors on demand
  const generateAIForVisibleIncomplete = async () => {
    const pendingGeneration = filteredAndSortedDebtors.filter(d => !d.customMessage && d.status !== 'paid');
    if (pendingGeneration.length === 0) {
      showAlert("Todos os contatos filtrados já possuem mensagens geradas.", "Régua Fiscal Atualizada");
      return;
    }

    setGlobalMessageStatus(`Processando ${pendingGeneration.length} mensagens via IA da WA Fort...`);
    setIsGeneratingMessage(true);

    for (const debtor of pendingGeneration) {
      await generateAIMessageForDebtor(debtor.id);
    }

    setGlobalMessageStatus(null);
    setIsGeneratingMessage(false);
  };

  // Triggered when active client message changes
  const handleActiveMessageChange = async (newVal: string) => {
    if (!currentUser || !activeDebtorId) return;
    
    if (currentUser.isDemo) {
      const updated = debtors.map(d => {
        if (d.id === activeDebtorId) {
          return { ...d, customMessage: newVal };
        }
        return d;
      });
      setDebtors(updated);
      localStorage.setItem("wafort_debtors_db_demo", JSON.stringify(updated));
      return;
    }

    try {
      const debtorRef = doc(db, "users", currentUser.uid, "debtors", activeDebtorId);
      await updateDoc(debtorRef, { customMessage: newVal });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}/debtors/${activeDebtorId}`);
    }
  };

  // Change tone of active debtor and regenerate
  const handleToneChange = async (newTone: CollectionTone) => {
    if (!activeDebtor || !currentUser) return;
    
    if (currentUser.isDemo) {
      const updated = debtors.map(d => {
        if (d.id === activeDebtorId) {
          return { ...d, tone: newTone };
        }
        return d;
      });
      setDebtors(updated);
      localStorage.setItem("wafort_debtors_db_demo", JSON.stringify(updated));
      await generateAIMessageForDebtor(activeDebtorId, newTone);
      return;
    }

    try {
      const debtorRef = doc(db, "users", currentUser.uid, "debtors", activeDebtorId);
      await updateDoc(debtorRef, { tone: newTone });
      // Trigger AI generation with new tone
      await generateAIMessageForDebtor(activeDebtorId, newTone);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}/debtors/${activeDebtorId}`);
    }
  };

  // Triggered when adding imported row lists
  const handleImportDebtors = async (newItems: Omit<Debtor, "id" | "daysOverdue">[]) => {
    if (!currentUser) return;

    const formatted = newItems.map((item, idx) => ({
      ...item,
      id: `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      daysOverdue: calculateDaysDifference(item.dueDate)
    }));

    if (currentUser.isDemo) {
      const updated = [...debtors, ...formatted];
      setDebtors(updated);
      localStorage.setItem("wafort_debtors_db_demo", JSON.stringify(updated));
      if (formatted.length > 0) {
        setActiveDebtorId(formatted[0].id);
      }
      return;
    }

    try {
      const batch = writeBatch(db);
      const addedIds: string[] = [];
      formatted.forEach((item) => {
        const debtorRef = doc(db, "users", currentUser!.uid, "debtors", item.id);
        const { id, ...data } = item;
        batch.set(debtorRef, data);
        addedIds.push(item.id);
      });

      await batch.commit();
      if (addedIds.length > 0) {
        setActiveDebtorId(addedIds[0]);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/debtors`);
    }
  };

  const handleLoadDemoData = async () => {
    if (!currentUser) return;

    const formatted = DEMO_DEBTORS.map(d => ({
      ...d,
      daysOverdue: calculateDaysDifference(d.dueDate)
    }));

    if (currentUser.isDemo) {
      setDebtors(formatted);
      localStorage.setItem("wafort_debtors_db_demo", JSON.stringify(formatted));
      if (formatted.length > 0) {
        setActiveDebtorId(formatted[0].id);
      }
      return;
    }

    try {
      const batch = writeBatch(db);
      const addedIds: string[] = [];
      formatted.forEach((d, idx) => {
        const docId = `${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`;
        const debtorRef = doc(db, "users", currentUser!.uid, "debtors", docId);
        const { id, ...data } = d;
        batch.set(debtorRef, data);
        addedIds.push(docId);
      });

      await batch.commit();
      if (addedIds.length > 0) {
        setActiveDebtorId(addedIds[0]);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}/debtors`);
    }
  };

  const handleUpdateStatus = async (targetId: string, newStatus: DebtStatus) => {
    if (!currentUser) return;

    // Authorization checks
    if (newStatus === 'paid' && !hasPermission('Aprovar')) {
      showAlert("Acesso negado. Você não possui a permissão 'Aprovar' necessária para quitar faturas.", "Restrição de Acesso");
      return;
    }
    if (newStatus !== 'paid' && !hasPermission('Editar')) {
      showAlert("Acesso negado. Você não possui a permissão 'Editar' necessária para atualizar status de faturas.", "Restrição de Acesso");
      return;
    }

    // Track original status before marking to allow instant precise undo
    const currentDebtor = debtors.find(d => d.id === targetId);
    if (currentDebtor) {
      setPreviousDebtStatuses(prev => ({
        ...prev,
        [targetId]: currentDebtor.status
      }));
    }

    if (currentUser.isDemo) {
      const updated = debtors.map(d => {
        if (d.id === targetId) {
          return { ...d, status: newStatus };
        }
        return d;
      });
      setDebtors(updated);
      localStorage.setItem("wafort_debtors_db_demo", JSON.stringify(updated));
      return;
    }

    try {
      const debtorRef = doc(db, "users", currentUser.uid, "debtors", targetId);
      await updateDoc(debtorRef, { status: newStatus });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}/debtors/${targetId}`);
    }
  };

  const handleDeleteDebtor = (targetId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasPermission('Excluir')) {
      showAlert("Acesso negado. Você não possui a permissão 'Excluir' para remover contatos.", "Restrição de Acesso");
      return;
    }
    showConfirm(
      "Tem certeza de que deseja remover este cadastro de inadimplente da WA Fort?",
      async () => {
        if (!currentUser) return;

        if (currentUser.isDemo) {
          const filtered = debtors.filter(d => d.id !== targetId);
          setDebtors(filtered);
          localStorage.setItem("wafort_debtors_db_demo", JSON.stringify(filtered));
          if (activeDebtorId === targetId) {
            if (filtered.length > 0) {
              setActiveDebtorId(filtered[0].id);
            } else {
              setActiveDebtorId("");
            }
          }
          return;
        }

        try {
          const debtorRef = doc(db, "users", currentUser.uid, "debtors", targetId);
          await deleteDoc(debtorRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/debtors/${targetId}`);
        }
      },
      "Excluir Inadimplente"
    );
  };

  const handleDeleteAllDebtors = () => {
    if (!hasPermission('Excluir')) {
      showAlert("Acesso negado. Você não possui a permissão 'Excluir' para limpar a base.", "Restrição de Acesso");
      return;
    }
    showConfirm(
      "ATENÇÃO: Tem certeza de que deseja apagar absolutamente TODOS os inadimplentes cadastrados no painel? Esta ação limpará todo o histórico de exemplos e testes.",
      async () => {
        if (!currentUser) return;

        if (currentUser.isDemo) {
          setDebtors([]);
          localStorage.setItem("wafort_debtors_db_demo", JSON.stringify([]));
          setActiveDebtorId("");
          return;
        }

        try {
          const batch = writeBatch(db);
          debtors.forEach(d => {
            const debtorRef = doc(db, "users", currentUser!.uid, "debtors", d.id);
            batch.delete(debtorRef);
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${currentUser.uid}/debtors`);
        }
      },
      "Apagar Todos os Contatos"
    );
  };

  // Action: Launch WhatsApp Web redirect and update state
  const handleSendWhatsAppWeb = (debtor: Debtor) => {
    const textToSend = debtor.customMessage || "Olá " + debtor.name + ", por favor entre em contato conosco para falarmos de seus serviços pendentes.";
    const urlEncodedText = encodeURIComponent(textToSend);
    const cleanPhone = formatWhatsAppNumber(debtor.phone);
    
    // Standard WhatsApp Web API is highly reliable
    const whatsappUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${urlEncodedText}`;
    
    // Auto-mark as notified since we are opening the tab
    if (debtor.status === 'pending') {
      handleUpdateStatus(debtor.id, 'notified');
    }

    // Open target window
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  // Function to insert customized placeholder tags directly in the editor textarea
  const handleInsertPlaceholder = (type: "name" | "amount" | "dueDate" | "description" | "pixKey" | "company") => {
    if (!activeDebtor) return;
    
    let toInsert = "";
    const formattedAmount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activeDebtor.amount);
    const formattedDate = activeDebtor.dueDate.split('-').reverse().join('/');

    switch (type) {
      case "name":
        toInsert = activeDebtor.name;
        break;
      case "amount":
        toInsert = formattedAmount;
        break;
      case "dueDate":
        toInsert = formattedDate;
        break;
      case "description":
        toInsert = activeDebtor.description;
        break;
      case "pixKey":
        toInsert = config.pixKey || "Chave Pix";
        break;
      case "company":
        toInsert = config.companyName;
        break;
    }

    const currentMsg = activeDebtor.customMessage || "";
    const textEl = document.getElementById("message-editor-textarea") as HTMLTextAreaElement;
    if (textEl) {
      const start = textEl.selectionStart;
      const end = textEl.selectionEnd;
      const updatedMsg = currentMsg.substring(0, start) + toInsert + currentMsg.substring(end);
      handleActiveMessageChange(updatedMsg);
      
      // Keep textarea focused and place cursor right after the text
      setTimeout(() => {
        textEl.focus();
        const cursorPosition = start + toInsert.length;
        textEl.setSelectionRange(cursorPosition, cursorPosition);
      }, 50);
    } else {
      handleActiveMessageChange(currentMsg + " " + toInsert);
    }
  };

  // Function to copy custom made script to clipboard
  const handleCopyMessageToClipboard = () => {
    if (!activeDebtor || !activeDebtor.customMessage) return;
    navigator.clipboard.writeText(activeDebtor.customMessage);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  // Safe handler to unlock financial workstation
  const handleUnlockTerminal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const correctPin = config.securityPin || "1234";
    if (pinInput === correctPin) {
      setIsTerminalLocked(false);
      setPinInput("");
      setPinError(null);
    } else {
      setPinError("PIN operacional de segurança incorreto. Tente novamente.");
      setPinInput("");
    }
  };

  // Filter and matching searches
  const filteredAndSortedDebtors = debtors
    .filter(d => {
      // Metric Filter Click matching
      if (activeFilter !== "all" && d.status !== activeFilter) {
        return false;
      }
      
      // Text input match
      const search = searchQuery.toLowerCase().trim();
      if (!search) return true;

      return (
        d.name.toLowerCase().includes(search) ||
        d.phone.includes(search) ||
        d.description.toLowerCase().includes(search) ||
        d.amount.toString().includes(search)
      );
    })
    .sort((a, b) => {
      if (sortBy === "days") {
        return b.daysOverdue - a.daysOverdue; // most delayed first
      } else if (sortBy === "value_desc") {
        return b.amount - a.amount; // highest amount first
      } else if (sortBy === "value_asc") {
        return a.amount - b.amount; // lowest amount first
      }
      return 0;
    });

  // Auto-fill active custom message if empty on startup or switch
  useEffect(() => {
    if (activeDebtor && !activeDebtor.customMessage) {
      generateAIMessageForDebtor(activeDebtor.id);
    }
  }, [activeDebtorId]);

  if (isAuthLoading || (currentUser && isProfileLoading)) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(#1E3A8A_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-15" />
        <div className="bg-[#131D35] border border-brand-gold/20 rounded-3xl p-8 max-w-sm w-full shadow-2xl relative z-10 flex flex-col items-center text-center">
          <RefreshCw className="w-10 h-10 text-brand-gold animate-spin mb-4" />
          <h3 className="font-display font-medium text-white text-base tracking-tight mb-1">
            Conectando ao Servidor Seguro
          </h3>
          <p className="text-xs text-slate-400">
            Autenticando sessão e carregando perfil...
          </p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(#1E3A8A_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-15" />
        
        <div className="bg-[#131D35] border-2 border-brand-gold/30 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 flex flex-col items-center">
          
          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <img 
              src="https://i.ibb.co/21BbKLMF/setor-de-cobran-as-3.png" 
              alt="WA Fort Setor de Cobranças" 
              className="h-28 md:h-32 w-auto object-contain rounded-xl transition-all duration-300 hover:scale-105"
              referrerPolicy="no-referrer"
            />
          </div>

          <h1 className="font-display font-black text-2xl text-center text-white tracking-tight uppercase mb-2">
            WA FORT <span className="text-[#C5A021]">Cobrança</span>
          </h1>
          <p className="text-center text-slate-300 text-xs leading-relaxed mb-8 max-w-[320px]">
            Portal Integrado de Cobrança, Recuperação de Crédito de Inadimplentes e Conciliação WA Fort.
          </p>

          {authDomainError && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl w-full text-left">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Configuração de Domínio Necessária
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-normal">
                    Este link de visualização dinâmica do AI Studio roda sob um domínio isolado do Google Cloud que precisa ser adicionado no Console do seu Firebase:
                  </p>
                  <div className="my-2 p-2 bg-[#0F172A] border border-slate-700 rounded-xl font-mono text-[10px] text-amber-400 select-all break-all text-center font-bold">
                    {authDomainError}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    Acesse o seu console Firebase ➔ Authentication ➔ aba Configurações ➔ Domínios Autorizados e adicione o endereço acima.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs py-3.5 px-6 rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] cursor-pointer border border-slate-200"
          >
            {/* Google Vector Icon */}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Entrar com Conta Google
          </button>

          <div className="flex items-center justify-center gap-2 my-4 w-full">
            <hr className="border-slate-800 w-full" />
            <span className="text-[9px] font-black tracking-widest text-slate-500 shrink-0 uppercase">OU</span>
            <hr className="border-slate-800 w-full" />
          </div>

          <button
            type="button"
            onClick={handleEnterDemoMode}
            className="w-full flex items-center justify-center gap-2 bg-[#1A253E] hover:bg-[#253558] text-brand-gold border border-brand-gold/20 font-bold text-xs py-3 px-6 rounded-2xl shadow-md transition-all active:scale-[0.98] cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            Ativar Modo Operador Local (Sem Firebase)
          </button>

          <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-800 pt-6 w-full text-[10px] text-slate-400">
            <span className="shrink-0 flex items-center gap-1 text-slate-500 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-[#C5A021]" />
              SESSÃO HIGH-SECURITY
            </span>
            <span>|</span>
            <span className="text-slate-500 font-mono">ENCRYPTED END-TO-END</span>
          </div>

        </div>
      </div>
    );
  }

  if (currentUser && !isAdminVerified) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-4">
        <div className="absolute inset-0 bg-[radial-gradient(#1E3A8A_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-15" />
        
        <form 
          onSubmit={handleAdminSubmit}
          className="bg-[#131D35] border-2 border-brand-gold/30 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 flex flex-col"
        >
          {/* Logo */}
          <div className="flex items-center justify-center mb-6">
            <img 
              src="https://i.ibb.co/21BbKLMF/setor-de-cobran-as-3.png" 
              alt="WA Fort Setor de Cobranças" 
              className="h-24 w-auto object-contain rounded-xl"
              referrerPolicy="no-referrer"
            />
          </div>

          <h2 className="font-display font-black text-xl text-center text-white tracking-tight uppercase mb-1">
            Verificação de Segurança
          </h2>
          <p className="text-center text-slate-300 text-xs mb-6">
            Olá, <span className="text-brand-gold font-bold">{currentUser.displayName || currentUser.email}</span>. Digite suas credenciais administrativas de operador para liberar o acesso ao terminal de cobrança.
          </p>

          {adminError && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500/40 rounded-xl text-red-200 text-xs text-center font-semibold">
              {adminError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">
                Usuário Administrativo
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  value={adminLoginInput}
                  onChange={(e) => setAdminLoginInput(e.target.value)}
                  placeholder="Nome de usuário (ex: wafort)"
                  className="w-full bg-[#0F172A] border border-slate-700 focus:border-brand-gold text-white text-xs rounded-xl pl-9 pr-3 py-3 outline-none transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1.5">
                Senha de Acesso ao Painel
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Digite a senha admin"
                  className="w-full bg-[#0F172A] border border-slate-700 focus:border-brand-gold text-white text-xs rounded-xl pl-9 pr-3 py-3 outline-none transition"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full mt-6 bg-[#C5A021] hover:bg-[#D4AF37] text-slate-950 font-black text-xs py-3.5 px-6 rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            Liberar Terminal
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full mt-3 bg-transparent hover:bg-white/5 border border-slate-700 hover:border-slate-600 text-slate-400 hover:text-white text-xs py-2 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Alterar Operador / Sair
          </button>

          <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-800 pt-4 text-[9px] text-slate-500 font-mono">
            <span>SECURE GATEWAY</span>
            <span>•</span>
            <span>MFA OPERATOR ENFORCED</span>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-slate flex flex-col selection:bg-brand-blue/10">
      
      {/* HEADER RAIL - Professional navy blue background, with clean white text and gold border & minor accents */}
      <header className="bg-brand-blue text-white py-4 px-6 shadow-md border-b-2 border-brand-gold relative">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo Brand Brand Section - Space Grotesk / Inter pairings */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center justify-center shrink-0">
              <img 
                src="https://i.ibb.co/21BbKLMF/setor-de-cobran-as-3.png" 
                alt="WA Fort Setor de Cobranças" 
                className="h-20 md:h-24 w-auto object-contain rounded-lg transition-transform duration-300 hover:scale-105"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-display font-bold text-xl tracking-tight text-white uppercase">
                  WA FORT <span className="text-brand-gold font-light">Cobrança</span>
                </span>
                <span className="text-[10px] bg-emerald-600 font-bold px-1.5 py-0.5 rounded text-white tracking-widest uppercase">
                  IA ativa
                </span>
                <span className="text-[10px] bg-white/10 font-bold px-1.5 py-0.5 rounded text-brand-gold font-mono">
                  v2.4.1
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                Sistema Integrado de Conciliação e Recuperação de Crédito Semi-Automático
              </p>
            </div>
          </div>

          {/* Action Center - Operator badge, Config, Lock, Import, Sample Mocks */}
          <div className="flex items-center flex-wrap gap-2.5">
            
            {/* Operator Display Badge */}
            <div className="flex items-center gap-2 bg-white/10 pl-2 pr-3 py-1.5 rounded-xl border border-white/5">
              {currentUser.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt={currentUser.displayName || "Operador"} 
                  className="w-6 h-6 rounded-full border border-brand-gold"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 rounded-full bg-brand-gold/20 flex items-center justify-center text-brand-gold text-[10px] font-bold uppercase">
                  {currentUser.displayName ? currentUser.displayName.slice(0, 2) : "OP"}
                </div>
              )}
              <div className="flex flex-col text-left">
                <span className="text-[10px] font-black text-white leading-none">
                  {currentUser.displayName || "Painel Operador"}
                </span>
                <span className="text-[8px] text-blue-200 leading-none mt-0.5 font-medium">
                  {currentUser.email}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-2 p-1 hover:bg-white/15 hover:text-red-300 rounded text-blue-200 transition cursor-pointer"
                title="Sair do painel e encerrar sessão"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
            <button
              onClick={() => setIsTerminalLocked(true)}
              className="px-3 py-2 text-xs font-semibold bg-red-600/30 hover:bg-red-600/45 border border-red-500/20 text-red-200 hover:text-white rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
              title="Travar segurança do painel imediatamente contra olhares terceiros"
            >
              <Lock className="w-3.5 h-3.5 text-red-300 shrink-0" />
              <span>Bloquear Terminal</span>
            </button>

            {currentUser.isDemo && (
              <div className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/5">
                <span className="text-[10px] uppercase font-bold text-slate-300 shrink-0">Simular Perfil:</span>
                <select
                  value={demoRole}
                  onChange={(e) => setDemoRole(e.target.value as UserRole)}
                  className="bg-brand-blue border border-slate-700 text-white text-[10px] rounded-lg p-1.5 font-bold outline-none cursor-pointer focus:border-brand-gold"
                >
                  <option value="Administrador">Administrador</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Financeiro">Financeiro</option>
                  <option value="Operador">Operador</option>
                  <option value="Auditor">Auditor</option>
                </select>
              </div>
            )}

            {hasPermission('Editar') && (
              <button
                onClick={() => setIsSettingsModalOpen(true)}
                className="px-3 py-2 text-xs font-semibold bg-white/10 hover:bg-white/15 border border-white/10 text-white hover:text-brand-gold rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>Dados da WA Fort</span>
              </button>
            )}

            <button
              id="reports-trigger"
              onClick={() => setIsReportsModalOpen(true)}
              className="px-3 py-2 text-xs font-bold bg-[#EAB308]/15 hover:bg-[#EAB308]/25 border border-brand-gold/30 text-brand-gold hover:text-white rounded-xl flex items-center space-x-1.5 transition cursor-pointer"
              title="Baixar relatórios de créditos recuperados, taxas de sucesso e tabelas XLS"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-brand-gold shrink-0 animate-pulse" />
              <span>Relatórios & Caixa</span>
            </button>
            
            {hasPermission('Criar') && (
              <button
                id="import-trigger"
                onClick={() => setIsImportModalOpen(true)}
                className="px-4 py-2 text-xs font-bold bg-brand-gold hover:bg-[#b08e1a] text-white rounded-xl flex items-center space-x-1.5 transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Novo Inadimplente</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* SUB-BAR CURRENT AT - Displays time metadata for credit desk clerks */}
      <div className="bg-brand-blue/5 py-2 px-6 border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-[11px] text-slate-500 font-medium">
          <div className="flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Turno Operacional Local</span>
          </div>
          <div className="font-mono text-slate-650 bg-white/80 px-2 py-0.5 rounded border border-slate-200/80 shadow-xs">
            2026-06-02 | UTC 14:36
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col">
        
        {/* STATS INDICATORS DASHBOARD */}
        <SummaryStats 
          summary={summary} 
          onFilterChange={(filter) => setActiveFilter(filter)} 
          activeFilter={activeFilter} 
        />

        {/* Mobile View Toggle Tabs (ONLY visible on mobile/tablets) */}
        <div className="flex lg:hidden bg-slate-100 p-1.5 rounded-xl mb-4 border border-slate-200 shadow-sm">
          <button
            onClick={() => setMobileTab("list")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all cursor-pointer ${
              mobileTab === "list"
                ? "bg-brand-blue text-white shadow-xs font-black"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Lista de Cobranças ({filteredAndSortedDebtors.length})
          </button>
          <button
            onClick={() => setMobileTab("editor")}
            className={`flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
              mobileTab === "editor"
                ? "bg-brand-blue text-white shadow-xs font-black"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>Painel de Disparo</span>
            {activeDebtor && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-black truncate max-w-[90px] ${mobileTab === 'editor' ? 'bg-brand-gold/20 text-brand-gold' : 'bg-slate-200 text-slate-600'}`}>
                {activeDebtor.name.split(" ")[0]}
              </span>
            )}
          </button>
        </div>

        {/* WORKSPACE AREA - SPLIT SCREEN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1 min-h-[500px]">
          
          {/* LEFT COLUMN: CONTACTS LIST (60% Desktop) */}
          <section className={`lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden ${
            mobileTab === "list" ? "flex" : "hidden lg:flex"
          }`}>
            
            {/* List filters & header */}
            <div className="p-4 border-b border-slate-150 bg-slate-50/50 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar pelo nome, telefone ou descrição..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-blue/15 focus:border-brand-blue bg-white text-slate-800"
                />
              </div>

              {/* Sorting and Actions */}
              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-600 focus:outline-none font-medium"
                >
                  <option value="days">Mais Atrasados primeiro</option>
                  <option value="value_desc">Maior Débito</option>
                  <option value="value_asc">Menor Débito</option>
                </select>

                {/* Bulk AI Text Generation Trigger */}
                <button
                  onClick={generateAIForVisibleIncomplete}
                  disabled={isGeneratingMessage}
                  title="Gerar mensagens via inteligência artificial para todos os itens visíveis na tabela que estão pendentes"
                  className="px-3 py-1.5 bg-brand-blue hover:bg-blue-900 text-white disabled:opacity-55 text-xs font-semibold rounded-xl transition flex items-center space-x-1.5 border border-transparent shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-brand-gold" />
                  <span className="hidden sm:inline">Gerar Todos (IA)</span>
                </button>
              </div>

            </div>

            {/* List content area */}
            <div className="flex-1 overflow-y-auto max-h-[580px] divide-y divide-slate-100">
              {debtors.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center justify-center py-16">
                  <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 border border-slate-150 flex items-center justify-center mb-4 text-brand-blue shadow-xs">
                    <Building2 className="w-6 h-6 text-brand-blue" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm">Pronto para Produção!</h4>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">
                    Sua lista de cobranças está limpa e vazia de dados de rascunho. Comece adicionando um inadimplente manualmente ou importando sua lista/PDF.
                  </p>
                  
                  <div className="mt-6 flex flex-col gap-2 w-full max-w-[240px]">
                    <button
                      onClick={() => setIsImportModalOpen(true)}
                      className="w-full py-2 bg-brand-blue hover:bg-blue-900 text-white font-bold text-xs rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs border border-transparent"
                    >
                      <Plus className="w-3.5 h-3.5 text-brand-gold" />
                      <span>Importar Inadimplentes</span>
                    </button>
                    
                    <button
                      onClick={handleLoadDemoData}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition flex items-center justify-center space-x-1.5 cursor-pointer border border-transparent"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                      <span>Carregar Faturas de Simulação</span>
                    </button>
                  </div>
                </div>
              ) : filteredAndSortedDebtors.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                    <Search className="w-6 h-6 text-slate-400" />
                  </div>
                  <h4 className="font-bold text-slate-700 text-sm">Nenhum inadimplente encontrado</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Nenhum registro corresponde aos filtros selecionados. Tente alterar a busca ou importe mais faturas de faturamento.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setActiveFilter("all");
                    }}
                    className="mt-4 px-3.5 py-1.5 text-xs text-brand-blue font-semibold border border-slate-200 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                  >
                    Redefinir Filtros
                  </button>
                </div>
              ) : (
                filteredAndSortedDebtors.map((debtor) => {
                  const isActive = debtor.id === activeDebtorId;
                  const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(debtor.amount);
                  
                  return (
                    <div
                      key={debtor.id}
                      onClick={() => {
                        setActiveDebtorId(debtor.id);
                        setMobileTab("editor");
                      }}
                      className={`p-4 transition cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                        isActive 
                          ? "bg-slate-50 border-l-4 border-brand-gold shadow-xs" 
                          : "hover:bg-slate-50/50 border-l-4 border-transparent"
                      }`}
                    >
                      {/* Name, descriptions, overdue indicator */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-slate-800 text-sm truncate">
                            {debtor.name}
                          </h4>
                          
                          {/* Status Tag badge */}
                          {debtor.status === 'pending' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-red-100 text-red-600 rounded">
                              Pendente
                            </span>
                          )}
                          {debtor.status === 'notified' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                              Notificado
                            </span>
                          )}
                          {debtor.status === 'negotiating' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-purple-100 text-purple-800 rounded">
                              Acordo
                            </span>
                          )}
                          {debtor.status === 'paid' && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">
                              Pago
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-500 mt-1 truncate">
                          {debtor.description}
                        </p>

                        <div className="flex items-center-wrap gap-x-3 text-[11px] text-slate-400 mt-2">
                          <span className="font-mono text-slate-500 font-semibold bg-slate-100 px-1 rounded">
                            {formatPhoneNumberDisplay(debtor.phone)}
                          </span>
                          <span>•</span>
                          <span className="flex items-center text-red-650 font-semibold">
                            <Clock className="w-3 h-3 text-red-500 mr-1 shrink-0" />
                            Atraso: {debtor.daysOverdue} dias
                          </span>
                        </div>
                      </div>

                      {/* Rightmost actions: Debt value, remove button and quick shoot button */}
                      <div className="flex items-center space-x-4 shrink-0 justify-between w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-2.5 md:pt-0">
                        <div className="text-right md:min-w-[100px]">
                          <div className="text-sm font-extrabold text-[#1E293B] font-display">
                            {formattedValue}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Venc. {debtor.dueDate.split('-').reverse().join('/')}
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          {/* Quick delete */}
                          {hasPermission('Excluir') && (
                            <button
                              onClick={(e) => handleDeleteDebtor(debtor.id, e)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 border border-transparent rounded-xl transition cursor-pointer flex items-center justify-center shrink-0 shadow-xs"
                              title="Apagar este inadimplente permanentemente do sistema"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Quick WhatsApp open action on right side */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendWhatsAppWeb(debtor);
                            }}
                            className={`p-2 rounded-xl transition cursor-pointer ${
                              debtor.status === 'paid'
                                ? "bg-slate-100 text-slate-400"
                                : "bg-emerald-100 text-emerald-700 hover:bg-brand-blue hover:text-white"
                            }`}
                            title="Disparar Mensagem de Cobrança"
                            disabled={debtor.status === 'paid'}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
            </div>

            {/* List footer stats info */}
            <div className="p-3 bg-slate-50 text-[11px] text-slate-500 border-t border-slate-100 flex justify-between items-center font-medium">
              <span>Filtro ativo: <b className="text-slate-800 capitalize">{activeFilter === 'all' ? 'Todos' : activeFilter}</b></span>
              <div className="flex items-center space-x-3">
                <span>Total listado: <b>{filteredAndSortedDebtors.length} contatos</b></span>
                {debtors.length > 0 && hasPermission('Excluir') && (
                  <button
                    onClick={handleDeleteAllDebtors}
                    className="text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 px-2.5 py-1 rounded-xl transition font-bold text-[10px] cursor-pointer flex items-center space-x-1 shadow-sm"
                    title="Excluir permanentemente todos os inadimplentes atuais para começar limpo"
                  >
                    <Trash2 className="w-3 h-3 shrink-0" />
                    <span>Apagar Todos os Contatos</span>
                  </button>
                )}
              </div>
            </div>

          </section>
            
          {/* RIGHT COLUMN: INTERACTIVE DISPATCH DESK & LIVE WhatsApp MESSAGE PREVIEW (40% Desktop) */}
          <section className={`lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full sticky top-4 ${
            mobileTab === "editor" ? "flex" : "hidden lg:flex"
          }`}>
            
            {/* Section Header */}
            <div className="bg-brand-blue text-white p-4 border-b-2 border-brand-gold flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setMobileTab("list")}
                  className="lg:hidden p-1 mr-1 bg-white/10 hover:bg-white/20 rounded text-white transition flex items-center justify-center cursor-pointer"
                  title="Voltar para a Lista de Cobrança"
                >
                  <ChevronLeft className="w-4 h-4 text-brand-gold" />
                </button>
                <MessageCircle className="w-4 h-4 text-brand-gold" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-100">Painel de Disparo Individual</h3>
              </div>
              <span className="text-[10px] font-semibold bg-brand-gold/10 text-brand-gold border border-brand-gold/20 px-2 py-0.5 rounded">
                Semi-Automático
              </span>
            </div>

            {activeDebtor ? (
              <div className="p-5 flex-1 flex flex-col space-y-4">
                
                {/* Visual Header card showing selected debtor details */}
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider font-extrabold text-brand-blue">
                        Área de Trabalho Ativa
                      </span>
                      <h4 className="font-bold text-sm text-slate-800 font-display mt-0.5">{activeDebtor.name}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-semibold font-mono mt-1 font-mono">
                        {formatPhoneNumberDisplay(activeDebtor.phone)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400 block uppercase font-medium">Débito</span>
                      <span className="text-base font-extrabold text-brand-blue font-display">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activeDebtor.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200 text-[11px]">
                    <div>
                      <span className="text-slate-400 block font-medium">Referente a:</span>
                      <span className="text-slate-750 font-semibold truncate block" title={activeDebtor.description}>
                        {activeDebtor.description}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Dias em atraso:</span>
                      <span className="text-red-650 font-extrabold flex items-center">
                        <Clock className="w-3 h-3 mr-0.5 text-red-500 shrink-0" />
                        {activeDebtor.daysOverdue} dias
                      </span>
                    </div>
                  </div>
                </div>

                {/* COLLECTION TONE CONTROL SETTING */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Régua de Cobrança (Tom do Texto)
                    </label>
                    <span className="text-[10px] text-slate-400">Determina a rigidez do script</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      { val: "friendly", text: "Amigável", desc: "Sensível", icon: "🌸" },
                      { val: "formal", text: "Profissional", desc: "Padrão", icon: "👔" },
                      { val: "urgent", text: "Urgência", desc: "Urgente", icon: "⚠️" },
                      { val: "negotiation", text: "Acordo", desc: "Flexível", icon: "💸" }
                    ].map((item) => (
                      <button
                        key={item.val}
                        onClick={() => handleToneChange(item.val as CollectionTone)}
                        disabled={isGeneratingMessage}
                        className={`py-1.5 px-1 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition text-center ${
                          activeDebtor.tone === item.val
                            ? "bg-brand-blue text-white border-transparent"
                            : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        <span className="text-xs">{item.icon}</span>
                        <span className="text-xs font-bold block mt-0.5">{item.text}</span>
                        <span className={`text-[9px] block ${
                          activeDebtor.tone === item.val ? "text-blue-200" : "text-slate-400"
                        }`}>
                           {item.desc}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* LIVE SIMULATED WhatsApp PREVIEW SCREEN BOX */}
                <div className="flex-1 flex flex-col">
                  
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                      <span>Texto Pré-Preenchido</span>
                      <span className="text-[10px] text-brand-blue bg-blue-50 px-1.5 py-0.2 rounded font-semibold flex items-center">
                        <Sparkle className="w-3 h-3 text-brand-gold mr-0.5" /> IA Ativa
                      </span>
                    </label>
                    
                    {/* Manual Regenerate IA content */}
                    <button
                      onClick={() => generateAIMessageForDebtor(activeDebtor.id)}
                      disabled={isGeneratingMessage || !hasPermission('Editar')}
                      className="text-[10px] text-brand-blue hover:text-blue-900 font-bold flex items-center space-x-1 disabled:opacity-40 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 mr-0.5 ${isGeneratingMessage ? 'animate-spin text-amber-500' : ''}`} />
                      <span>Regerar Texto IA</span>
                    </button>
                  </div>

                  {/* Click to Inject Variables Shortcuts */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2 bg-slate-50 p-2 rounded-xl border border-slate-150">
                    <span className="text-[10px] text-slate-500 font-semibold shrink-0">Inserir no cursor:</span>
                    {[
                      { type: "name", label: "👤 Cliente" },
                      { type: "amount", label: "💸 Valor" },
                      { type: "dueDate", label: "📅 Vencimento" },
                      { type: "description", label: "📶 Serviço" },
                      { type: "pixKey", label: "🔑 Chave Pix" },
                      { type: "company", label: "🏢 WA Fort" }
                    ].map((badge) => (
                      <button
                        key={badge.type}
                        onClick={() => handleInsertPlaceholder(badge.type as any)}
                        type="button"
                        className="text-[9px] bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-medium px-2 py-0.5 rounded-lg cursor-pointer transition shadow-xs hover:border-[#1E3A8A]"
                      >
                        {badge.label}
                      </button>
                    ))}
                  </div>

                  {/* Message editor container styling simulating a real chat bubbler */}
                  <div className="relative border border-slate-200 rounded-xl bg-[#EBE5DE] p-4 flex flex-col flex-1 min-h-[220px] max-h-[350px] shadow-inner overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(#dfdcd6_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointers-events-none" />
                    
                    {/* Simulated Message Bubble */}
                    <div className="relative bg-white text-slate-800 text-xs p-3 rounded-xl rounded-tr-none shadow-xs border border-white/40 max-w-[90%] ml-auto flex-1 flex flex-col">
                      
                      {isGeneratingMessage ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-8">
                          <RefreshCw className="w-6 h-6 animate-spin text-brand-blue" />
                          <p className="text-[11px] text-slate-400 mt-2 font-medium">WA Fort IA está redigindo...</p>
                        </div>
                      ) : (
                        <textarea
                          id="message-editor-textarea"
                          value={activeDebtor.customMessage || ""}
                          onChange={(e) => handleActiveMessageChange(e.target.value)}
                          placeholder="Carregando mensagem de cobrança..."
                          disabled={!hasPermission('Editar')}
                          rows={10}
                          className="w-full h-full bg-transparent resize-none text-[11px] outline-none text-slate-800 focus:outline-none focus:ring-0 select-text leading-relaxed font-sans placeholder:text-slate-400 disabled:opacity-60"
                        />
                      )}

                      {!isGeneratingMessage && (
                        <div className="flex items-center justify-between text-[9px] text-slate-450 mt-2 pt-2 border-t border-slate-100 font-semibold">
                          <button
                            onClick={handleCopyMessageToClipboard}
                            className="bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 font-bold px-2 py-1 rounded-lg flex items-center space-x-1 cursor-pointer transition shadow-xs"
                            title="Copiar texto para área de transferência"
                          >
                            <Copy className="w-2.8 h-2.8 text-[#1E3A8A]" />
                            <span>{copyFeedback ? "Copiado!" : "Copiar Texto"}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status manual modifier buttons */}
                <div>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider block mb-1">
                    Marcar status após contato:
                  </span>
                  <div className="flex gap-1.5">
                    {[
                      { status: 'pending', label: 'Pendente', bg: 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200' },
                      { status: 'notified', label: 'Notificado', bg: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200' },
                      { status: 'negotiating', label: 'Acordo', bg: 'bg-purple-100 hover:bg-purple-200 text-purple-900 border-purple-200' },
                      { status: 'paid', label: 'Pago', bg: 'bg-emerald-100 hover:bg-emerald-250 text-emerald-900 border-emerald-200' }
                    ].map((btn) => (
                      <button
                        key={btn.status}
                        onClick={() => handleUpdateStatus(activeDebtor.id, btn.status as DebtStatus)}
                        disabled={btn.status === 'paid' ? !hasPermission('Aprovar') : !hasPermission('Editar')}
                        className={`flex-1 py-1 px-1 rounded-lg text-xs font-semibold border text-center transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          activeDebtor.status === btn.status
                            ? "ring-2 ring-indigo-500/10 font-black border-slate-400 bg-slate-200 shadow-xs"
                            : `${btn.bg} opacity-70 hover:opacity-100`
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* MAIN ACTION TRIGGER: DISPATCH WHATSAPP & CONFIRM PAYMENT */}
                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  {activeDebtor.status !== 'paid' ? (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(activeDebtor.id, 'paid')}
                      disabled={!hasPermission('Aprovar')}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-md hover:shadow-lg flex items-center justify-center space-x-2 transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-100 shrink-0" />
                      <span>Confirmar Pagamento (Recuperar Dívida) 💸</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-2xl text-center">
                      <span className="text-emerald-800 font-extrabold text-xs flex items-center justify-center gap-1.5 leading-snug">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 animate-ping-once" />
                        PAGAMENTO CONFIRMADO &bull; DÍVIDA RECUPERADA!
                      </span>
                      <p className="text-[10px] text-slate-500 mt-1">Este cliente já foi baixado do status de inadimplente e adicionado às suas métricas financeiras.</p>
                      <button
                        type="button"
                        onClick={() => {
                          const prev = previousDebtStatuses[activeDebtor.id] || 'pending';
                          handleUpdateStatus(activeDebtor.id, prev);
                        }}
                        disabled={!hasPermission('Aprovar')}
                        className="mt-2 text-[10px] text-[#1E3A8A] hover:underline disabled:opacity-50 font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200 cursor-pointer shadow-xs inline-flex items-center gap-1 hover:bg-slate-50 transition"
                      >
                        <span>Desfazer baixa (restaurar como {
                          previousDebtStatuses[activeDebtor.id] === 'pending' ? 'Pendente' :
                          previousDebtStatuses[activeDebtor.id] === 'notified' ? 'Notificado' :
                          previousDebtStatuses[activeDebtor.id] === 'negotiating' ? 'Acordo' : 'Pendente'
                        }) ⬅️</span>
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleSendWhatsAppWeb(activeDebtor)}
                    disabled={isGeneratingMessage}
                    className="w-full py-3 bg-[#25D366] hover:bg-[#1EBE57] disabled:opacity-40 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center space-x-2 transition cursor-pointer"
                  >
                    <Send className="w-4 h-4 shrink-0" />
                    <span>ENVIAR COBRANÇA VIA WHATSAPP WEB</span>
                  </button>
                  <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
                    Ao clicar, o WhatsApp Web abrirá na aba do cliente com o texto pré-preenchido.
                  </p>
                </div>


              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center h-full">
                <HelpCircle className="w-12 h-12 mb-3 text-slate-350" />
                <h4 className="font-bold text-slate-700">Nenhum cliente selecionado</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  Selecione um inadimplente na lista ao lado para iniciar a régua de cobrança automática por WhatsApp.
                </p>
              </div>
            )}

          </section>

        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-500 py-6 px-6 text-center text-xs mt-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 font-medium">
          <p>
            &copy; {new Date().getFullYear()} WA FORT. Todos os direitos reservados.
          </p>
          <div className="flex space-x-4">
            <span className="text-brand-gold">Recuperação de Crédito Inteligente</span>
            <span>-</span>
            <span>Vite + React + Gemini AI</span>
          </div>
        </div>
      </footer>

      {/* MODALS */}
      {isImportModalOpen && (
        <ImportDebtors
          onImport={handleImportDebtors}
          onClose={() => setIsImportModalOpen(false)}
          showAlert={showAlert}
          currentUser={currentUser}
          userProfile={userProfile}
        />
      )}

      {isSettingsModalOpen && (
        <SettingsModal
          config={config}
          onSave={handleSaveConfig}
          onClose={() => setIsSettingsModalOpen(false)}
          userProfile={userProfile}
          currentUser={currentUser}
        />
      )}

      {isReportsModalOpen && (
        <ReportsModal
          debtors={debtors}
          config={config}
          onClose={() => setIsReportsModalOpen(false)}
        />
      )}

      {/* WORKSTATION PIN CODE SECURITY SCREEN */}
      {isTerminalLocked && (
        <div className="fixed inset-0 z-[9999] bg-[#0F172A] flex flex-col items-center justify-center p-4 select-none">
          <div className="absolute inset-0 bg-[radial-gradient(#1E3A8A_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-15 animate-pulse" />
          
          <div className="bg-[#131D35] border-2 border-brand-gold/40 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative z-10 flex flex-col items-center text-center">
            
            {/* Shield and Lock Brand Icon */}
            <div className="w-16 h-16 rounded-full bg-brand-gold/10 border border-brand-gold/30 flex items-center justify-center mb-4 text-[#EAB308]">
              <Lock className="w-8 h-8 animate-pulse" />
            </div>

            <h2 className="text-white font-display font-black text-lg tracking-wide uppercase">
              Terminal Bloqueado
            </h2>
            <p className="text-[11px] text-blue-200 mt-1.5 max-w-[280px]">
              O acesso aos cadastros fiscais de inadimplentes da WA Fort está resguardado por PIN de segurança (padrão LGPD).
            </p>

            {/* Simulated Dot Indicator of keyed numbers */}
            <div className="my-6 w-full">
              <div className="flex justify-center space-x-3 mb-2">
                {[1, 2, 3, 4, 5, 6].map((i) => {
                  const hasCharacter = pinInput.length >= i;
                  return (
                    <div
                      key={i}
                      className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                        hasCharacter 
                          ? "bg-brand-gold scale-110 shadow-[0_0_8px_#EAB308]" 
                          : "bg-slate-705 border border-slate-650 bg-slate-800 scale-100"
                      }`}
                    />
                  );
                })}
              </div>
              
              {pinError ? (
                <p className="text-[11px] text-red-400 font-semibold mt-2">{pinError}</p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-2">Insira sua chave numérica para desbloquear</p>
              )}
            </div>

            {/* 3x4 GRID NUMPAD */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => {
                    if (pinInput.length < 6) {
                      setPinInput(prev => prev + num);
                      setPinError(null);
                    }
                  }}
                  className="w-16 h-14 rounded-xl bg-white/5 hover:bg-white/10 active:bg-brand-gold/20 border border-white/10 text-white font-bold text-xl flex items-center justify-center transition cursor-pointer"
                >
                  {num}
                </button>
              ))}
              
              {/* Reset/Clear button */}
              <button
                type="button"
                onClick={() => {
                  setPinInput("");
                  setPinError(null);
                }}
                className="w-16 h-14 rounded-xl bg-red-900/10 hover:bg-red-900/25 text-red-300 font-bold text-xs flex items-center justify-center transition cursor-pointer border border-red-900/20"
              >
                LIMPAR
              </button>

              {/* Zero digit */}
              <button
                type="button"
                onClick={() => {
                  if (pinInput.length < 6) {
                    setPinInput(prev => prev + "0");
                    setPinError(null);
                  }
                }}
                className="w-16 h-14 rounded-xl bg-white/5 hover:bg-white/10 active:bg-brand-gold/20 border border-white/10 text-white font-bold text-xl flex items-center justify-center transition cursor-pointer"
              >
                0
              </button>

              {/* Backspace button */}
              <button
                type="button"
                onClick={() => {
                  setPinInput(prev => prev.slice(0, -1));
                  setPinError(null);
                }}
                className="w-16 h-14 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold text-lg flex items-center justify-center transition cursor-pointer border border-slate-700"
              >
                ⌫
              </button>
            </div>

            {/* Unlock Button */}
            <button
              onClick={() => handleUnlockTerminal()}
              className="mt-6 w-full py-3.5 bg-brand-gold hover:bg-[#b08e1a] active:bg-[#967713] text-white font-bold text-xs rounded-xl tracking-wider uppercase transition shadow-md flex items-center justify-center space-x-2 cursor-pointer border border-transparent"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Destravar Sistema</span>
            </button>

            <span className="text-[9px] text-slate-500 mt-5 font-mono">
              PIN Padrão de Fábrica: <b className="text-slate-400">1234</b> (Altere nas configurações)
            </span>

          </div>
        </div>
      )}

      {/* CUSTOM DIALOG (ALERT OR CONFIRM) POPUP */}
      {dialog.isOpen && (
        <div className="fixed inset-0 z-[10000] bg-slate-910 bg-opacity-70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative z-10 flex flex-col items-center text-center">
            
            <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4 text-[#D97706]">
              <AlertCircle className="w-6 h-6 animate-pulse" />
            </div>

            <h3 className="font-display font-black text-slate-800 text-base tracking-tight mb-2">
              {dialog.title}
            </h3>
            
            <p className="text-[11px] text-slate-500 leading-relaxed mb-6 max-w-[260px]">
              {dialog.message}
            </p>

            <div className="flex gap-3 w-full">
              {dialog.type === "confirm" ? (
                <>
                  <button
                    type="button"
                    onClick={dialog.onCancel}
                    className="flex-1 py-2.5 text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl transition cursor-pointer"
                  >
                    Não, Voltar
                  </button>
                  <button
                    type="button"
                    onClick={dialog.onConfirm}
                    className="flex-1 py-2.5 text-xs font-black bg-red-600 hover:bg-red-700 text-white rounded-xl transition cursor-pointer shadow-sm"
                  >
                    Sim, Confirmar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={dialog.onConfirm}
                  className="w-full py-2.5 text-xs font-black bg-brand-blue text-white hover:bg-blue-900 rounded-xl transition cursor-pointer shadow-sm"
                >
                  Entendido
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
