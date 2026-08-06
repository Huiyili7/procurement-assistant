import { useState, useEffect, useCallback } from 'react';

const SESSION_KEY = 'procurement_chat_session';
const PHONE_KEY = 'procurement_default_phone';
const ADDRESS_KEY = 'procurement_default_address';
const INIT_KEY = '__procurement_session_init';

const isPageRefresh = !!sessionStorage.getItem(INIT_KEY);
if (isPageRefresh) {
  sessionStorage.removeItem(SESSION_KEY);
}
sessionStorage.setItem(INIT_KEY, '1');
window.addEventListener('beforeunload', () => {
  sessionStorage.removeItem(INIT_KEY);
});

interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  timestamp: string | Date;
  type?: 'transfer_card' | 'image_result' | 'pending_list';
  collected?: Record<string, unknown>;
  imageUrl?: string;
}

interface SessionState {
  messages: ChatMessage[];
  collected: Record<string, unknown>;
  skippedFields: string[];
  currentFieldIndex: number;
  batchItems: { itemName: string; itemBrandModel?: string; itemLink: string; itemQuantity: string; itemUnit: string }[];
  batchMode: boolean;
  batchPreview: boolean;
  transferMode: boolean;
  transferReason: string;
  transferred: boolean;
  urgentMarked: boolean;
  transferPending: boolean;
  validationWarnings: Record<string, string>;
}

function createDefaultMessages(): ChatMessage[] {
  return [
    { role: 'bot', content: '你好，我是采购助手。请描述你要采购的物料，我会自动识别信息，支持批量采购哦。如需定制件、复杂件请转人工。', timestamp: new Date().toISOString() },
  ];
}

function loadSession(): Partial<SessionState> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore parse errors
  }
  return null;
}

function loadDefaultFields(): Record<string, string> {
  const defaults: Record<string, string> = {};
  try {
    const phone = localStorage.getItem(PHONE_KEY);
    if (phone) defaults.contactPhone = phone;
    const address = localStorage.getItem(ADDRESS_KEY);
    if (address) defaults.deliveryAddress = address;
  } catch {
    // ignore
  }
  return defaults;
}

export function saveDefaultFields(collected: Record<string, unknown>): void {
  try {
    if (collected.contactPhone && typeof collected.contactPhone === 'string') {
      localStorage.setItem(PHONE_KEY, collected.contactPhone);
    }
    if (collected.deliveryAddress && typeof collected.deliveryAddress === 'string') {
      localStorage.setItem(ADDRESS_KEY, collected.deliveryAddress);
    }
  } catch {
    // ignore
  }
}

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const s = loadSession();
    return s?.messages || createDefaultMessages();
  });
  const [collected, setCollected] = useState<Record<string, unknown>>(() => {
    const s = loadSession();
    if (s?.collected && Object.keys(s.collected).length > 0) return s.collected;
    return loadDefaultFields();
  });
  const [skippedFields, setSkippedFields] = useState<Set<string>>(() => {
    const s = loadSession();
    return new Set(s?.skippedFields || []);
  });
  const [currentFieldIndex, setCurrentFieldIndex] = useState(() => {
    const s = loadSession();
    return s?.currentFieldIndex ?? 0;
  });
  const [batchItems, setBatchItems] = useState<SessionState['batchItems']>(() => {
    const s = loadSession();
    return s?.batchItems || [];
  });
  const [batchMode, setBatchMode] = useState(() => {
    const s = loadSession();
    return s?.batchMode || false;
  });
  const [batchPreview, setBatchPreview] = useState(() => {
    const s = loadSession();
    return s?.batchPreview || false;
  });
  const [transferMode, setTransferMode] = useState(() => {
    const s = loadSession();
    return s?.transferMode || false;
  });
  const [transferReason, setTransferReason] = useState(() => {
    const s = loadSession();
    return s?.transferReason || '';
  });
  const [transferred, setTransferred] = useState(() => {
    const s = loadSession();
    return s?.transferred || false;
  });
  const [urgentMarked, setUrgentMarked] = useState(() => {
    const s = loadSession();
    return s?.urgentMarked || false;
  });
  const [transferPending, setTransferPending] = useState(() => {
    const s = loadSession();
    return s?.transferPending || false;
  });
  const [validationWarnings, setValidationWarnings] = useState<Record<string, string>>(() => {
    const s = loadSession();
    return s?.validationWarnings || {};
  });

  useEffect(() => {
    const state: SessionState = {
      messages,
      collected,
      skippedFields: Array.from(skippedFields),
      currentFieldIndex,
      batchItems,
      batchMode,
      batchPreview,
      transferMode,
      transferReason,
      transferred,
      urgentMarked,
      transferPending,
      validationWarnings,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  }, [messages, collected, skippedFields, currentFieldIndex, batchItems, batchMode, batchPreview, transferMode, transferReason, transferred, urgentMarked, transferPending, validationWarnings]);

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setMessages(createDefaultMessages());
    setCollected(loadDefaultFields());
    setSkippedFields(new Set());
    setCurrentFieldIndex(0);
    setBatchItems([]);
    setBatchMode(false);
    setBatchPreview(false);
    setTransferMode(false);
    setTransferReason('');
    setTransferred(false);
    setUrgentMarked(false);
    setTransferPending(false);
    setValidationWarnings({});
  }, []);

  return {
    messages, setMessages,
    collected, setCollected,
    skippedFields, setSkippedFields,
    currentFieldIndex, setCurrentFieldIndex,
    batchItems, setBatchItems,
    batchMode, setBatchMode,
    batchPreview, setBatchPreview,
    transferMode, setTransferMode,
    transferReason, setTransferReason,
    transferred, setTransferred,
    urgentMarked, setUrgentMarked,
    transferPending, setTransferPending,
    validationWarnings, setValidationWarnings,
    clearSession,
    saveDefaultFields,
  };
}
